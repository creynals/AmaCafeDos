# 🏗️ DESIGN_DOC.md - import-1776956320164-2m9x2n

## SYNAPTIC Protocol v3.0 - Architecture Document

---

## 1. PROJECT OVERVIEW

### 1.1 Project Name
import-1776956320164-2m9x2n

### 1.2 Description
Imported from /Users/christianreynals/Documents/Personales/goLAB/SYNAPTIC/SYNAPTIC_EXPERT/packages/agent/workspaces/import-1776956320164-2m9x2n

### 1.3 Project Type
To be defined

### 1.4 Domain
General

---

## 2. ARCHITECTURE DECISIONS

### Decision Log

| ID | Decision | Option Selected | Date | Rationale |
|----|----------|-----------------|------|-----------|
| - | - | - | - | - |

*Decisions will be logged here as they are made through Decision Gates*

---

## 3. TECHNOLOGY STACK

### 3.1 Frontend
To be defined

### 3.2 Backend
To be defined

### 3.3 Infrastructure
To be defined

---

## 4. SYSTEM COMPONENTS

*Components will be documented as they are designed*

### Component Diagram
```
[To be generated]
```

---

## 5. DATA FLOW

*Data flow will be documented as architecture evolves*

---

## 6. SECURITY CONSIDERATIONS

- [ ] Authentication method defined
- [ ] Authorization rules documented
- [ ] Data encryption requirements specified
- [ ] API security measures planned

---

## 7. PATTERNS & CONVENTIONS

### Patterns to Follow
*Will be populated as decisions are made*

### Anti-patterns to Avoid
*Will be populated based on learnings*

---

## 8. EVOLUTION HISTORY

| Cycle | Change | Impact | Synaptic Strength |
|-------|--------|--------|-------------------|
| 0 | Initial creation | Baseline | 0% |

---

*Created: 2026-04-26T14:18:03.772Z*
*SYNAPTIC Protocol v3.0 - Architecture Evolution Tracking*

## Decisions

| ID | Decision | Rationale | Date | Cycle |
|----|----------|-----------|------|-------|
| DEC-007 | Plantilla Excel descargable vía GET /api/admin/products/bulk-template | Reduce errores de formato del usuario | 2026-04-26 | 3 |
| DEC-006 | Bulk import requiere admin autenticado (requireAuth) | Operaciones masivas son sensibles, restringir a roles privilegiados | 2026-04-26 | 3 |
| DEC-005 | Categorías solo existentes, no auto-crear | Evitar pollution del catálogo de categorías por errores de Excel | 2026-04-26 | 3 |
| DEC-004 | Soft delete vía columna action=delete en Excel | Permite eliminación masiva sin destrucción de datos (deleted_at) | 2026-04-26 | 3 |
| DEC-003 | Imágenes en filesystem local (fuentes/products/) | Sin dependencia cloud, servido vía /static/products/ | 2026-04-26 | 3 |
| DEC-002 | SKU opcional en bulk import | Flexibilidad para productos sin SKU asignado al momento de carga | 2026-04-26 | 3 |
| DEC-001 | Tab 'Importación Masiva' separada de 'Gestión Productos' | UX clara: bulk operations no se mezclan con CRUD individual | 2026-04-26 | 3 |


## Technical Notes

- [Cycle 3] Bulk import usa xlsx + multer para parsing y upload
- [Cycle 3] Procesamiento transaccional con rollback en error
- [Cycle 3] Auditoría en products_audit con action='bulk_import'
- [Cycle 3] Migración 010a_ idempotente garantiza base para 011

## Architecture Changes

- [Cycle 3, 2026-04-26] Nueva ruta /api/admin/products/* protegida por requireAuth
- [Cycle 3, 2026-04-26] Nuevo tab 'bulk-import' en AdminPage
- [Cycle 3, 2026-04-26] Nuevo servicio productsBulkImport con parser/validator/processor
- [Cycle 3, 2026-04-26] Storage local en fuentes/products/ servido como /static/products/
