const rateLimit = require('express-rate-limit');

/**
 * Sanitiza texto removiendo HTML, scripts y caracteres peligrosos.
 * Preserva texto normal, emojis y puntuación estándar.
 */
function sanitizeText(input) {
  if (typeof input !== 'string') return '';

  return input
    // Remover tags HTML/XML completos
    .replace(/<[^>]*>/g, '')
    // Remover javascript: y data: URIs
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    // Remover event handlers (onclick, onerror, etc.)
    .replace(/on\w+\s*=/gi, '')
    // Remover intentos de inyección de template literals
    .replace(/\$\{[^}]*\}/g, '')
    // Limitar largo máximo (prevenir abuse)
    .slice(0, 500)
    .trim();
}

/**
 * Sanitiza la respuesta del LLM antes de enviarla al cliente.
 * Remueve HTML, bloques de código ejecutable y contenido potencialmente peligroso.
 */
function sanitizeResponse(text) {
  if (typeof text !== 'string') return '';

  return text
    // Remover tags HTML/XML
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    // Remover tags HTML pero preservar contenido de texto
    .replace(/<[^>]*>/g, '')
    // Remover javascript: y data: URIs
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    // Remover event handlers
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Middleware para sanitizar input del chat antes de procesarlo.
 */
function chatInputSanitizer(req, res, next) {
  if (req.body && req.body.message) {
    req.body.message = sanitizeText(req.body.message);

    if (!req.body.message) {
      return res.status(400).json({ error: 'Mensaje inválido después de sanitización' });
    }
  }

  // Sanitizar historial también
  if (req.body && Array.isArray(req.body.history)) {
    req.body.history = req.body.history.map(msg => ({
      ...msg,
      content: sanitizeText(msg.content),
    }));
  }

  next();
}

/**
 * Rate limiter específico para el endpoint de chat.
 * Limita a 15 mensajes por minuto por IP.
 */
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiados mensajes. Espera un momento antes de enviar otro.',
    reply: 'Has enviado muchos mensajes seguidos. Por favor espera un momento antes de continuar. ⏳',
  },
});

module.exports = { sanitizeText, sanitizeResponse, chatInputSanitizer, chatRateLimiter };
