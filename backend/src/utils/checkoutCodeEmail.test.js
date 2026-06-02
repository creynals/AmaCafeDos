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
