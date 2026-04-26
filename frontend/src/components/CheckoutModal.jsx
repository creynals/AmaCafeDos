import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, ShoppingBag, User, MapPin, CreditCard, Check, Loader2, AlertCircle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { formatPrice } from '../utils/format';
import { api } from '../api';
import SumUpCardWidget from './SumUpCardWidget';

const STEPS = [
  { id: 'summary', label: 'Resumen',   icon: ShoppingBag },
  { id: 'contact', label: 'Contacto',  icon: User },
  { id: 'address', label: 'Direccion', icon: MapPin },
  { id: 'payment', label: 'Pago',      icon: CreditCard },
];

/**
 * Métodos de pago.
 *
 * Ciclo 31 (Option C, DG #3): mantenemos los 4 botones (efectivo,
 * transferencia, tarjeta débito, tarjeta crédito) como UX. Los dos botones
 * de tarjeta envían `payment_method: 'tarjeta'` al backend (unificado). La
 * marca real (VISA/MASTERCARD/...) se muestra post-autorización vía
 * orders.card_scheme poblado por el webhook desde la respuesta de SumUp.
 */
const PAYMENT_METHODS = [
  { id: 'efectivo',       label: 'Efectivo',        desc: 'Pago al momento de la entrega', backendValue: 'efectivo' },
  { id: 'transferencia',  label: 'Transferencia',   desc: 'Transferencia bancaria',        backendValue: 'transferencia' },
  { id: 'tarjeta_debito', label: 'Tarjeta Débito',  desc: 'Pago seguro con tarjeta',       backendValue: 'tarjeta' },
  { id: 'tarjeta_credito',label: 'Tarjeta Crédito', desc: 'Pago seguro con tarjeta',       backendValue: 'tarjeta' },
];

const CARD_UI_IDS = new Set(['tarjeta_debito', 'tarjeta_credito']);

const POLL_INTERVAL_MS  = 1500;
const POLL_TIMEOUT_MS   = 60_000; // 1 min — webhook típicamente tarda 1–5s

export default function CheckoutModal({ isOpen, onClose }) {
  const { cart, total, refreshCart, setIsOpen: setCartOpen } = useCart();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState(null);

  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [address, setAddress] = useState({ street: '', number: '', commune: '', city: 'Santiago', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState('');

  // Card widget state (solo activo cuando paymentMethod es tarjeta)
  const [cardPhase, setCardPhase] = useState('idle'); // idle | widget | polling | done | failed
  const [cardError, setCardError] = useState(null);
  const pollAbortRef = useRef({ aborted: false });

  useEffect(() => () => { pollAbortRef.current.aborted = true; }, []);

  if (!isOpen) return null;

  const items = cart?.items || [];
  const isCardMethod = CARD_UI_IDS.has(paymentMethod);

  const validateContact = () => {
    if (!contact.name.trim()) return 'Ingresa tu nombre';
    if (!contact.email.trim() || !contact.email.includes('@')) return 'Ingresa un email valido';
    if (!contact.phone.trim() || contact.phone.length < 8) return 'Ingresa un telefono valido';
    return null;
  };

  const validateAddress = () => {
    if (!address.street.trim()) return 'Ingresa la calle';
    if (!address.number.trim()) return 'Ingresa el numero';
    if (!address.commune.trim()) return 'Ingresa la comuna';
    if (!address.city.trim())    return 'Ingresa la ciudad';
    return null;
  };

  const validatePayment = () => {
    if (!paymentMethod) return 'Selecciona un metodo de pago';
    return null;
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateContact(); if (err) { toast.error(err); return; }
    } else if (step === 2) {
      const err = validateAddress(); if (err) { toast.error(err); return; }
    } else if (step === 3) {
      const err = validatePayment(); if (err) { toast.error(err); return; }
      handleSubmit();
      return;
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setCardError(null);
    try {
      const backendValue =
        PAYMENT_METHODS.find(m => m.id === paymentMethod)?.backendValue || paymentMethod;

      const result = await api.createOrder(cart.cart_id, contact, address, backendValue);

      if (CARD_UI_IDS.has(paymentMethod)) {
        // Validar que el backend devolvió un checkout SumUp válido
        if (!result.payment?.checkout_id) {
          const reason = result.payment?.error || 'sin_checkout_id';
          toast.error(
            reason === 'sumup_not_configured'
              ? 'El pago con tarjeta no está disponible en este momento. Contacta al administrador.'
              : 'No se pudo iniciar el pago con tarjeta. Intenta nuevamente o usa otro método.'
          );
          // No marcamos orderResult — la orden quedó creada pero sin checkout.
          // El usuario puede reintentar (creará otra orden — TODO ciclo futuro: reuse).
          return;
        }
        setOrderResult(result);
        setCardPhase('widget');
        // Cart no se vacía visualmente hasta que el pago confirme — la orden
        // ya se creó server-side y vació cart_items, pero refreshCart aquí
        // dejaría al usuario sin "carrito visible" durante el widget. Lo
        // hacemos al confirmar pago.
      } else {
        // Métodos no-tarjeta: confirmación directa.
        setOrderResult(result);
        await refreshCart();
      }
    } catch (err) {
      toast.error('Error al crear el pedido. Intenta nuevamente.');
      console.error('Order error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Polling sobre /api/orders/:id/sync-payment hasta detectar payment_status='paid'
  // o estado terminal ('failed' / 'cancelled') o timeout.
  //
  // Ciclo 61 (R3 — polling activo): cada iteración consulta directamente a
  // SumUp vía syncOrderPayment en lugar de leer la DB y depender del webhook.
  // Esto rompe la dependencia con la entrega del webhook (que en sandbox es
  // poco confiable) y garantiza que el happy path se cierre dentro del
  // timeout siempre que SumUp tenga el estado actualizado. Mantenemos
  // getOrder como fallback ante errores transitorios del sync.
  const pollOrderStatus = async (orderId) => {
    const startedAt = Date.now();
    pollAbortRef.current.aborted = false;
    while (!pollAbortRef.current.aborted) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        return { timedOut: true, payment_status: 'pending' };
      }
      let fresh = null;
      try {
        fresh = await api.syncOrderPayment(orderId);
      } catch (err) {
        console.warn('[checkout] poll syncOrderPayment falló, fallback a getOrder:', err.message);
        try {
          fresh = await api.getOrder(orderId);
        } catch {
          // network blip — seguimos intentando hasta timeout
        }
      }
      if (fresh && ['paid', 'failed', 'cancelled'].includes(fresh.payment_status)) {
        return fresh;
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    return { aborted: true };
  };

  const handleWidgetSuccess = async () => {
    setCardPhase('polling');

    // Ciclo 56 (fix Ciclo 55): sincronización activa primero.
    // El webhook de SumUp puede tardar mucho o nunca llegar en sandbox; en
    // vez de esperar, pedimos al backend que consulte SumUp directamente
    // (misma fuente autoritativa que usa el webhook). El polling queda como
    // fallback para casos donde el sync inicial devuelve 'pending'/'processing'
    // y el estado finaliza más tarde (ej. 3DS challenge prolongado).
    let synced = null;
    try {
      synced = await api.syncOrderPayment(orderResult.order_id);
    } catch (err) {
      console.warn('[checkout] syncOrderPayment falló, caigo a polling:', err.message);
    }

    if (synced?.payment_status === 'paid') {
      setOrderResult(prev => ({ ...prev, ...synced }));
      setCardPhase('done');
      await refreshCart();
      return;
    }
    if (synced && ['failed', 'cancelled'].includes(synced.payment_status)) {
      setCardError(`El pago fue rechazado (${synced.payment_status}).`);
      setCardPhase('failed');
      return;
    }

    const fresh = await pollOrderStatus(orderResult.order_id);

    if (fresh.payment_status === 'paid') {
      setOrderResult(prev => ({ ...prev, ...fresh }));
      setCardPhase('done');
      await refreshCart();
    } else if (fresh.timedOut) {
      // Pago en proceso, webhook tarda. Mostramos confirmación tentativa.
      setOrderResult(prev => ({ ...prev, payment_status: 'processing' }));
      setCardPhase('done');
      await refreshCart();
      toast.info('El pago está siendo procesado. Te notificaremos por email.');
    } else {
      setCardError(`El pago fue rechazado (${fresh.payment_status || 'desconocido'}).`);
      setCardPhase('failed');
    }
  };

  const handleWidgetError = ({ message }) => {
    setCardError(message);
    setCardPhase('failed');
  };

  const handleClose = () => {
    pollAbortRef.current.aborted = true;
    if (orderResult && (cardPhase === 'idle' || cardPhase === 'done')) {
      setStep(0);
      setContact({ name: '', email: '', phone: '' });
      setAddress({ street: '', number: '', commune: '', city: 'Santiago', notes: '' });
      setPaymentMethod('');
      setOrderResult(null);
      setCardPhase('idle');
      setCardError(null);
      setCartOpen(false);
    }
    onClose();
  };

  // ----- Card widget screen --------------------------------------------------
  if (orderResult && cardPhase !== 'idle' && cardPhase !== 'done') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-lg bg-ama-card rounded-2xl border border-ama-border overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between p-4 border-b border-ama-border">
            <h2 className="text-lg font-semibold text-ama-text">Pago seguro con tarjeta</h2>
            <button
              onClick={handleClose}
              disabled={cardPhase === 'polling'}
              className="p-1 text-ama-text-muted hover:text-ama-text disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            <div className="bg-ama-dark rounded-xl p-3 mb-4 text-sm text-ama-text-muted">
              Pedido #{orderResult.order_id} · Total a pagar:{' '}
              <span className="text-ama-amber font-bold">
                {formatPrice(orderResult.payment?.amount ?? orderResult.total)}
              </span>
            </div>

            {cardPhase === 'widget' && orderResult.payment?.checkout_id && (
              <SumUpCardWidget
                checkoutId={orderResult.payment.checkout_id}
                amount={orderResult.payment.amount}
                currency={orderResult.payment.currency || 'CLP'}
                onSuccess={handleWidgetSuccess}
                onError={handleWidgetError}
              />
            )}

            {cardPhase === 'polling' && (
              <div className="flex flex-col items-center text-center py-6 gap-3">
                <Loader2 className="w-8 h-8 text-ama-amber animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-ama-text">Confirmando tu pago...</p>
                  <p className="text-xs text-ama-text-muted mt-1">
                    Estamos esperando la confirmación del procesador.
                  </p>
                </div>
              </div>
            )}

            {cardPhase === 'failed' && (
              <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">El pago no se completó</p>
                  <p className="text-xs text-red-400/80 mt-1">{cardError}</p>
                  <p className="text-xs text-red-400/80 mt-2">
                    Cierra esta ventana y vuelve a intentar, o usa otro método de pago.
                  </p>
                </div>
              </div>
            )}
          </div>

          {cardPhase === 'failed' && (
            <div className="border-t border-ama-border p-4">
              <button
                onClick={handleClose}
                className="w-full bg-ama-amber hover:bg-ama-amber-light text-ama-darker font-semibold py-3 rounded-full transition-colors"
              >
                Volver al carrito
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ----- Order confirmation screen ------------------------------------------
  if (orderResult && (cardPhase === 'done' || cardPhase === 'idle')) {
    const pendingCardPay = isCardMethod && orderResult.payment_status !== 'paid';
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative w-full max-w-lg bg-ama-card rounded-2xl border border-ama-border overflow-hidden animate-fade-in-up">
          <div className="p-6 text-center">
            <div className={`w-16 h-16 ${pendingCardPay ? 'bg-amber-500/20' : 'bg-green-500/20'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              {pendingCardPay
                ? <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                : <Check className="w-8 h-8 text-green-400" />}
            </div>
            <h2 className="text-2xl font-bold text-ama-text mb-2">
              {pendingCardPay ? 'Pago en proceso' : 'Pedido Confirmado!'}
            </h2>
            <p className="text-ama-text-muted mb-1">Pedido #{orderResult.order_id}</p>
            <p className="text-sm text-ama-text-muted mb-6">
              Te enviaremos un email de confirmacion a{' '}
              <span className="text-ama-amber">{orderResult.contact.email}</span>
            </p>

            <div className="bg-ama-dark rounded-xl p-4 mb-4 text-left">
              <h3 className="text-sm font-semibold text-ama-text-muted mb-2">Resumen</h3>
              {orderResult.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span className="text-ama-text">{item.quantity}x {item.name}</span>
                  <span className="text-ama-text-muted">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-ama-border mt-2 pt-2 flex justify-between">
                <span className="font-semibold text-ama-text">Total</span>
                <span className="font-bold text-ama-amber">{formatPrice(orderResult.total)}</span>
              </div>
            </div>

            <div className="bg-ama-dark rounded-xl p-4 mb-6 text-left text-sm">
              <div className="flex items-start gap-2 mb-2">
                <MapPin className="w-4 h-4 text-ama-amber mt-0.5 shrink-0" />
                <span className="text-ama-text">
                  {orderResult.address.street} {orderResult.address.number}, {orderResult.address.commune}, {orderResult.address.city}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-ama-amber shrink-0" />
                <span className="text-ama-text capitalize">
                  {orderResult.payment_method === 'tarjeta'
                    ? `Tarjeta${orderResult.card_scheme ? ` · ${orderResult.card_scheme}` : ''}`
                    : orderResult.payment_method.replace('_', ' ')}
                </span>
              </div>
            </div>

            <button
              onClick={handleClose}
              className="w-full bg-ama-amber hover:bg-ama-amber-light text-ama-darker font-semibold py-3 rounded-full transition-colors"
            >
              Volver al Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Multi-step form ----------------------------------------------------
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-ama-card rounded-2xl border border-ama-border overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-ama-border">
          <h2 className="text-lg font-semibold text-ama-text">Confirmar Pedido</h2>
          <button onClick={handleClose} className="p-1 text-ama-text-muted hover:text-ama-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-b border-ama-border bg-ama-dark/50">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isActive ? 'bg-ama-amber text-ama-darker' :
                  isDone ? 'bg-green-500/20 text-green-400' :
                  'bg-ama-border text-ama-text-muted'
                }`}>
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-xs hidden sm:inline ${isActive ? 'text-ama-amber font-semibold' : 'text-ama-text-muted'}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 sm:w-10 h-0.5 mx-1 ${isDone ? 'bg-green-500/40' : 'bg-ama-border'}`} />
                )}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 0 && <StepSummary items={items} total={total} />}
          {step === 1 && <StepContact contact={contact} onChange={setContact} />}
          {step === 2 && <StepAddress address={address} onChange={setAddress} />}
          {step === 3 && <StepPayment selected={paymentMethod} onSelect={setPaymentMethod} total={total} />}
        </div>

        <div className="border-t border-ama-border p-4 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={submitting}
              className="flex items-center gap-1 text-sm text-ama-text-muted hover:text-ama-text transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Atras
            </button>
          ) : <div />}

          <button
            onClick={handleNext}
            disabled={submitting}
            className="flex items-center gap-2 bg-ama-amber hover:bg-ama-amber-light text-ama-darker font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
            ) : step === 3 ? (
              <>{isCardMethod ? 'Continuar al pago' : 'Confirmar Pedido'} - {formatPrice(total)}</>
            ) : (
              <>Siguiente <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepSummary({ items, total }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ama-text-muted mb-3">Productos en tu pedido</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.item_id} className="flex items-center gap-3 bg-ama-dark rounded-xl p-3 border border-ama-border">
            {item.image_url && (
              <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ama-text truncate">{item.name}</p>
              <p className="text-xs text-ama-text-muted">{formatPrice(item.price)} x {item.quantity}</p>
            </div>
            <span className="text-sm font-bold text-ama-amber">{formatPrice(item.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-ama-border flex justify-between items-center">
        <span className="text-ama-text-muted">Total</span>
        <span className="text-xl font-bold text-ama-amber">{formatPrice(total)}</span>
      </div>
    </div>
  );
}

function StepContact({ contact, onChange }) {
  const update = (field, value) => onChange({ ...contact, [field]: value });

  return (
    <div>
      <h3 className="text-sm font-semibold text-ama-text-muted mb-3">Datos de contacto</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-ama-text-muted mb-1">Nombre completo *</label>
          <input
            type="text"
            value={contact.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Juan Perez"
            className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-ama-text-muted mb-1">Email *</label>
          <input
            type="email"
            value={contact.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="juan@ejemplo.com"
            className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-ama-text-muted mb-1">Telefono *</label>
          <input
            type="tel"
            value={contact.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+56 9 1234 5678"
            className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

function StepAddress({ address, onChange }) {
  const update = (field, value) => onChange({ ...address, [field]: value });

  return (
    <div>
      <h3 className="text-sm font-semibold text-ama-text-muted mb-3">Direccion de envio</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-ama-text-muted mb-1">Calle *</label>
            <input
              type="text"
              value={address.street}
              onChange={(e) => update('street', e.target.value)}
              placeholder="Av. Providencia"
              className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-ama-text-muted mb-1">Numero *</label>
            <input
              type="text"
              value={address.number}
              onChange={(e) => update('number', e.target.value)}
              placeholder="1234"
              className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ama-text-muted mb-1">Comuna *</label>
            <input
              type="text"
              value={address.commune}
              onChange={(e) => update('commune', e.target.value)}
              placeholder="Providencia"
              className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-ama-text-muted mb-1">Ciudad *</label>
            <input
              type="text"
              value={address.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder="Santiago"
              className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-ama-text-muted mb-1">Notas de entrega (opcional)</label>
          <input
            type="text"
            value={address.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Depto 501, timbre no funciona, llamar al llegar"
            className="w-full bg-ama-dark border border-ama-border rounded-xl px-4 py-2.5 text-sm text-ama-text placeholder:text-ama-text-muted/50 focus:outline-none focus:border-ama-amber transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

function StepPayment({ selected, onSelect, total }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ama-text-muted mb-3">Metodo de pago</h3>
      <div className="space-y-2">
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method.id}
            onClick={() => onSelect(method.id)}
            className={`w-full text-left p-4 rounded-xl border transition-all ${
              selected === method.id
                ? 'border-ama-amber bg-ama-amber/10'
                : 'border-ama-border bg-ama-dark hover:border-ama-text-muted'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-semibold ${selected === method.id ? 'text-ama-amber' : 'text-ama-text'}`}>
                  {method.label}
                </p>
                <p className="text-xs text-ama-text-muted mt-0.5">{method.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                selected === method.id ? 'border-ama-amber' : 'border-ama-border'
              }`}>
                {selected === method.id && <div className="w-2.5 h-2.5 rounded-full bg-ama-amber" />}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-ama-border flex justify-between items-center">
        <span className="text-ama-text-muted">Total a pagar</span>
        <span className="text-xl font-bold text-ama-amber">{formatPrice(total)}</span>
      </div>
    </div>
  );
}
