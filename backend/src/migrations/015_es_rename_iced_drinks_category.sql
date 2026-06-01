-- Migration 015 — Spanish rename of "Iced Drinks" category
--
-- Cycle 155 SYNAPTIC (Immediate Execution / DG-079, OPTION B
-- "Reconstrucción asistida por código"):
--   Recuperado del prompt original C152 (truncado en INTELLIGENCE.json,
-- restaurado desde diff del commit C153 en BITACORA.md):
--     "Cambiar los siguientes texto de ingles a español:
--      'Iced Drinks' por 'Bebidas heladas'"
--
-- Update the existing display_name in production DB so previously seeded
-- rows reflect the Spanish copy. The internal `name` key (`iced`) stays
-- intact to keep references stable.
--
-- Idempotente: usa WHERE con valor antiguo; no afecta filas ya migradas.

UPDATE categories
   SET display_name = 'Bebidas heladas'
 WHERE name = 'iced'
   AND display_name = 'Iced Drinks';
