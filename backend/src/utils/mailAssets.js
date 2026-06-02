// Resolución de assets públicos para emails (C204).
//
// Los correos (confirmación de pedido) referencian imágenes por URL absoluta:
// los clientes de correo (Gmail/Outlook) no cargan adjuntos inline de forma
// confiable ni data: URIs. El logo de AMA Café se sirve como /images/logo-ama.jpg
// desde el storefront, y la base pública del sitio es la misma que usa SumUp
// para los return URLs (sumup_return_url_base), por lo que la reutilizamos.
//
// Prioridad:
//   1. MAIL_LOGO_URL (override explícito, URL absoluta http(s)).
//   2. <returnUrlBase>/images/logo-ama.jpg
//   3. null → el template omite el logo y cae al header de solo texto.

const { getReturnUrlBase } = require('./sumup.config');

const ABSOLUTE_HTTP = /^https?:\/\//i;
const LOGO_PATH = '/images/logo-ama.jpg';

async function resolveLogoUrl() {
  const explicit = String(process.env.MAIL_LOGO_URL || '').trim();
  if (ABSOLUTE_HTTP.test(explicit)) return explicit;

  try {
    const base = String((await getReturnUrlBase()) || '').trim().replace(/\/+$/, '');
    if (ABSOLUTE_HTTP.test(base)) return `${base}${LOGO_PATH}`;
  } catch {
    // getReturnUrlBase puede fallar si la BD no responde; no romper el email.
  }
  return null;
}

module.exports = { resolveLogoUrl };
