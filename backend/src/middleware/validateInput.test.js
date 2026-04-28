// Cycle 101 (OPTION B) — Tests for central validateInput middleware.
//
// Covers: SQLi/XSS/NoSQL pattern detection, deep walk on nested bodies,
// arrays, length cap, false-positive guard on legitimate Spanish/CL text,
// per-field bypass via fields option, and the express middleware contract
// (req.body / req.query / req.params, 400 response shape).
//
// Run: node --test backend/src/middleware/validateInput.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateInput,
  detectMaliciousPattern,
  walk,
  MAX_STRING_LENGTH,
} = require('./validateInput');

// ─── detectMaliciousPattern ─────────────────────────────────────────────────

test('detectMaliciousPattern: SQLi boolean injection (single-quote OR)', () => {
  const hit = detectMaliciousPattern("admin' OR '1'='1");
  assert.ok(hit, 'should flag classic boolean injection');
  assert.equal(hit.kind, 'sqli');
});

test('detectMaliciousPattern: SQLi UNION SELECT', () => {
  const hit = detectMaliciousPattern("1 UNION SELECT username, password FROM admin_users");
  assert.ok(hit);
  assert.equal(hit.kind, 'sqli');
});

test('detectMaliciousPattern: SQLi stacked DROP TABLE', () => {
  const hit = detectMaliciousPattern("'; DROP TABLE products;--");
  assert.ok(hit);
  assert.equal(hit.kind, 'sqli');
});

test('detectMaliciousPattern: SQLi pg_sleep timing payload', () => {
  const hit = detectMaliciousPattern("1' AND pg_sleep(5)--");
  assert.ok(hit);
  assert.equal(hit.kind, 'sqli');
});

test('detectMaliciousPattern: SQLi line comment', () => {
  const hit = detectMaliciousPattern("user-- comment");
  assert.ok(hit);
  assert.equal(hit.kind, 'sqli');
});

test('detectMaliciousPattern: XSS <script> tag', () => {
  const hit = detectMaliciousPattern("<script>alert(1)</script>");
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: XSS img onerror handler', () => {
  const hit = detectMaliciousPattern('<img src=x onerror="alert(1)">');
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: XSS javascript: URI', () => {
  const hit = detectMaliciousPattern('javascript:alert(document.cookie)');
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: XSS svg onload', () => {
  const hit = detectMaliciousPattern('<svg onload=alert(1)>');
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: XSS data:text/html URI', () => {
  const hit = detectMaliciousPattern('data:text/html,<script>x</script>');
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: XSS prototype pollution marker', () => {
  const hit = detectMaliciousPattern('__proto__: {"isAdmin": true}');
  assert.ok(hit);
  assert.equal(hit.kind, 'xss');
});

test('detectMaliciousPattern: NoSQL operator $where', () => {
  const hit = detectMaliciousPattern('{ "$where": "this.password == \'\'" }');
  assert.ok(hit);
  assert.equal(hit.kind, 'nosql');
});

// ─── False-positive guard on legitimate text ────────────────────────────────

test('detectMaliciousPattern: legitimate Spanish text passes', () => {
  const samples = [
    'Café latte con leche de almendras y caramelo',
    'Pedido para entregar en Av. Providencia 1234, dpto 502',
    'Cliente solicita sin azúcar y con poca leche',
    'amaCafé — café de especialidad',
    'Si pueden, dejarlo en recepción del edificio',
    'Llamar al teléfono +56 9 1234 5678 antes de subir',
  ];
  for (const s of samples) {
    assert.equal(detectMaliciousPattern(s), null, `false-positive on: ${s}`);
  }
});

test('detectMaliciousPattern: legitimate emails and SKUs pass', () => {
  const samples = [
    'cliente@ejemplo.cl',
    'CAFE-LATTE-001',
    'admin@amacafe.com',
    'sku_123-XYZ',
  ];
  for (const s of samples) {
    assert.equal(detectMaliciousPattern(s), null, `false-positive on: ${s}`);
  }
});

test('detectMaliciousPattern: empty/null/non-string returns null', () => {
  assert.equal(detectMaliciousPattern(''), null);
  assert.equal(detectMaliciousPattern(null), null);
  assert.equal(detectMaliciousPattern(undefined), null);
  assert.equal(detectMaliciousPattern(42), null);
  assert.equal(detectMaliciousPattern(true), null);
});

// ─── walk: nested structures ────────────────────────────────────────────────

test('walk: detects payload inside nested object', () => {
  const body = {
    contact: { name: 'Juan', email: "x' OR '1'='1" },
    address: { street: 'Las Condes 100' },
  };
  const r = walk(body);
  assert.ok(r);
  assert.equal(r.kind, 'sqli');
  assert.equal(r.path, 'contact.email');
});

test('walk: detects payload inside array element', () => {
  const body = {
    items: [
      { name: 'Latte', notes: 'sin azúcar' },
      { name: '<script>alert(1)</script>', notes: 'con leche' },
    ],
  };
  const r = walk(body);
  assert.ok(r);
  assert.equal(r.kind, 'xss');
  assert.equal(r.path, 'items[1].name');
});

test('walk: clean nested object returns null', () => {
  const body = {
    contact: { name: 'María', email: 'maria@ejemplo.cl', phone: '+56912345678' },
    address: {
      street: 'Av. Apoquindo',
      number: '4500',
      commune: 'Las Condes',
      city: 'Santiago',
      notes: 'Piso 12, oficina 1201',
    },
    payment_method: 'tarjeta',
    customer_instructions: 'Por favor llamar antes de subir, gracias',
  };
  assert.equal(walk(body), null);
});

test('walk: rejects oversize string', () => {
  const huge = 'a'.repeat(MAX_STRING_LENGTH + 1);
  const r = walk({ description: huge });
  assert.ok(r);
  assert.equal(r.kind, 'length');
  assert.equal(r.path, 'description');
});

test('walk: ignores non-string primitives', () => {
  const body = { id: 42, available: true, price: 1500, deleted_at: null };
  assert.equal(walk(body), null);
});

// ─── Express middleware contract ────────────────────────────────────────────

function makeReqRes(req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req: { method: 'POST', originalUrl: '/api/test', ...req }, res };
}

test('middleware: passes through clean body', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({ body: { name: 'Latte', price: 3500 } });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('middleware: rejects 400 on SQLi in body', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({ body: { username: "admin' OR '1'='1", password: 'x' } });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'sqli_pattern_detected');
  assert.equal(res.body.field, 'username');
  // Pattern source must NOT leak to client.
  assert.equal(res.body.pattern, undefined);
});

test('middleware: rejects 400 on XSS in query string', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: {},
    query: { search: '<script>alert(1)</script>' },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'xss_pattern_detected');
  assert.equal(res.body.field, 'search');
});

test('middleware: rejects 400 on NoSQL operator in nested body', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: { filter: { $where: 'this.x == 1' } },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'nosql_operator_detected');
});

test('middleware: rejects 400 on oversize string', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: { description: 'x'.repeat(MAX_STRING_LENGTH + 1) },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'string_too_long');
  assert.equal(res.body.field, 'description');
});

test('middleware: fields option restricts inspection scope', () => {
  // Only inspect query — body XSS should pass through.
  const mw = validateInput({ fields: ['query'] });
  const { req, res } = makeReqRes({
    body: { name: '<script>alert(1)</script>' },
    query: {},
  });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('middleware: missing req.body / req.query / req.params is safe', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({});
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// ─── Realistic checkout payload (5-endpoint corpus) ─────────────────────────

test('corpus: legitimate POST /api/orders body passes', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: {
      cart_id: 'abc-123',
      contact: { name: 'Pedro Pérez', email: 'pedro@ejemplo.cl', phone: '+56912345678' },
      address: {
        street: 'Av. Providencia',
        number: '1234',
        commune: 'Providencia',
        city: 'Santiago',
        notes: 'Dpto 502, llamar al portero',
      },
      payment_method: 'tarjeta',
      customer_instructions: 'Por favor entregar antes de las 15:00',
    },
  });
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('corpus: malicious POST /api/auth/login is blocked', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: { username: "admin'--", password: 'irrelevant', captcha_id: 'x', captcha_answer: '1' },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'sqli_pattern_detected');
});

test('corpus: stored-XSS attempt on POST /api/admin/products is blocked', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: {
      name: '<img src=x onerror="fetch(`/steal?c=${document.cookie}`)">',
      category_id: 1,
      price: 3500,
    },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'xss_pattern_detected');
  assert.equal(res.body.field, 'name');
});

test('corpus: SQLi on PUT /api/admin/products/:id description is blocked', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: { description: "x'; DROP TABLE products;--" },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'sqli_pattern_detected');
});

test('corpus: XSS in admin search query is blocked', () => {
  const mw = validateInput();
  const { req, res } = makeReqRes({
    body: {},
    query: { search: 'javascript:alert(1)' },
  });
  mw(req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'xss_pattern_detected');
});
