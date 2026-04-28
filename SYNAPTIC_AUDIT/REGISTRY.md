# SYNAPTIC AUDIT REGISTRY

## Metadata
- **Version:** 1.0.0
- **Last Updated:** 2026-04-28T01:07:11.172Z
- **Status:** ACTIVE

---

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Ciclos Auditados | 46 |
| Score Promedio | 51% |
| Racha Actual (A/B) | 2 ciclos |
| Último Ciclo | 95 |
| Última Calificación | A |
| Findings Abiertos | 213 |
| Findings Resueltos | 42 |

---

## Findings Abiertos por Severidad

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL | 1 |
| HIGH | 0 |
| MEDIUM | 173 |
| LOW | 39 |

---

## Findings Abiertos por Tipo

| Tipo | Cantidad |
|------|----------|
| Dead Code | 162 |
| Security | 1 |
| Maintainability | 50 |
| Duplication | 0 |
| Consistency | 0 |

---

## Últimos 10 Findings Abiertos

| ID | Tipo | Severidad | Archivo | Descripción |
|-----|------|-----------|---------|-------------|
| SAI-a0c51627 | dead_code | MEDIUM | utils/keyManager.js | Unused function: 'rotateValue' (6 lines)... |
| SAI-cab6ae55 | dead_code | MEDIUM | utils/crypto.js | Unused function: 'encrypt' (3 lines)... |
| SAI-82b16be4 | dead_code | MEDIUM | utils/crypto.js | Unused function: 'decrypt' (8 lines)... |
| SAI-adde131e | security | CRITICAL | utils/crypto.js | Potential hardcoded secret detected... |
| SAI-b2c74955 | dead_code | MEDIUM | utils/imageStorage.js | Unused function: 'ensureImagesDir' (5 lines)... |
| SAI-9e1fcd4a | dead_code | MEDIUM | scripts/seed-volume-images.js | Unused function: 'for' (13 lines)... |
| SAI-4e7fca60 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'getMode' (3 lines)... |
| SAI-fdc63616 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'invalidateReturnUrlCache' (3 lin... |
| SAI-6be101f2 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'bootstrapModeFromEnv' (26 lines)... |
| SAI-ece3ea11 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'buildReturnUrls' (8 lines)... |

---

## Historial de Scores (Últimos 20)

| Ciclo | Score | Grade |
|-------|-------|-------|
| 10 | 0 | F |
| 14 | 0 | F |
| 18 | 80 | B |
| 23 | 0 | F |
| 25 | 0 | F |
| 31 | 50 | F |
| 39 | 100 | A |
| 42 | 80 | B |
| 44 | 45 | F |
| 50 | 100 | A |
| 53 | 100 | A |
| 57 | 100 | A |
| 67 | 0 | F |
| 78 | 100 | A |
| 82 | 35 | F |
| 84 | 100 | A |
| 85 | 80 | B |
| 87 | 20 | F |
| 94 | 100 | A |
| 95 | 100 | A |

---

*Generado automáticamente por SAI (Sistema de Auditoría Incremental)*
*Protocolo SYNAPTIC v3.0*
