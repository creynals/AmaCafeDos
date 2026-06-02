const { test } = require('node:test');
const assert = require('node:assert/strict');

const { extractOrderId, detectPeriod, matchCustomerIds } = require('./adminChatContext');

// Fecha de referencia fija para tests deterministas: 15 de junio de 2026.
const NOW = new Date(2026, 5, 15, 10, 0, 0);

test('extractOrderId: varios formatos', () => {
  assert.equal(extractOrderId('¿qué pasó con el pedido #204?'), 204);
  assert.equal(extractOrderId('detalle de la orden 12'), 12);
  assert.equal(extractOrderId('order #7 estado'), 7);
  assert.equal(extractOrderId('número 350'), 350);
  assert.equal(extractOrderId('#1'), 1);
});

test('extractOrderId: sin número de pedido → null', () => {
  assert.equal(extractOrderId('cuántos clientes tengo'), null);
  assert.equal(extractOrderId('ventas de mayo'), null);
  assert.equal(extractOrderId(''), null);
  assert.equal(extractOrderId(null), null);
});

test('detectPeriod: hoy / ayer', () => {
  const hoy = detectPeriod('ventas de hoy', NOW);
  assert.equal(hoy.label, 'hoy');
  assert.equal(hoy.from.getDate(), 15);
  assert.equal(hoy.to.getDate(), 16);

  const ayer = detectPeriod('cuánto vendí ayer', NOW);
  assert.equal(ayer.label, 'ayer');
  assert.equal(ayer.from.getDate(), 14);
  assert.equal(ayer.to.getDate(), 15);
});

test('detectPeriod: este mes / mes pasado', () => {
  const esteMes = detectPeriod('resumen de este mes', NOW);
  assert.equal(esteMes.from.getMonth(), 5);  // junio
  assert.equal(esteMes.to.getMonth(), 6);    // julio (exclusivo)

  const mesPasado = detectPeriod('cómo fue el mes pasado', NOW);
  assert.equal(mesPasado.from.getMonth(), 4); // mayo
  assert.equal(mesPasado.to.getMonth(), 5);   // junio (exclusivo)
});

test('detectPeriod: nombre de mes con y sin año', () => {
  const marzo = detectPeriod('ventas de marzo', NOW);
  assert.equal(marzo.from.getMonth(), 2);
  assert.equal(marzo.from.getFullYear(), 2026);

  const mayo2025 = detectPeriod('compárame con mayo 2025', NOW);
  assert.equal(mayo2025.from.getMonth(), 4);
  assert.equal(mayo2025.from.getFullYear(), 2025);
  assert.equal(mayo2025.to.getFullYear(), 2025);
  assert.equal(mayo2025.to.getMonth(), 5);
});

test('detectPeriod: sin período → null', () => {
  assert.equal(detectPeriod('top productos', NOW), null);
  assert.equal(detectPeriod('cliente Christian', NOW), null);
});

test('matchCustomerIds: por nombre completo, email y token', () => {
  const customers = [
    { id: 1, name: 'Christian Reynals', email: 'christian.reynals@gmail.com' },
    { id: 2, name: 'Daniela Troncoso', email: 'dany@gmail.com' },
  ];
  assert.deepEqual(matchCustomerIds('háblame de Daniela Troncoso', customers), [2]);
  assert.deepEqual(matchCustomerIds('el cliente dany@gmail.com', customers), [2]);
  assert.deepEqual(matchCustomerIds('cuánto gastó troncoso', customers), [2]);
  assert.deepEqual(matchCustomerIds('top productos', customers), []);
});

test('matchCustomerIds: tope de 2 y entrada inválida', () => {
  const customers = [
    { id: 1, name: 'Ana Perez', email: '' },
    { id: 2, name: 'Ana Soto', email: '' },
    { id: 3, name: 'Ana Lopez', email: '' },
  ];
  // "perez/soto/lopez" tokens ≥4 — "Ana" es <4 así que no dispara por sí solo.
  const ids = matchCustomerIds('perez soto lopez', customers);
  assert.equal(ids.length, 2);
  assert.deepEqual(matchCustomerIds('hola', null), []);
});
