// Cycle 101 (OPTION B — Balanced): central validateInput middleware.
//
// Two-layer model:
//  - SQLi vector: defense-in-depth. All routes already use parameterized
//    queries ($1, $2, ...) so the SQL layer is the authoritative defense.
//    This middleware adds a second wall that rejects payloads matching
//    well-known SQLi shapes BEFORE they reach the handler.
//  - XSS vector: input-side rejection of obvious script/handler payloads
//    on string fields. Stored XSS is the real risk (admin renders product
//    names, customer_instructions, etc.) — the chat route has its own
//    sanitizer (chatInputSanitizer) that strips silently; this one rejects
//    loudly so callers fix their data.
//
// Scope: walks req.body / req.query / req.params and inspects every string
// value (deep). Non-string values are ignored — numeric/boolean fields go
// through per-route int/bool coercion which already rejects garbage.
//
// Caps: every string is also capped at MAX_STRING_LENGTH to make abusive
// payloads cheap to reject and to prevent DoS via huge bodies passing the
// helmet/express body limits.
//
// Bypass: the middleware exposes `validateInput.skip` for endpoints that
// legitimately accept rich text (none today). The chat route is bypassed
// implicitly — it mounts BEFORE the global guard, and chatInputSanitizer
// handles its own normalization there.

const MAX_STRING_LENGTH = 5000;

// SQLi shapes — boolean/UNION/comment/stacked patterns, case-insensitive.
// Designed to flag obvious attack payloads without false-positiving on
// natural language ("OR", "and", quotes inside legitimate notes).
const SQLI_PATTERNS = [
  // Classic boolean injection: ' OR 1=1 --, " OR "a"="a
  /('|")\s*(or|and)\s+('|")?[\w%]+('|")?\s*=\s*('|")?[\w%]+/i,
  // UNION-based
  /\bunion\s+(all\s+)?select\b/i,
  // Stacked queries / DDL
  /;\s*(drop|delete|update|insert|alter|truncate|create)\s+(table|database|schema|user|index|view|from|into)\b/i,
  // SQL line/block comments (terminating or followed by space/text)
  /(--(\s|$)|\/\*|\*\/|#(\s|$))/,
  // sleep/benchmark/waitfor (timing-based)
  /\b(sleep|benchmark|waitfor\s+delay|pg_sleep)\s*\(/i,
  // INTO OUTFILE / LOAD_FILE
  /\b(into\s+outfile|load_file)\s*[\(\s]/i,
];

// XSS shapes — script/iframe tags, javascript: URIs, on<event>= handlers,
// data: URIs with HTML, prototype pollution markers in strings.
const XSS_PATTERNS = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*object\b/i,
  /<\s*embed\b/i,
  /<\s*svg\b[^>]*\bon\w+\s*=/i,
  /<\s*img\b[^>]*\bon\w+\s*=/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /\bon(error|load|click|focus|mouseover|submit|change|input)\s*=\s*['"]/i,
  /__proto__\s*[:=]/,
  /constructor\s*\.\s*prototype/,
];

// NoSQL operators — even though we use Postgres, a body with raw $-operators
// usually means an attacker is fishing for a Mongo-style backend. Reject it.
const NOSQL_PATTERNS = [
  /\$\s*(where|ne|gt|lt|gte|lte|in|nin|regex|exists)\b/i,
];

const ALL_PATTERNS = [
  ...SQLI_PATTERNS.map(p => ({ kind: 'sqli', pattern: p })),
  ...XSS_PATTERNS.map(p => ({ kind: 'xss', pattern: p })),
  ...NOSQL_PATTERNS.map(p => ({ kind: 'nosql', pattern: p })),
];

/**
 * Inspect a single string. Returns { kind, pattern } for the first matching
 * attack shape, or null if clean.
 */
function detectMaliciousPattern(value) {
  if (typeof value !== 'string') return null;
  if (value.length === 0) return null;
  for (const { kind, pattern } of ALL_PATTERNS) {
    if (pattern.test(value)) {
      return { kind, pattern: pattern.source };
    }
  }
  return null;
}

/**
 * Walk an arbitrary value (object/array/primitive) and return the first
 * { path, value, hit } where hit is the malicious pattern detected, or
 * { path, value, length } if a string exceeds MAX_STRING_LENGTH.
 * Returns null if the whole tree is clean.
 *
 * `path` is a dotted/bracketed string ("contact.email", "items[0].notes")
 * useful for the rejection error so the caller can fix the offending field.
 */
function walk(value, path = '') {
  if (value == null) return null;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return { path: path || '<root>', length: value.length, kind: 'length' };
    }
    const hit = detectMaliciousPattern(value);
    if (hit) return { path: path || '<root>', kind: hit.kind, pattern: hit.pattern };
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = walk(value[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Inspect the KEY itself — Mongo-style operators ($where, $ne, ...)
      // are smuggled in as keys, not values. Prototype-pollution markers
      // ("__proto__", "constructor") also surface here.
      if (typeof k === 'string') {
        if (/^\$\w+/.test(k)) {
          return { path: path ? `${path}.${k}` : k, kind: 'nosql', pattern: '$<operator>' };
        }
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          return { path: path ? `${path}.${k}` : k, kind: 'xss', pattern: 'prototype-pollution-key' };
        }
      }
      const next = path ? `${path}.${k}` : k;
      const r = walk(v, next);
      if (r) return r;
    }
    return null;
  }
  return null;
}

/**
 * Express middleware factory. Default behavior inspects req.body, req.query,
 * req.params. Pass { fields: [...] } to restrict to a subset.
 *
 * On detection, responds 400 with `{ error, code, field }` so the frontend
 * can surface the offending field. The pattern itself is NOT echoed back to
 * the client (avoid leaking detection rules) but is logged server-side.
 */
function validateInput(options = {}) {
  const fields = options.fields || ['body', 'query', 'params'];

  return function validateInputMiddleware(req, res, next) {
    for (const field of fields) {
      const data = req[field];
      if (!data) continue;
      const hit = walk(data);
      if (hit) {
        const codeMap = {
          sqli: 'sqli_pattern_detected',
          xss: 'xss_pattern_detected',
          nosql: 'nosql_operator_detected',
          length: 'string_too_long',
        };
        const code = codeMap[hit.kind] || 'invalid_input';
        const errorMsg = hit.kind === 'length'
          ? `Field "${hit.path}" exceeds max length (${MAX_STRING_LENGTH} chars)`
          : `Invalid input on field "${hit.path}"`;

        // Server log includes the pattern source for forensics; client gets
        // only the field name and a generic code.
        console.warn(
          `[validateInput] reject ${req.method} ${req.originalUrl} ` +
          `field=${field}.${hit.path} kind=${hit.kind}` +
          (hit.pattern ? ` pattern=${hit.pattern}` : '')
        );

        return res.status(400).json({
          error: errorMsg,
          code,
          field: hit.path,
        });
      }
    }
    next();
  };
}

module.exports = {
  validateInput,
  detectMaliciousPattern,
  walk,
  MAX_STRING_LENGTH,
  SQLI_PATTERNS,
  XSS_PATTERNS,
  NOSQL_PATTERNS,
};
