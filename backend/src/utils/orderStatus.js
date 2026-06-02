// Order status predicates — single source of truth for the "counted / pending /
// confirmed" order buckets used across admin analytics (customers, dashboard,
// BI assistant). Centralized to prevent the drift that left customer queries
// filtering on the dead `status='completed'` value after migration 010 changed
// the vocabulary (Cycle 202).
//
// Vocabulario (ver migración 010 + 001):
//   - status (fulfillment): pending | in_progress | out_for_delivery |
//                           delivered | cancelled | returned
//   - payment_status:       pending | processing | paid | failed |
//                           cancelled | refunded
//
// Definiciones de negocio (Cycle 202 — decisión de producto):
//   CONFIRMED → pago recibido (payment_status='paid') y no cancelada/devuelta.
//   PENDING   → esperando confirmación de pago (pending|processing) y no
//               cancelada/devuelta. Es el estado de las transferencias hasta
//               que el admin confirma el depósito (PATCH /orders/:id/payment).
//   COUNTED   → CONFIRMED ∪ PENDING. Excluye cancelled/returned (fulfillment) y
//               failed/refunded/cancelled (payment). Es el universo de pedidos
//               "reales" para conteos y para "Total Gastado".
//
// "Total Gastado" / revenue se calcula sobre COUNTED (valor de pedidos no
// cancelados); el dinero efectivamente cobrado se expone aparte como
// confirmed (sobre CONFIRMED).
//
// Los fragmentos NO interpolan input de usuario — solo el alias de tabla, que
// el caller controla. Devuelven SQL booleano apto para WHERE, JOIN ON o
// FILTER (WHERE ...).

function notCancelled(alias) {
  return `${alias}.status NOT IN ('cancelled', 'returned')`;
}

function confirmedSql(alias = 'o') {
  return `(${alias}.payment_status = 'paid' AND ${notCancelled(alias)})`;
}

function pendingSql(alias = 'o') {
  return `(${alias}.payment_status IN ('pending', 'processing') AND ${notCancelled(alias)})`;
}

function countedSql(alias = 'o') {
  return `(${alias}.payment_status IN ('pending', 'processing', 'paid') AND ${notCancelled(alias)})`;
}

module.exports = {
  confirmedSql,
  pendingSql,
  countedSql,
};
