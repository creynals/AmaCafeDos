// Shared order-status vocabulary — single source of truth for the Órdenes and
// Clientes admin views (Cycle 202). Mirrors the backend whitelists (migración
// 001 payment_status / 010 fulfillment status) and backend/src/utils/orderStatus.js
// bucket definitions, so both tabs stay coherent and never drift again.
//
// Constantes puras (sin JSX). Los badges viven en components/OrderBadges.jsx.

export const FULFILLMENT_STATUSES = [
  'pending', 'in_progress', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

export const FULFILLMENT_LABELS = {
  pending: 'Pendiente',
  in_progress: 'En preparación',
  out_for_delivery: 'En reparto',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
  returned: 'Devuelta',
};

export const FULFILLMENT_COLORS = {
  pending: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
  in_progress: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
  out_for_delivery: 'bg-purple-400/10 text-purple-400 border-purple-400/30',
  delivered: 'bg-green-400/10 text-green-400 border-green-400/30',
  cancelled: 'bg-red-400/10 text-red-400 border-red-400/30',
  returned: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
};

export const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded'];

export const PAYMENT_STATUS_LABELS = {
  pending: 'Pendiente',
  processing: 'Procesando',
  paid: 'Pagado',
  failed: 'Falló',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

export const PAYMENT_STATUS_COLORS = {
  pending: 'text-yellow-400',
  processing: 'text-blue-400',
  paid: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-ama-text-muted',
  refunded: 'text-orange-400',
};

export const PAYMENT_METHOD_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

// Transiciones permitidas — espejo de ALLOWED_TRANSITIONS en backend/admin.js
export const ALLOWED_TRANSITIONS = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export const PAID_REQUIRED_TARGETS = new Set(['in_progress', 'out_for_delivery', 'delivered']);
