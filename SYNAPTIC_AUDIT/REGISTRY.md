# SYNAPTIC AUDIT REGISTRY

## Metadata
- **Version:** 1.0.0
- **Last Updated:** 2026-04-28T16:11:56.958Z
- **Status:** ACTIVE

---

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| Ciclos Auditados | 51 |
| Score Promedio | 54% |
| Racha Actual (A/B) | 4 ciclos |
| Último Ciclo | 127 |
| Última Calificación | A |
| Findings Abiertos | 217 |
| Findings Resueltos | 42 |

---

## Findings Abiertos por Severidad

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL | 2 |
| HIGH | 0 |
| MEDIUM | 176 |
| LOW | 39 |

---

## Findings Abiertos por Tipo

| Tipo | Cantidad |
|------|----------|
| Dead Code | 165 |
| Security | 2 |
| Maintainability | 50 |
| Duplication | 0 |
| Consistency | 0 |

---

## Últimos 10 Findings Abiertos

| ID | Tipo | Severidad | Archivo | Descripción |
|-----|------|-----------|---------|-------------|
| SAI-b2c74955 | dead_code | MEDIUM | utils/imageStorage.js | Unused function: 'ensureImagesDir' (5 lines)... |
| SAI-9e1fcd4a | dead_code | MEDIUM | scripts/seed-volume-images.js | Unused function: 'for' (13 lines)... |
| SAI-4e7fca60 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'getMode' (3 lines)... |
| SAI-fdc63616 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'invalidateReturnUrlCache' (3 lin... |
| SAI-6be101f2 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'bootstrapModeFromEnv' (26 lines)... |
| SAI-ece3ea11 | dead_code | MEDIUM | utils/sumup.config.js | Unused function: 'buildReturnUrls' (8 lines)... |
| SAI-5a0d6f8d | dead_code | MEDIUM | middleware/validateInput.js | Unused function: 'validateInput' (38 lines)... |
| SAI-b1728a6b | dead_code | MEDIUM | middleware/validateInput.test.js | Unused function: 'status' (1 lines)... |
| SAI-f594e8d8 | dead_code | MEDIUM | middleware/validateInput.test.js | Unused function: 'json' (1 lines)... |
| SAI-f5d1cbb5 | security | CRITICAL | middleware/validateInput.test.js | Potential hardcoded secret detected... |

---

## Historial de Scores (Últimos 20)

| Ciclo | Score | Grade |
|-------|-------|-------|
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
| 101 | 0 | F |
| 104 | 100 | A |
| 107 | 100 | A |
| 121 | 100 | A |
| 127 | 100 | A |

---

*Generado automáticamente por SAI (Sistema de Auditoría Incremental)*
*Protocolo SYNAPTIC v3.0*
