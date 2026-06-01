// node:test for orderConfirmationEmail builder — C173

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildOrderConfirmationEmail,
  escapeHtml,
  formatCLP,
} = require('./orderConfirmationEmail');

function mockOrder(overrides = {}) {
  return {
    order_id: 4242,
    status: 'pending',
    payment_status: 'pending',
    contact: {
      name: 'Juana Pérez',
      email: 'juana@example.com',
      phone: '+56 9 1234 5678',
    },
    address: {
      street: 'Av. Providencia',
      number: '1234',
      commune: 'Providencia',
      city: 'Santiago',
      notes: 'Tocar timbre 3B',
    },
    payment_method: 'tarjeta',
    customer_instructions: 'Sin azúcar por favor',
    items: [
      { name: 'Latte 12oz', price: 3500, quantity: 2, subtotal: 7000 },
      { name: 'Croissant', price: 2500, quantity: 1, subtotal: 2500 },
    ],
    subtotal: 9500,
    total: 9500,
    created_at: '2026-06-01T12:00:00Z',
    ...overrides,
  };
}

test('escapeHtml escapes the 5 dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("a&b'c"), 'a&amp;b&#39;c');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('formatCLP returns Chilean-formatted currency', () => {
  assert.equal(formatCLP(0), '$0');
  assert.equal(formatCLP(1500), '$1.500');
  assert.equal(formatCLP(125000), '$125.000');
  assert.equal(formatCLP('9500'), '$9.500');
  assert.equal(formatCLP(null), '$0');
  assert.equal(formatCLP('not-a-number'), '$0');
});

test('buildOrderConfirmationEmail returns to/subject/html/text', () => {
  const order = mockOrder();
  const out = buildOrderConfirmationEmail(order);
  assert.equal(out.to, 'juana@example.com');
  assert.match(out.subject, /Confirmación de tu pedido amaCafe #4242/);
  assert.ok(typeof out.html === 'string' && out.html.length > 100);
  assert.ok(typeof out.text === 'string' && out.text.length > 50);
});

test('html escapes contact name and instructions to prevent XSS', () => {
  const order = mockOrder({
    contact: {
      name: '<img src=x onerror=alert(1)>',
      email: 'attacker@example.com',
      phone: '+56 9 0000 0000',
    },
    customer_instructions: '<script>alert("x")</script>',
  });
  const out = buildOrderConfirmationEmail(order);
  assert.ok(!out.html.includes('<img src=x'));
  assert.ok(!out.html.includes('<script>alert("x")'));
  assert.ok(out.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(out.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
});

test('renders every item in html and text', () => {
  const out = buildOrderConfirmationEmail(mockOrder());
  assert.ok(out.html.includes('Latte 12oz'));
  assert.ok(out.html.includes('Croissant'));
  assert.ok(out.text.includes('Latte 12oz'));
  assert.ok(out.text.includes('Croissant'));
  assert.ok(out.text.includes('2 x Latte 12oz'));
});

test('renders total in CLP format', () => {
  const out = buildOrderConfirmationEmail(mockOrder({ total: 9500 }));
  assert.ok(out.html.includes('$9.500'));
  assert.ok(out.text.includes('Total: $9.500'));
});

test('omits delivery notes line when address.notes is empty', () => {
  const order = mockOrder({
    address: {
      street: 'Av. Test',
      number: '1',
      commune: 'X',
      city: 'Y',
      notes: null,
    },
    customer_instructions: null,
  });
  const out = buildOrderConfirmationEmail(order);
  assert.ok(!out.html.includes('Indicaciones de entrega'));
  assert.ok(!out.html.includes('Indicaciones del pedido'));
  assert.ok(!out.text.includes('Indicaciones entrega'));
  assert.ok(!out.text.includes('Indicaciones pedido'));
});

test('accepts flat order shape (contact_email / contact_name fallback)', () => {
  const out = buildOrderConfirmationEmail({
    id: 99,
    contact_name: 'Pedro',
    contact_email: 'pedro@example.com',
    contact_phone: '+56 9 9999 9999',
    address_street: 'A',
    address_number: '1',
    address_commune: 'B',
    address_city: 'C',
    payment_method: 'transferencia',
    items: [{ name: 'X', price: 1000, quantity: 1, subtotal: 1000 }],
    subtotal: 1000,
    total: 1000,
  });
  assert.equal(out.to, 'pedro@example.com');
  assert.match(out.subject, /#99/);
  assert.ok(out.html.includes('Pedro'));
});

test('throws when order is missing entirely', () => {
  assert.throws(() => buildOrderConfirmationEmail(null), /order is required/);
  assert.throws(() => buildOrderConfirmationEmail(undefined), /order is required/);
});

// --- Cycle 180: bloque bancario para transferencia ---

const bankAccount = {
  holderRut:        '12.345.678-5',
  holderName:       'Juan Pérez Soto',
  accountTypeKey:   'corriente',
  accountTypeLabel: 'Cuenta Corriente',
  accountNumber:    '00012345678',
  bankKey:          'estado',
  bankLabel:        'BancoEstado',
  holderEmail:      'pagos@amacafe.cl',
};

test('renders bank block when payment_method is transferencia and bankAccount provided', () => {
  const order = mockOrder({ payment_method: 'transferencia', bankAccount });
  const out = buildOrderConfirmationEmail(order);
  assert.match(out.html, /Datos para tu transferencia/);
  assert.ok(out.html.includes('BancoEstado'));
  assert.ok(out.html.includes('Cuenta Corriente'));
  assert.ok(out.html.includes('00012345678'));
  assert.ok(out.html.includes('12.345.678-5'));
  assert.ok(out.html.includes('Juan Pérez Soto'));
  assert.ok(out.html.includes('pagos@amacafe.cl'));
  assert.match(out.text, /Datos para tu transferencia/);
  assert.ok(out.text.includes('BancoEstado'));
  assert.ok(out.text.includes('00012345678'));
});

test('omits bank block when payment_method is tarjeta even if bankAccount present', () => {
  const order = mockOrder({ payment_method: 'tarjeta', bankAccount });
  const out = buildOrderConfirmationEmail(order);
  assert.ok(!out.html.includes('Datos para tu transferencia'));
  assert.ok(!out.text.includes('Datos para tu transferencia'));
});

test('omits bank block when payment_method is transferencia but bankAccount missing', () => {
  const order = mockOrder({ payment_method: 'transferencia', bankAccount: null });
  const out = buildOrderConfirmationEmail(order);
  assert.ok(!out.html.includes('Datos para tu transferencia'));
});

test('bank block escapes XSS in holder name and account number', () => {
  const order = mockOrder({
    payment_method: 'transferencia',
    bankAccount: {
      ...bankAccount,
      holderName:    '<img src=x onerror=alert(1)>',
      accountNumber: '<script>steal()</script>',
    },
  });
  const out = buildOrderConfirmationEmail(order);
  assert.ok(!out.html.includes('<img src=x'));
  assert.ok(!out.html.includes('<script>steal'));
  assert.ok(out.html.includes('&lt;img src=x'));
});

test('bank block detects "depósito" / "transfer" variants', () => {
  for (const method of ['transferencia', 'Transferencia', 'transfer', 'deposito']) {
    const out = buildOrderConfirmationEmail(mockOrder({ payment_method: method, bankAccount }));
    assert.match(out.html, /Datos para tu transferencia/, `falló para método "${method}"`);
  }
});
