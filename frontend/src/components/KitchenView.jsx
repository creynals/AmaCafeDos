import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, RefreshCw, AlertCircle, Clock, ChefHat, Truck, MapPin,
  Phone, ShoppingBag, ArrowRight, CheckCircle, XCircle,
} from 'lucide-react';
import { api } from '../api';

// Estados activos visibles en cocina (excluye terminales delivered/cancelled/returned).
const KITCHEN_STATUSES = ['pending', 'in_progress', 'out_for_delivery'];

// Tailwind requiere clases estáticas — no usar interpolación dinámica.
const COLUMNS = [
  {
    id: 'pending',
    label: 'Pendientes',
    icon: Clock,
    iconCls: 'text-yellow-400',
    badgeCls: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
    description: 'Esperando inicio de preparación',
  },
  {
    id: 'in_progress',
    label: 'En preparación',
    icon: ChefHat,
    iconCls: 'text-blue-400',
    badgeCls: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
    description: 'Cocina trabajando',
  },
  {
    id: 'out_for_delivery',
    label: 'En reparto',
    icon: Truck,
    iconCls: 'text-purple-400',
    badgeCls: 'bg-purple-400/10 text-purple-400 border-purple-400/30',
    description: 'Saliendo / en camino',
  },
];

const NEXT_ACTION = {
  pending:          { target: 'in_progress',      label: 'Iniciar preparación', icon: ChefHat },
  in_progress:      { target: 'out_for_delivery', label: 'Marcar listo / Enviar', icon: Truck },
  out_for_delivery: { target: 'delivered',        label: 'Confirmar entrega',   icon: CheckCircle },
};

const PAID_REQUIRED_TARGETS = new Set(['in_progress', 'out_for_delivery', 'delivered']);

const PAYMENT_STATUS_LABELS = {
  pending: 'Pago pendiente',
  processing: 'Pago procesando',
  paid: 'Pagado',
  failed: 'Pago falló',
  cancelled: 'Pago cancelado',
  refunded: 'Reembolsado',
};

const REFRESH_MS = 30000;

function formatPrice(price) {
  return `$${Number(price || 0).toLocaleString('es-CL')}`;
}

function minutesAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function formatElapsed(iso) {
  const m = minutesAgo(iso);
  if (m === null) return '-';
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `hace ${h} h` : `hace ${h} h ${rem} min`;
}

function elapsedClass(iso, status) {
  // Color de urgencia: solo aplica a pending / in_progress.
  if (status === 'out_for_delivery') return 'text-purple-400';
  const m = minutesAgo(iso);
  if (m === null) return 'text-ama-text-muted';
  if (m >= 30) return 'text-red-400 font-medium';
  if (m >= 15) return 'text-yellow-400';
  return 'text-ama-text-muted';
}

function ItemsList({ items }) {
  if (!items || items.length === 0) {
    return (
      <p className="text-xs text-ama-text-muted italic">Sin items registrados</p>
    );
  }
  return (
    <ul className="space-y-1">
      {items.map(it => (
        <li key={it.id} className="flex items-start gap-2 text-sm">
          <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-md bg-ama-amber/15 text-ama-amber text-xs font-bold">
            {it.quantity}×
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-ama-text leading-tight">{it.name}</p>
            {it.notes && (
              <p className="text-xs text-yellow-400/90 mt-0.5 italic">
                Nota: {it.notes}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function OrderCard({ order, onAdvance, onCancel, busy }) {
  const action = NEXT_ACTION[order.status];
  const ActionIcon = action?.icon;
  const requiresPaid = action && PAID_REQUIRED_TARGETS.has(action.target);
  const blockedByPayment = requiresPaid && order.payment_status !== 'paid';

  return (
    <article className="bg-ama-card border border-ama-border rounded-xl p-3 hover:border-ama-amber/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-base font-bold text-ama-text">#{order.id}</p>
          <p className={`text-xs ${elapsedClass(order.created_at, order.status)}`}>
            {formatElapsed(order.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-ama-amber">{formatPrice(order.total)}</p>
          <p className="text-xs text-ama-text-muted">{order.item_count} items</p>
        </div>
      </div>

      {/* Cliente / dirección */}
      <div className="border-t border-ama-border/50 pt-2 mb-2 space-y-0.5">
        <p className="text-sm text-ama-text font-medium truncate">
          {order.contact_name || 'Sin nombre'}
        </p>
        {order.contact_phone && (
          <p className="text-xs text-ama-text-muted flex items-center gap-1">
            <Phone size={11} /> {order.contact_phone}
          </p>
        )}
        {(order.address_commune || order.address_city) && (
          <p className="text-xs text-ama-text-muted flex items-start gap-1">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="truncate">
              {[order.address_street, order.address_number, order.address_commune].filter(Boolean).join(' ')}
            </span>
          </p>
        )}
        {order.address_notes && (
          <p className="text-xs text-yellow-400/90 italic mt-1">
            Indicación: {order.address_notes}
          </p>
        )}
      </div>

      {/* Items (foco de la vista de cocina) */}
      <div className="bg-ama-darker/60 border border-ama-border/50 rounded-lg p-2.5 mb-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <ShoppingBag size={12} className="text-ama-amber" />
          <p className="text-xs font-semibold text-ama-text uppercase tracking-wide">
            Productos solicitados
          </p>
        </div>
        <ItemsList items={order.items} />
      </div>

      {/* Estado de pago si no está pagado */}
      {order.payment_status !== 'paid' && (
        <div className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded px-2 py-1 mb-2">
          <AlertCircle size={11} />
          {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2">
        {action && (
          <button
            disabled={busy || blockedByPayment}
            onClick={() => onAdvance(order, action.target)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              blockedByPayment
                ? 'bg-ama-darker text-ama-text-muted border border-ama-border opacity-60 cursor-not-allowed'
                : 'bg-ama-amber text-ama-darker hover:bg-ama-amber/90 disabled:opacity-50 disabled:cursor-wait'
            }`}
            title={blockedByPayment ? 'Requiere pago confirmado' : action.label}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : ActionIcon && <ActionIcon size={12} />}
            <span className="truncate">{action.label}</span>
            {!busy && !blockedByPayment && <ArrowRight size={12} />}
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => onCancel(order)}
          className="px-2.5 py-2 text-xs text-red-400 border border-red-400/30 rounded-lg hover:bg-red-400/10 disabled:opacity-50 cursor-pointer"
          title="Cancelar orden"
        >
          <XCircle size={14} />
        </button>
      </div>
    </article>
  );
}

function CancelDialog({ order, onClose, onConfirm, submitting }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-ama-card border border-ama-border rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-ama-border flex items-center justify-between">
          <p className="text-sm font-semibold text-ama-text">
            Cancelar orden #{order.id}
          </p>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text cursor-pointer">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-ama-text-muted">
            Esta acción cambia el estado a <strong className="text-red-400">cancelada</strong> (terminal). Razón requerida para auditoría.
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Motivo de la cancelación (cliente, stock, error, etc.)"
            className="w-full bg-ama-darker border border-ama-border rounded-lg px-3 py-2 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none resize-none"
          />
        </div>
        <div className="p-4 border-t border-ama-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Volver
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
            className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg font-medium hover:bg-red-500/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Confirmar cancelación
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceDialog({ order, target, onClose, onConfirm, submitting }) {
  const [reason, setReason] = useState('');
  const action = NEXT_ACTION[order.status];
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-ama-card border border-ama-border rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-ama-border flex items-center justify-between">
          <p className="text-sm font-semibold text-ama-text">
            {action?.label} — orden #{order.id}
          </p>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text cursor-pointer">
            <XCircle size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-ama-text-muted">
            Avanzando a <strong className="text-ama-amber">{target}</strong>. Razón requerida para auditoría.
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Comentario del cambio (ej: 'preparación iniciada por turno tarde')"
            className="w-full bg-ama-darker border border-ama-border rounded-lg px-3 py-2 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none resize-none"
          />
        </div>
        <div className="p-4 border-t border-ama-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Volver
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
            className="px-3 py-2 text-sm bg-ama-amber text-ama-darker rounded-lg font-medium hover:bg-ama-amber/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KitchenView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [advanceTarget, setAdvanceTarget] = useState(null); // { order, target }
  const [cancelTarget, setCancelTarget] = useState(null);   // order
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef(null);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.adminOrders({
        status: KITCHEN_STATUSES.join(','),
        sort: 'created_at_asc', // FIFO: más antiguas primero (urgencia)
        limit: 100,
        offset: 0,
      });
      setOrders(data.orders || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error cargando vista cocina:', err);
      setError(err.message || 'Error cargando órdenes activas');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => loadOrders(true), REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadOrders]);

  async function confirmAdvance(reason) {
    if (!advanceTarget) return;
    setSubmitting(true);
    try {
      await api.adminOrderUpdateStatus(advanceTarget.order.id, advanceTarget.target, reason.trim());
      setAdvanceTarget(null);
      await loadOrders(true);
    } catch (err) {
      setError(err.message || 'Error al cambiar estado');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancel(reason) {
    if (!cancelTarget) return;
    setSubmitting(true);
    try {
      await api.adminOrderUpdateStatus(cancelTarget.id, 'cancelled', reason.trim());
      setCancelTarget(null);
      await loadOrders(true);
    } catch (err) {
      setError(err.message || 'Error al cancelar orden');
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.id] = orders.filter(o => o.status === col.id);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-ama-text flex items-center gap-2">
            <ChefHat size={18} className="text-ama-amber" />
            Tablero de Cocina
          </h2>
          {lastUpdated && (
            <span className="text-xs text-ama-text-muted">
              Actualizado {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ama-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-ama-amber"
            />
            Auto-refresco ({REFRESH_MS / 1000}s)
          </label>
          <button
            onClick={() => loadOrders()}
            className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer"
            title="Refrescar ahora"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Kanban */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-ama-amber" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const ColIcon = col.icon;
            const list = grouped[col.id] || [];
            return (
              <section
                key={col.id}
                className="bg-ama-darker/40 border border-ama-border rounded-xl p-3 flex flex-col min-h-[200px]"
              >
                <header className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-ama-border/70">
                  <div className="flex items-center gap-2">
                    <ColIcon size={16} className={col.iconCls} />
                    <h3 className="text-sm font-semibold text-ama-text">{col.label}</h3>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${col.badgeCls}`}>
                    {list.length}
                  </span>
                </header>
                {list.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-6">
                    <p className="text-xs text-ama-text-muted italic">Sin órdenes</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {list.map(o => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        busy={submitting && (advanceTarget?.order.id === o.id || cancelTarget?.id === o.id)}
                        onAdvance={(order, target) => setAdvanceTarget({ order, target })}
                        onCancel={(order) => setCancelTarget(order)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {advanceTarget && (
        <AdvanceDialog
          order={advanceTarget.order}
          target={advanceTarget.target}
          onClose={() => setAdvanceTarget(null)}
          onConfirm={confirmAdvance}
          submitting={submitting}
        />
      )}

      {cancelTarget && (
        <CancelDialog
          order={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={confirmCancel}
          submitting={submitting}
        />
      )}
    </div>
  );
}
