// Email del código de verificación de checkout (C205).
//
// Pure function: dado el código (6 dígitos) y el destinatario, produce el
// payload {to, subject, html, text} para mailer.sendMail. Mantiene HTML simple
// (table + inline styles) para renderizar en Gmail/Outlook sin assets externos.

const TTL_MIN = 10;

function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function buildCheckoutCodeEmail({ to, code }) {
  const safeCode = escapeHtml(code);
  const subject = `Tu código amaCafe: ${safeCode}`;

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#faf6f0;font-family:Arial,sans-serif;color:#3a2a1a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#faf6f0;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
          <tr><td style="padding:24px 32px;background:#a06b3a;color:#fff;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;font-size:20px;">Tu código para cargar tus datos</h1>
          </td></tr>
          <tr><td style="padding:24px 32px;">
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.5;">
              Usa este código en el checkout de amaCafe para autocompletar tus datos de contacto y entrega y no tener que reescribirlos:
            </p>
            <div style="margin:8px 0 16px 0;text-align:center;">
              <span style="display:inline-block;font-size:34px;font-weight:bold;letter-spacing:8px;color:#a06b3a;background:#fdf6ec;border:1px solid #e6d8be;border-radius:8px;padding:14px 24px;font-family:monospace;">${safeCode}</span>
            </div>
            <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#6b513a;">
              El código vence en ${TTL_MIN} minutos y es de un solo uso.
            </p>
            <p style="margin:16px 0 0 0;font-size:12px;color:#8a7560;line-height:1.4;">
              Si no solicitaste este código, puedes ignorar este correo: nadie puede ver tus datos sin él.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    'Tu código para cargar tus datos en amaCafe:',
    '',
    `    ${code}`,
    '',
    `El código vence en ${TTL_MIN} minutos y es de un solo uso.`,
    'Si no solicitaste este código, ignora este correo: nadie puede ver tus datos sin él.',
  ].join('\n');

  return { to, subject, html, text };
}

module.exports = { buildCheckoutCodeEmail, escapeHtml };
