// Shared order badges (Cycle 202) — used by Órdenes y Clientes para renderizar
// estados de cumplimiento y pago de forma idéntica. Vocabulario en
// utils/orderStatus.js.
import {
  FULFILLMENT_LABELS, FULFILLMENT_COLORS,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
} from '../utils/orderStatus.js';

export function StatusBadge({ status }) {
  const cls = FULFILLMENT_COLORS[status] || 'bg-ama-darker text-ama-text-muted border-ama-border';
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${cls} whitespace-nowrap`}>
      {FULFILLMENT_LABELS[status] || status}
    </span>
  );
}

export function PaymentStatusPill({ status }) {
  const cls = PAYMENT_STATUS_COLORS[status] || 'text-ama-text-muted';
  return (
    <span className={`text-xs ${cls}`}>
      {PAYMENT_STATUS_LABELS[status] || status}
    </span>
  );
}
