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
| DEC-014 | Usar botones up/down en lugar de drag-and-drop para reorder inicial | MVP funcional rápido; DnD HTML5 queda como mejora futura | 2026-04-26 | 10 |
| DEC-013 | Sincronizar products.image_url automáticamente con imagen primaria | Mantener backward compatibility con código que aún usa image_url directo | 2026-04-26 | 10 |
| DEC-012 | Tabla product_images 1:N con CASCADE DELETE y UNIQUE parcial sobre is_primary | Garantiza integridad referencial y máximo una imagen principal por producto | 2026-04-26 | 10 |
| DEC-009-4 | Soft-delete reversible vía endpoint /restore | Evitar pérdida de datos y permitir auditoría completa de eliminaciones | 2026-04-26 | 9 |
| DEC-009-3 | Stock ajustable con modo absolute|delta en endpoint dedicado | Permite tanto fijar inventario como sumar/restar movimientos rápidos desde la tabla | 2026-04-26 | 9 |
| DEC-009-2 | Sub-vista 'Mantenedor' por defecto al abrir tab Gestión Productos | El CRUD es la operación más frecuente; analíticas quedan como vistas secundarias | 2026-04-26 | 9 |
| DEC-009-1 | CRUD admin de productos en archivo dedicado products-admin-crud.js | Separar endpoints administrativos del flujo de bulk import y catálogo público | 2026-04-26 | 9 |
| DEC-007 | Persist cart_id under localStorage key ama_cart_id | Reuse existing key already used by ChatWidget for consistency | 2026-04-26 | 6 |
| DEC-006 | Restore AuthContext, CartContext, ToastContext with consumer-derived API | Unblock frontend build (Cycle 3 blocker) without modifying any consumer component | 2026-04-26 | 6 |
| DEC-005 | Crear AuthContext, CartContext, ToastContext con API mínima | Desbloquear build E2E sin introducir cambios funcionales adicionales | 2026-04-26 | 5 |
| DEC-007 | Plantilla Excel descargable vía GET /api/admin/products/bulk-template | Reduce errores de formato del usuario | 2026-04-26 | 3 |
| DEC-006 | Bulk import requiere admin autenticado (requireAuth) | Operaciones masivas son sensibles, restringir a roles privilegiados | 2026-04-26 | 3 |
| DEC-005 | Categorías solo existentes, no auto-crear | Evitar pollution del catálogo de categorías por errores de Excel | 2026-04-26 | 3 |
| DEC-004 | Soft delete vía columna action=delete en Excel | Permite eliminación masiva sin destrucción de datos (deleted_at) | 2026-04-26 | 3 |
| DEC-003 | Imágenes en filesystem local (fuentes/products/) | Sin dependencia cloud, servido vía /static/products/ | 2026-04-26 | 3 |
| DEC-002 | SKU opcional en bulk import | Flexibilidad para productos sin SKU asignado al momento de carga | 2026-04-26 | 3 |
| DEC-001 | Tab 'Importación Masiva' separada de 'Gestión Productos' | UX clara: bulk operations no se mezclan con CRUD individual | 2026-04-26 | 3 |


## Technical Notes

- [Cycle 10] Migration 012 crea product_images con ON DELETE CASCADE desde products
- [Cycle 10] Endpoint POST usa FormData para multipart upload de imágenes
- [Cycle 10] GET /api/products/:id ahora incluye array images[] para storefront
- [Cycle 9] Todos los endpoints admin usan transacciones explícitas BEGIN/COMMIT/ROLLBACK
- [Cycle 9] Auditoría obligatoria en products_audit con acciones: create, update, stock_adjust, soft_delete, restore
- [Cycle 9] Validación SKU único excluye soft-deleted devolviendo 409 con mensaje claro
- [Cycle 9] Build frontend final: 423.91 kB (vite build OK)
- [Cycle 9] Lint baseline: 13 errores preexistentes mantenidos sin regresión
- [Cycle 6] Frontend build: 1750 modules, 402KB JS via Vite
- [Cycle 6] Bulk import endpoints support dry_run, 422 row-level validation, soft-delete, atomic transaction
- [Cycle 6] Migrations 003 and 006 are DML-only (no idempotency clauses needed)
- [Cycle 5] Frontend usa imports de ./context/{Auth,Cart,Toast}Context que no existen en filesystem
- [Cycle 5] main.jsx, AdminPage.jsx, LoginPage.jsx, UsersTab.jsx dependen de useAuth()
- [Cycle 5] npm run build falla con Module not found hasta restaurar contextos
- [Cycle 3] Bulk import usa xlsx + multer para parsing y upload
- [Cycle 3] Procesamiento transaccional con rollback en error
- [Cycle 3] Auditoría en products_audit con action='bulk_import'
- [Cycle 3] Migración 010a_ idempotente garantiza base para 011

## Architecture Changes

- [Cycle 10, 2026-04-26] Nuevo router products-admin-images registrado bajo requireAuth en server.js
- [Cycle 10, 2026-04-26] Frontend api.js extendido con 5 helpers para CRUD de imágenes
- [Cycle 9, 2026-04-26] Nuevo router backend: products-admin-crud.js bajo /api/admin/products
- [Cycle 9, 2026-04-26] Nuevo componente frontend: ProductsCrudPanel.jsx integrado en ProductsTab como sub-vista 'Mantenedor'
- [Cycle 9, 2026-04-26] 7 helpers API añadidos en frontend/src/api.js para CRUD admin de productos
- [Cycle 6, 2026-04-26] New frontend/src/context/ directory with 3 providers (Auth, Cart, Toast)
- [Cycle 6, 2026-04-26] auth-expired event listener pattern wired in AuthContext
- [Cycle 5, 2026-04-26] Restaurar carpeta frontend/src/context/ con 3 providers + hooks
- [Cycle 3, 2026-04-26] Nueva ruta /api/admin/products/* protegida por requireAuth
- [Cycle 3, 2026-04-26] Nuevo tab 'bulk-import' en AdminPage
- [Cycle 3, 2026-04-26] Nuevo servicio productsBulkImport con parser/validator/processor
- [Cycle 3, 2026-04-26] Storage local en fuentes/products/ servido como /static/products/
