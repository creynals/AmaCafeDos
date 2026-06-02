const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCheckoutCodeEmail } = require('./checkoutCodeEmail');

test('incluye código en subject, html y text', () => {
  const out = buildCheckoutCodeEmail({ to: 'x@y.cl', code: '482913' });
  assert.equal(out.to, 'x@y.cl');
  assert.match(out.subject, /482913/);
  assert.match(out.html, /482913/);
  assert.match(out.text, /482913/);
});

test('html escapa el código (no inyección)', () => {
  const out = buildCheckoutCodeEmail({ to: 'x@y.cl', code: '<script>x</script>' });
  assert.ok(!out.html.includes('<script>x'));
  assert.match(out.html, /&lt;script&gt;/);
});

test('menciona expiración y un solo uso', () => {
  const out = buildCheckoutCodeEmail({ to: 'x@y.cl', code: '111111' });
  assert.match(out.text, /vence/i);
  assert.match(out.text, /un solo uso/i);
});

// C206 — logo en la franja café
test('renderiza logo cuando logoUrl http(s) válido', () => {
  const out = buildCheckoutCodeEmail({ to: 'x@y.cl', code: '111111', logoUrl: 'https://amacafe.cl/images/logo-ama.jpg' });
  assert.match(out.html, /<img src="https:\/\/amacafe\.cl\/images\/logo-ama\.jpg" alt="AMA Café"/);
  assert.match(out.html, /background:#a06b3a[\s\S]*logo-ama\.jpg[\s\S]*Tu código/);
});

test('omite logo sin logoUrl o con valor no-http', () => {
  for (const bad of [undefined, 'javascript:x', 'data:image/png;base64,AA', '/rel.jpg']) {
    const out = buildCheckoutCodeEmail({ to: 'x@y.cl', code: '111111', logoUrl: bad });
    assert.ok(!out.html.includes('<img'), `no debió render img para ${bad}`);
    assert.match(out.html, /Tu código/);
  }
});
