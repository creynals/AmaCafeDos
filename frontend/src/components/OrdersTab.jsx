import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import {
  Loader2, RefreshCw, Search, Filter, ChevronLeft, ChevronRight,
  X, AlertCircle, CheckCircle, ShoppingBag, Mail, Phone, MapPin,
  CreditCard, Calendar, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../api';

// Vocabulario fulfillment — coherente con FULFILLMENT_STATUSES en backend/admin.js
const FULFILLMENT_STATUSES = [
  'pending', 'in_progress', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

const FULFILLMENT_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En preparación',
  out_for_delivery: 'En reparto',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
  returned: 'Devuelta',
};

const FULFILLMENT_COLORS = {
  pending: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  in_progress: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
  out_for_delivery: 'bg-purple-400/10 text-purple-400 border-purple-400/30',
  delivered: 'bg-green-400/10 text-green-400 border-green-400/30',
  cancelled: 'bg-red-400/10 text-red-400 border-red-400/30',
  returned: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
};

const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'];

const PAYMENT_STATUS_LABELS = {
  pending: 'Pendiente',
  processing: 'Procesando',
  paid: 'Pagado',
  failed: 'Falló',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const PAYMENT_STATUS_COLORS = {
  pending: 'text-yellow-400',
  processing: 'text-blue-400',
  paid: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-ama-text-muted',
  refunded: 'text-orange-400',
};

const PAYMENT_METHOD_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

// Transiciones permitidas — espejo de ALLOWED_TRANSITIONS en backend/admin.js
const ALLOWED_TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const PAID_REQUIRED_TARGETS = new Set(['in_progress', 'out_for_delivery', 'delivered']);

function formatPrice(price) {
  const n = Number(price || 0);
  return `$${n.toLocaleString('es-CL')}`;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const cls = FULFILLMENT_COLORS[status] || 'bg-ama-darker text-ama-text-muted border-ama-border';
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${cls} whitespace-nowrap`}>
      {FULFILLMENT_LABELS[status] || status}
    </span>
  );
}

function PaymentStatusPill({ status }) {
  const cls = PAYMENT_STATUS_COLORS[status] || 'text-ama-text-muted';
  return (
    <span className={`text-xs ${cls}`}>
      {PAYMENT_STATUS_LABELS[status] || status}
    </span>
  );
}

function ChipMulti({ values, options, labels, onChange }) {
  function toggle(v) {
    const set = new Set(values);
    if (set.has(v)) set.delete(v); else set.add(v);
    onChange([...set]);
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map(opt => {
        const active = values.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
              active
                ? 'bg-ama-amber/20 text-ama-amber border-ama-amber/30'
                : 'text-ama-text-muted hover:text-ama-text bg-ama-darker border-ama-border'
            }`}
          >
            {labels[opt] || opt}
          </button>
        );
      })}
    </div>
  );
}

function StatusChangeModal({ order, onClose, onSuccess }) {
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  const isTerminal = allowed.length === 0;

  async function submit() {
    if (!target) { setError('Selecciona un nuevo estado'); return; }
    if (!reason.trim()) { setError('La razón es obligatoria'); return; }
    if (reason.trim().length > 1000) { setError('Razón máxima 1000 caracteres'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.adminOrderUpdateStatus(order.id, target, reason.trim());
      onSuccess(updated);
    } catch (err) {
      const data = err?.data || {};
      let msg = data.message || data.error || err.message;
      if (data.error === 'invalid_transition') {
        msg = `Transición no permitida (${data.from} → ${data.to}).`;
      } else if (data.error === 'payment_not_confirmed') {
        msg = `No se puede avanzar: pago aún no confirmado (estado: ${data.current_payment_status}).`;
      } else if (data.error === 'no_change') {
        msg = 'La orden ya se encuentra en ese estado.';
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-ama-card border border-ama-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-ama-border p-4">
          <div>
            <h3 className="text-base font-semibold text-ama-text">Cambiar estado de orden</h3>
            <p className="text-xs text-ama-text-muted mt-0.5">Pedido #{order.id} · {order.contact_name}</p>
          </div>
          <button onClick={onClose} className="text-ama-text-muted hover:text-ama-text cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Estado actual */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ama-text-muted">Estado actual:</span>
            <StatusBadge status={order.status} />
            <span className="text-ama-text-muted">·</span>
            <span className="text-ama-text-muted">Pago:</span>
            <PaymentStatusPill status={order.payment_status} />
          </div>

          {isTerminal && (
            <div className="bg-ama-darker border border-ama-border rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-xs text-ama-text-muted">
                Esta orden está en un estado <strong>terminal</strong> ({FULFILLMENT_LABELS[order.status]}) y no admite más transiciones.
              </div>
            </div>
          )}

          {!isTerminal && (
            <>
              <div>
                <label className="text-sm text-ama-text mb-2 block">Nuevo estado</label>
                <div className="grid grid-cols-1 gap-2">
                  {allowed.map(s => {
                    const requiresPaid = PAID_REQUIRED_TARGETS.has(s);
                    const blocked = requiresPaid && order.payment_status !== 'paid';
                    return (
                      <button
                        key={s}
                        disabled={blocked}
                        onClick={() => !blocked && setTarget(s)}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                          target === s
                            ? 'bg-ama-amber/10 border-ama-amber/40'
                            : blocked
                              ? 'bg-ama-darker/50 border-ama-border opacity-50 cursor-not-allowed'
                              : 'bg-ama-darker border-ama-border hover:border-ama-amber/30 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <ArrowRight size={14} className="text-ama-text-muted" />
                          <StatusBadge status={s} />
                        </div>
                        {blocked && (
                          <span className="text-xs text-yellow-400 flex items-center gap-1">
                            <AlertCircle size={12} /> requiere pago confirmado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm text-ama-text mb-2 block">
                  Razón <span className="text-red-400">*</span>
                  <span className="text-xs text-ama-text-muted ml-2">({reason.length}/1000)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Motivo del cambio (queda registrado en la auditoría)"
                  className="w-full bg-ama-darker border border-ama-border rounded-lg px-3 py-2 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none resize-none"
                />
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ama-border p-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-ama-text-muted hover:text-ama-text cursor-pointer"
          >
            Cancelar
          </button>
          {!isTerminal && (
            <button
              onClick={submit}
              disabled={submitting || !target || !reason.trim()}
              className="px-4 py-2 text-sm bg-ama-amber text-ama-darker rounded-lg font-medium hover:bg-ama-amber/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Confirmar cambio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderDetailsRow({ order }) {
  const items = Array.isArray(order.items) ? order.items : [];
  return (
    <tr className="bg-ama-darker/50 border-b border-ama-border/50">
      <td colSpan={9} className="py-3 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-ama-text-muted mb-1">Contacto</p>
            <p className="text-ama-text flex items-center gap-1"><Mail size={12} /> {order.contact_email || '-'}</p>
            <p className="text-ama-text flex items-center gap-1 mt-0.5"><Phone size={12} /> {order.contact_phone || '-'}</p>
          </div>
          <div>
            <p className="text-ama-text-muted mb-1">Dirección</p>
            <p className="text-ama-text flex items-start gap-1">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span>
                {[order.address_street, order.address_number].filter(Boolean).join(' ') || '-'}
                {order.address_commune && <>, {order.address_commune}</>}
                {order.address_city && <>, {order.address_city}</>}
                {order.address_notes && <span className="block text-ama-text-muted mt-0.5">{order.address_notes}</span>}
              </span>
            </p>
          </div>
          <div>
            <p className="text-ama-text-muted mb-1">Pago</p>
            <p className="text-ama-text flex items-center gap-1">
              <CreditCard size={12} />
              {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
              {order.card_scheme && <span className="text-ama-text-muted ml-1">({order.card_scheme})</span>}
            </p>
            {order.sumup_transaction_code && (
              <p className="text-ama-text-muted mt-0.5">Tx: {order.sumup_transaction_code}</p>
            )}
            <p className="text-ama-text-muted mt-0.5">Subtotal: {formatPrice(order.subtotal)}</p>
          </div>
        </div>

        {/* Productos solicitados — Ciclo 25 (Vista de Cocina + visibilidad en listado) */}
        <div className="mt-3 pt-3 border-t border-ama-border/40">
          <p className="text-ama-text-muted text-xs mb-2 flex items-center gap-1">
            <ShoppingBag size={12} /> Productos solicitados ({items.length})
          </p>
          {items.length === 0 ? (
            <p className="text-xs text-ama-text-muted italic">Sin items registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ama-text-muted">
                    <th className="text-left py-1 pr-2 font-normal w-12">Cant.</th>
                    <th className="text-left py-1 px-2 font-normal">Producto</th>
                    <th className="text-left py-1 px-2 font-normal">Notas</th>
                    <th className="text-right py-1 px-2 font-normal whitespace-nowrap">Precio unit.</th>
                    <th className="text-right py-1 pl-2 font-normal whitespace-nowrap">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-t border-ama-border/30">
                      <td className="py-1.5 pr-2 text-ama-amber font-semibold">{it.quantity}×</td>
                      <td className="py-1.5 px-2 text-ama-text">{it.name}</td>
                      <td className="py-1.5 px-2 text-yellow-400/90 italic">{it.notes || '-'}</td>
                      <td className="py-1.5 px-2 text-right text-ama-text-muted whitespace-nowrap">{formatPrice(it.price)}</td>
                      <td className="py-1.5 pl-2 text-right text-ama-text whitespace-nowrap">{formatPrice(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 20, offset: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [sort, setSort] = useState('created_at_desc');
  const [showFilters, setShowFilters] = useState(false);

  const [expandedId, setExpandedId] = useState(null);
  const [statusModalOrder, setStatusModalOrder] = useState(null);
  const debounceRef = useRef(null);

  // Debounce de búsqueda libre
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [q]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.adminOrders({
        q: debouncedQ || undefined,
        status: statusFilter.length ? statusFilter.join(',') : undefined,
        payment_status: paymentStatusFilter.length ? paymentStatusFilter.join(',') : undefined,
        payment_method: paymentMethod || undefined,
        from: dateRange.from || undefined,
        to: dateRange.to || undefined,
        sort,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      setOrders(data.orders || []);
      setPagination(data.pagination || { total: 0, limit: 20, offset: 0 });
    } catch (err) {
      console.error('Error loading admin orders:', err);
      setError(err.message || 'Error cargando órdenes');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, statusFilter, paymentStatusFilter, paymentMethod, dateRange, sort, pagination.limit, pagination.offset]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Reset offset cuando cambian filtros (no cuando cambia la propia paginación)
  useEffect(() => {
    setPagination(p => ({ ...p, offset: 0 }));
  }, [debouncedQ, statusFilter, paymentStatusFilter, paymentMethod, dateRange, sort]);

  function clearFilters() {
    setQ('');
    setDebouncedQ('');
    setStatusFilter([]);
    setPaymentStatusFilter([]);
    setPaymentMethod('');
    setDateRange({ from: '', to: '' });
    setSort('created_at_desc');
  }

  const hasFilters = !!(debouncedQ || statusFilter.length || paymentStatusFilter.length || paymentMethod || dateRange.from || dateRange.to);

  function nextPage() {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination(p => ({ ...p, offset: p.offset + p.limit }));
    }
  }
  function prevPage() {
    setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }));
  }

  function handleStatusUpdated(updated) {
    setStatusModalOrder(null);
    setOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
  }

  const fromShown = pagination.total === 0 ? 0 : pagination.offset + 1;
  const toShown = Math.min(pagination.offset + pagination.limit, pagination.total);

  return (
    <div className="space-y-4">
      {/* Header con búsqueda + toggle filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ama-text-muted" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por #ID, nombre, email, teléfono, comuna, código tx..."
            className="w-full bg-ama-card border border-ama-border rounded-lg pl-9 pr-3 py-2 text-sm text-ama-text placeholder:text-ama-text-muted focus:border-ama-amber/50 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
            showFilters || hasFilters
              ? 'bg-ama-amber/10 text-ama-amber border-ama-amber/30'
              : 'text-ama-text-muted hover:text-ama-text bg-ama-card border-ama-border'
          }`}
        >
          <Filter size={14} /> Filtros
          {hasFilters && <span className="text-xs bg-ama-amber/20 px-1.5 rounded">activos</span>}
        </button>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-ama-card border border-ama-border rounded-lg px-3 py-2 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none cursor-pointer"
        >
          <option value="created_at_desc">Más recientes</option>
          <option value="created_at_asc">Más antiguas</option>
          <option value="total_desc">Mayor total</option>
          <option value="total_asc">Menor total</option>
        </select>
        <button
          onClick={loadOrders}
          className="p-2 text-ama-text-muted hover:text-ama-amber transition-colors cursor-pointer"
          title="Refrescar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Panel de filtros */}
      {showFilters && (
        <div className="bg-ama-card border border-ama-border rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs text-ama-text-muted mb-2 font-medium">Estado de cumplimiento</p>
            <ChipMulti
              values={statusFilter}
              options={FULFILLMENT_STATUSES}
              labels={FULFILLMENT_LABELS}
              onChange={setStatusFilter}
            />
          </div>

          <div>
            <p className="text-xs text-ama-text-muted mb-2 font-medium">Estado de pago</p>
            <ChipMulti
              values={paymentStatusFilter}
              options={PAYMENT_STATUSES}
              labels={PAYMENT_STATUS_LABELS}
              onChange={setPaymentStatusFilter}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-xs text-ama-text-muted mb-2 font-medium">Método de pago</p>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="bg-ama-darker border border-ama-border rounded-lg px-3 py-1.5 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none cursor-pointer"
              >
                <option value="">Todos</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </div>

            <div>
              <p className="text-xs text-ama-text-muted mb-2 font-medium">Desde</p>
              <input
                type="date"
                value={dateRange.from}
                onChange={e => setDateRange(d => ({ ...d, from: e.target.value }))}
                className="bg-ama-darker border border-ama-border rounded-lg px-2.5 py-1.5 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none"
              />
            </div>
            <div>
              <p className="text-xs text-ama-text-muted mb-2 font-medium">Hasta</p>
              <input
                type="date"
                value={dateRange.to}
                onChange={e => setDateRange(d => ({ ...d, to: e.target.value }))}
                className="bg-ama-darker border border-ama-border rounded-lg px-2.5 py-1.5 text-sm text-ama-text focus:border-ama-amber/50 focus:outline-none"
              />
            </div>

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto self-end text-xs text-ama-text-muted hover:text-red-400 transition-colors cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resumen / paginación */}
      <div className="flex items-center justify-between text-xs text-ama-text-muted">
        <span>
          {pagination.total === 0
            ? 'Sin resultados'
            : <>Mostrando <strong className="text-ama-text">{fromShown}-{toShown}</strong> de <strong className="text-ama-text">{pagination.total}</strong></>}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={prevPage}
            disabled={pagination.offset === 0 || loading}
            className="p-1.5 rounded-lg text-ama-text-muted hover:text-ama-amber disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={nextPage}
            disabled={pagination.offset + pagination.limit >= pagination.total || loading}
            className="p-1.5 rounded-lg text-ama-text-muted hover:text-ama-amber disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Tabla */}
      {loading && orders.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-ama-amber" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-ama-card border border-ama-border rounded-xl p-12 text-center">
          <ShoppingBag size={32} className="text-ama-text-muted mx-auto mb-3" />
          <p className="text-sm text-ama-text-muted">
            {hasFilters ? 'No hay órdenes que coincidan con los filtros.' : 'Aún no hay órdenes registradas.'}
          </p>
        </div>
      ) : (
        <div className="bg-ama-card border border-ama-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ama-text-muted border-b border-ama-border bg-ama-darker/50">
                  <th className="py-2.5 pl-4 pr-2 w-8"></th>
                  <th className="py-2.5 px-2">#</th>
                  <th className="py-2.5 px-2">Fecha</th>
                  <th className="py-2.5 px-2">Cliente</th>
                  <th className="py-2.5 px-2 text-right">Items</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2">Pago</th>
                  <th className="py-2.5 px-2">Estado</th>
                  <th className="py-2.5 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const expanded = expandedId === o.id;
                  const allowed = ALLOWED_TRANSITIONS[o.status] || [];
                  const canChange = allowed.length > 0;
                  return (
                    <Fragment key={o.id}>
                      <tr
                        className="border-b border-ama-border/50 hover:bg-ama-darker/30"
                      >
                        <td className="py-3 pl-4 pr-2">
                          <button
                            onClick={() => setExpandedId(expanded ? null : o.id)}
                            className="text-ama-text-muted hover:text-ama-amber cursor-pointer"
                            title={expanded ? 'Contraer' : 'Ver detalle'}
                          >
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                        <td className="py-3 px-2 font-mono text-ama-text-muted">#{o.id}</td>
                        <td className="py-3 px-2 text-ama-text whitespace-nowrap">
                          <Calendar size={12} className="inline mr-1 text-ama-text-muted" />
                          {formatDateTime(o.created_at)}
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-ama-text font-medium">{o.contact_name || '-'}</p>
                          <p className="text-xs text-ama-text-muted">
                            {[o.address_commune, o.address_city].filter(Boolean).join(', ') || '-'}
                          </p>
                        </td>
                        <td className="py-3 px-2 text-right text-ama-text">{o.item_count}</td>
                        <td className="py-3 px-2 text-right text-ama-amber font-medium whitespace-nowrap">
                          {formatPrice(o.total)}
                        </td>
                        <td className="py-3 px-2">
                          <p className="text-xs text-ama-text capitalize">
                            {PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method}
                          </p>
                          <PaymentStatusPill status={o.payment_status} />
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="py-3 pr-4 pl-2 text-right">
                          {canChange ? (
                            <button
                              onClick={() => setStatusModalOrder(o)}
                              className="text-xs px-2.5 py-1 bg-ama-amber/10 text-ama-amber border border-ama-amber/30 rounded-lg hover:bg-ama-amber/20 cursor-pointer whitespace-nowrap"
                            >
                              Cambiar estado
                            </button>
                          ) : (
                            <span className="text-xs text-ama-text-muted italic">Terminal</span>
                          )}
                        </td>
                      </tr>
                      {expanded && <OrderDetailsRow order={o} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statusModalOrder && (
        <StatusChangeModal
          order={statusModalOrder}
          onClose={() => setStatusModalOrder(null)}
          onSuccess={handleStatusUpdated}
        />
      )}
    </div>
  );
}
