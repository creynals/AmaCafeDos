// Order confirmation email builder — C173
//
// Pure function: takes the same shape returned by POST /api/orders 201
// response (or the result of serializeOrder) and produces an email payload
// {to, subject, html, text} ready for mailer.sendMail.
//
// Keeps HTML simple (table + inline styles) so it renders in Gmail/Outlook
// without external assets. All dynamic strings are HTML-escaped to avoid
// XSS via injected order data.

const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

function formatCLP(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0';
  return '$' + n.toLocaleString('es-CL', { maximumFractionDigits: 0 });
}

// Cycle 180: detecta si el método de pago es "transferencia" en cualquiera
// de sus variantes (transferencia, transfer, deposito, deposit) para
// renderizar el bloque de datos bancarios en el email.
function isTransferPayment(method) {
  if (!method) return false;
  const m = String(method).toLowerCase();
  return m.includes('transfer') || m.includes('deposit');
}

function buildOrderConfirmationEmail(order) {
  if (!order || typeof order !== 'object') {
    throw new Error('buildOrderConfirmationEmail: order is required');
  }

  const orderId = order.order_id ?? order.id;
  const contact = order.contact || {
    name: order.contact_name,
    email: order.contact_email,
    phone: order.contact_phone,
  };
  const address = order.address || {
    street: order.address_street,
    number: order.address_number,
    commune: order.address_commune,
    city: order.address_city,
    notes: order.address_notes,
  };
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = order.subtotal ?? items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
  const total = order.total ?? subtotal;
  const paymentMethod = order.payment_method || '';
  const customerInstructions = order.customer_instructions || '';
  const bankAccount = order.bankAccount || null;
  const showBankBlock = isTransferPayment(paymentMethod)
    && bankAccount
    && bankAccount.holderRut
    && bankAccount.accountNumber;

  // C204: logo de AMA Café en la franja café del header. Solo se renderiza si
  // el caller inyectó una URL absoluta http(s) (resuelta en utils/mailAssets);
  // si no, el header cae a solo texto (sin imagen rota).
  const logoUrl = typeof order.logoUrl === 'string' && /^https?:\/\//i.test(order.logoUrl)
    ? order.logoUrl
    : null;

  const subject = `Confirmación de tu pedido amaCafe #${orderId}`;

  const itemsRowsHtml = items.map((item) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e6d8;">${escapeHtml(item.name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e6d8;text-align:center;">${escapeHtml(item.quantity)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e6d8;text-align:right;">${escapeHtml(formatCLP(item.price))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0e6d8;text-align:right;">${escapeHtml(formatCLP(item.subtotal))}</td>
    </tr>
  `).join('');

  const itemsLinesText = items.map((item) =>
    `  - ${item.quantity} x ${item.name}  ${formatCLP(item.price)}  =  ${formatCLP(item.subtotal)}`
  ).join('\n');

  const addressLine = [
    address?.street,
    address?.number,
    address?.commune,
    address?.city,
  ].filter(Boolean).join(', ');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Arial,sans-serif;color:#3a2a1a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#faf6f0;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
          <tr><td style="padding:24px 32px;background:#a06b3a;color:#fff;border-radius:8px 8px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                ${logoUrl ? `<td width="64" style="vertical-align:middle;padding-right:16px;">
                  <img src="${escapeHtml(logoUrl)}" alt="AMA Café" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;border:2px solid #ffffff;background:#ffffff;" />
                </td>` : ''}
                <td style="vertical-align:middle;">
                  <h1 style="margin:0;font-size:22px;line-height:1.2;">¡Gracias por tu compra, ${escapeHtml(contact?.name || '')}!</h1>
                  <p style="margin:6px 0 0 0;font-size:14px;opacity:0.9;">Pedido #${escapeHtml(orderId)} confirmado.</p>
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">
              Recibimos tu pedido y lo estamos preparando con cariño. Te avisaremos cuando salga en reparto.
            </p>

            <h2 style="margin:24px 0 8px 0;font-size:16px;color:#a06b3a;">Detalle del pedido</h2>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;border-collapse:collapse;">
              <thead>
                <tr style="background:#f6efe2;">
                  <th align="left"  style="padding:8px;border-bottom:1px solid #e6d8be;">Producto</th>
                  <th align="center" style="padding:8px;border-bottom:1px solid #e6d8be;">Cant.</th>
                  <th align="right" style="padding:8px;border-bottom:1px solid #e6d8be;">Precio</th>
                  <th align="right" style="padding:8px;border-bottom:1px solid #e6d8be;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" style="padding:10px 8px;text-align:right;font-weight:bold;">Total</td>
                  <td style="padding:10px 8px;text-align:right;font-weight:bold;">${escapeHtml(formatCLP(total))}</td>
                </tr>
              </tfoot>
            </table>

            <h2 style="margin:24px 0 8px 0;font-size:16px;color:#a06b3a;">Entrega</h2>
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;">${escapeHtml(addressLine)}</p>
            ${address?.notes ? `<p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#6b513a;"><em>Indicaciones de entrega:</em> ${escapeHtml(address.notes)}</p>` : ''}
            ${customerInstructions ? `<p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#6b513a;"><em>Indicaciones del pedido:</em> ${escapeHtml(customerInstructions)}</p>` : ''}

            <h2 style="margin:24px 0 8px 0;font-size:16px;color:#a06b3a;">Pago</h2>
            <p style="margin:0;font-size:13px;line-height:1.5;">
              Método: <strong>${escapeHtml(paymentMethod)}</strong>
            </p>
            ${showBankBlock ? `
            <div style="margin:16px 0 0 0;padding:14px 16px;background:#fdf6ec;border:1px solid #e6d8be;border-radius:6px;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#a06b3a;">Datos para tu transferencia</p>
              <p style="margin:0 0 10px 0;font-size:12px;color:#6b513a;line-height:1.5;">
                Realiza el depósito por <strong>${escapeHtml(formatCLP(total))}</strong> a la siguiente cuenta y envíanos el comprobante respondiendo este correo${bankAccount.holderEmail ? ` o a <a href="mailto:${escapeHtml(bankAccount.holderEmail)}" style="color:#a06b3a;">${escapeHtml(bankAccount.holderEmail)}</a>` : ''}.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;border-collapse:collapse;">
                <tbody>
                  <tr><td style="padding:4px 0;color:#8a7560;width:140px;">Banco</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;">${escapeHtml(bankAccount.bankLabel || bankAccount.bankKey || '')}</td></tr>
                  <tr><td style="padding:4px 0;color:#8a7560;">Tipo de cuenta</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;">${escapeHtml(bankAccount.accountTypeLabel || bankAccount.accountTypeKey || '')}</td></tr>
                  <tr><td style="padding:4px 0;color:#8a7560;">N° de cuenta</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;font-family:monospace;">${escapeHtml(bankAccount.accountNumber)}</td></tr>
                  <tr><td style="padding:4px 0;color:#8a7560;">RUT titular</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;font-family:monospace;">${escapeHtml(bankAccount.holderRut)}</td></tr>
                  ${bankAccount.holderName ? `<tr><td style="padding:4px 0;color:#8a7560;">Titular</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;">${escapeHtml(bankAccount.holderName)}</td></tr>` : ''}
                  <tr><td style="padding:4px 0;color:#8a7560;">Monto</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;">${escapeHtml(formatCLP(total))}</td></tr>
                  <tr><td style="padding:4px 0;color:#8a7560;">Referencia</td><td style="padding:4px 0;color:#3a2a1a;font-weight:bold;">Pedido #${escapeHtml(orderId)}</td></tr>
                </tbody>
              </table>
              <p style="margin:10px 0 0 0;font-size:11px;color:#8a7560;line-height:1.4;">
                Tu pedido se confirmará en cuanto verifiquemos el pago. Si tienes dudas, responde este correo.
              </p>
            </div>` : ''}

            <p style="margin:24px 0 0 0;font-size:12px;color:#8a7560;">
              Si tienes preguntas, responde este correo y un asesor de amaCafe te contactará.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    `¡Gracias por tu compra, ${contact?.name || ''}!`,
    `Pedido #${orderId} confirmado.`,
    '',
    'Detalle del pedido:',
    itemsLinesText,
    '',
    `Total: ${formatCLP(total)}`,
    '',
    'Entrega:',
    `  ${addressLine}`,
    address?.notes ? `  Indicaciones entrega: ${address.notes}` : null,
    customerInstructions ? `  Indicaciones pedido: ${customerInstructions}` : null,
    '',
    `Método de pago: ${paymentMethod}`,
    showBankBlock ? '' : null,
    showBankBlock ? 'Datos para tu transferencia:' : null,
    showBankBlock ? `  Banco:          ${bankAccount.bankLabel || bankAccount.bankKey || ''}` : null,
    showBankBlock ? `  Tipo de cuenta: ${bankAccount.accountTypeLabel || bankAccount.accountTypeKey || ''}` : null,
    showBankBlock ? `  N° de cuenta:   ${bankAccount.accountNumber}` : null,
    showBankBlock ? `  RUT titular:    ${bankAccount.holderRut}` : null,
    showBankBlock && bankAccount.holderName ? `  Titular:        ${bankAccount.holderName}` : null,
    showBankBlock ? `  Monto:          ${formatCLP(total)}` : null,
    showBankBlock ? `  Referencia:     Pedido #${orderId}` : null,
    showBankBlock && bankAccount.holderEmail ? `  Comprobante a:  ${bankAccount.holderEmail}` : null,
    '',
    'Si tienes preguntas, responde este correo.',
  ].filter((line) => line !== null).join('\n');

  return {
    to: contact?.email || null,
    subject,
    html,
    text,
  };
}

module.exports = {
  buildOrderConfirmationEmail,
  escapeHtml,
  formatCLP,
};
