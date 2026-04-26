export function formatPrice(cents) {
  return '$' + Number(cents).toLocaleString('es-CL');
}
