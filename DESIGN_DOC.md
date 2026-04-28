# 🏗️ DESIGN_DOC.md - amaCafe

## SYNAPTIC Protocol v3.0 - Architecture Document

---

## 1. PROJECT OVERVIEW

### 1.1 Project Name
amaCafe

> Renombrado en Cycle 53 desde alias legacy `import-1776956320164-2m9x2n`. Workspace físico canónico: `import-1777213083759-63z86j`.

### 1.2 Description
amaCafe — proyecto de la cadena de cafés AMA (storefront + backend administrativo + Bulk Import + Vista de Cocina + integración SumUp).

Workspace físico canónico: `/Users/christianreynals/Documents/Personales/goLAB/SYNAPTIC/SYNAPTIC_EXPERT/packages/agent/workspaces/import-1777213083759-63z86j`.

### 1.3 Project Type
To be defined

### 1.4 Domain
General

---

## 2. ARCHITECTURE DECISIONS

### Decision Log

| ID | Decision | Option Selected | Date | Rationale |
|----|----------|-----------------|------|-----------|
| C100/C101 | Input hardening strategy | OPTION B — Audit + Central validateInput Middleware + Tests | 2026-04-28 | Single global guard on `/api/*` for SQLi/XSS/NoSQL pattern detection + length cap, complementing parameterized SQL. Loud 400 rejection (chat exempted — uses silent sanitizer). 32 tests covering 5 highest-risk endpoints. Files: `backend/src/middleware/validateInput.js`, `validateInput.test.js`. |
| C103/C104 | INTELLIGENCE snapshot bloat strategy | OPTION B — Pre-flight + Gitignore + Tag + Push | 2026-04-28 | Untracked 10 timestamped INTELLIGENCE snapshots (~45k lines), added `.gitignore` patterns for `.synaptic/backups/` and `.synaptic/intelligence/`. Tag `pre-railway-c102` as rollback anchor. Fast-forward push (no `--force`). |
| C106/C107 | Reconciliación divergencia main local vs origin | OPTION B — Rebase con drop del duplicado | 2026-04-28 | Detectado commit local `eea6d78` (C104 POST) idéntico a origin `cab5f03` (chore synaptic ignore, mismo árbol y timestamp). Drop local, rebase 3 commits SYNAPTIC PRE (C105/C106/C107) sobre origin/main, fast-forward push. Tag `pre-rebase-c107` como rollback anchor. Sin `--force`, historia lineal. |

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
| DEC-116 | Rotation cycle C116 halted with BLOCKED_PRECONDITIONS_NOT_MET (exit code 2) | OLD/NEW_ENCRYPTION_SECRET missing from env; payment_methods table inexistent — smoke test target invalid | 2026-04-28 | 116 |
| DEC-114 | Ejecutar cluster C112+C113 con Option B: pre-flight focalizado + validación entre pasos + SumUp prod diferido | Balance óptimo entre reversibilidad y velocidad; alinea con preferencia explícita C113 y patrón histórico | 2026-04-28 | 114 |
| DEC-113 | Ejecutar cluster C112+C113 secuencial con checkpoint entre pasos y tag pre-rotation-c113 | Honra cluster aprobado en C112; checkpoint reduce blast radius; rollback global vía git tag + pg_dump | 2026-04-28 | 113 |
| DEC-112 | Ejecutar bloque pre-deploy en dos ciclos: rotación secretos (C112+C113) y infra Railway (C114+C115) | Atomicidad por dominio: separar crypto local de infra cloud reduce blast radius y permite verificación intermedia | 2026-04-28 | 112 |
| DEC-107 | Reconciliar divergencia main vía rebase --onto con drop de eea6d78 + push FF | Evita --force, preserva historia lineal, recuperable por tag pre-rebase-c107 | 2026-04-28 | 107 |
| DEC-106 | Reconciliar main vía rebase --onto descartando commit duplicado eea6d78 | Preserva bookkeeping C105/C106, elimina ruido del duplicado, push fast-forward sin --force | 2026-04-28 | 106 |
| DEC-104 | Untrack .synaptic/backups/INTELLIGENCE_*.json + create pre-railway-c102 tag | Establish clean rollback anchor before Railway deploy R1-R8 | 2026-04-28 | 104 |
| DEC-103 | Publish C101 deliverable to origin/main via Option B (gitignore INTELLIGENCE + tag + fast-forward push) | Balanced approach: clean remote history, rollback anchor, no history rewrite, halt-on-anomaly safety | 2026-04-28 | 103 |
| DEC-101B | Exempt chat and webhooks via mount order, not skip logic | Mount before guard preserves silent sanitizer for chat; keeps guard config simple | 2026-04-28 | 101 |
| DEC-101 | Central validateInput middleware with deep-walk pattern detection | Defense-in-depth layer above parameterized SQL; loud rejection with structured error | 2026-04-28 | 101 |
| DEC-100 | Decision Gate presented 3 options for input-hardening (A/B/C); awaiting user selection | ENFORCE-SYNAPTIC-PROTOCOL directive overrode immediate execution; gap analysis revealed no central validation layer | 2026-04-28 | 100 |
| DEC-098 | Require explicit task definition in BITACORA before referencing by label across cycles | C96/C97 architect-mode entries had no persisted task schema, blocking C98 execution | 2026-04-28 | 98 |
| DEC-095 | Validate GitHub state via gh api before delegating manual UI tasks to user | Tasks may already be auto-completed; avoids unnecessary user friction | 2026-04-28 | 95 |
| DEC-094 | Ejecutar Option B: rename master→main, push inicial, push tag pre-purge-c78 | Balance entre seguridad (tag respaldo) y simplicidad (sin force-push ni re-purga) | 2026-04-28 | 94 |
| DEC-093 | Decision Gate abierto: estrategia de push inicial a AmaCafeDos (Option A/B/C) | Usuario autorizó push pero mecánica (rename, tags, protección) requiere confirmación explícita | 2026-04-28 | 93 |
| DEC-087-3 | Stage cleanup deletions but defer commit to user | 1247-file deletion is dramatic; user must visually confirm before history changes | 2026-04-28 | 87 |
| DEC-087-2 | Install pre-commit hook via scripts/install-git-hooks.sh symlink (idempotent) | Prevent regression of node_modules/.DS_Store/.env/large-file commits | 2026-04-28 | 87 |
| DEC-087-1 | Add bootstrapModeFromEnv() promotion step before failsafe in logAndValidateSumupConfig | Fresh deploys cannot reach UI to flip mode; env var must be authoritative when set and valid | 2026-04-28 | 87 |
| DEC-085-3 | Bootstrap volume with baseline images via preDeployCommand seed script | Empty volume on first deploy would 404 baseline products; idempotent seed avoids re-copy | 2026-04-27 | 85 |
| DEC-085-2 | IMAGES_STORAGE_PATH env var resolves storage location, defaults to fuentes/products locally | Single switch parametrizes prod vs dev without code branches | 2026-04-27 | 85 |
| DEC-085-1 | Persist admin-uploaded product images via Railway Volume mounted at /data | Balanced tradeoff: persistence without object-storage complexity; keeps local dev unchanged | 2026-04-27 | 85 |
| DEC-084-3 | Image storage strategy (B2) elevated to Decision Gate with options A/B/C (git-only / Volume / R2) | Railway ephemeral FS + admin uploads is a strategic tradeoff (cost vs UX vs scale) | 2026-04-27 | 84 |
| DEC-084-2 | Backend migrations run via standalone scripts/migrate.js triggered by railway.toml preDeployCommand | Decouples schema sync from app boot; idempotent and re-runnable in CI (B4) | 2026-04-27 | 84 |
| DEC-084-1 | Frontend api.js BASE is configurable via VITE_API_BASE_URL with `/api` fallback | Enables Railway frontend service to point at separate backend domain without code changes (B3) | 2026-04-27 | 84 |
| DEC-082-C | Salt 'amacafe-salt' and GCM payload format preserved | Existing ciphertexts in settings table remain decryptable — no data migration required | 2026-04-27 | 82 |
| DEC-082-B | crypto.js becomes thin wrapper preserving {encrypt, decrypt} public API | routes/settings.js consumers unchanged — backwards-compatible refactor | 2026-04-27 | 82 |
| DEC-082-A | Crypto primitives consolidated in backend/src/utils/keyManager.js | Eliminate duplication between rotate-encryption-secret.js and crypto.js — single source of truth | 2026-04-27 | 82 |
| DEC-081 | Pendiente: elegir entre OPTION A (fix mínimo), B (refactor keyManager.js), C (key-versioning completo) | C79 estableció entorno local-only; C80 identificó duplicación cripto; recomendación SYNAPTIC = B por balance scope/calidad | 2026-04-27 | 81 |
| DEC-078-B | Tar.gz físico como única fuente de verdad para rollback | Tags pre-purga son reescritos por filter-repo, perdiendo su valor como punto de restauración | 2026-04-27 | 78 |
| DEC-078 | Ejecutar git filter-repo (Option B) como método estándar de purga | Recomendación oficial; repo local-only sin remote reduce riesgo; preserva estructura de 94 commits | 2026-04-27 | 78 |
| DEC-077 | Decision Gate abierto: estrategia de purga del historial git (A=BFG, B=filter-repo, C=recreación) | backend/.env permanece accesible vía git log/show pese a estar en .gitignore; bloqueante para deploy a Railway | 2026-04-27 | 77 |
| DEC-067-3 | Render condizionale del blocco istruzioni in OrdersTab e KitchenView | Evitare spazio sprecato per ordini senza istruzioni | 2026-04-27 | 67 |
| DEC-067-2 | Cap 1000 caratteri server-side + UI counter | Prevenire abuso e fornire feedback immediato all'utente | 2026-04-27 | 67 |
| DEC-067-1 | Campo customer_instructions a livello ordine, separato da order_items.notes e address_notes | Evitare collisione semantica tra istruzioni per prodotto, per consegna e per ordine globale | 2026-04-27 | 67 |
| DEC-058 | Toda Edit declarada en BITACORA debe ser verificada con Read/Grep antes de cerrar ciclo | C53 documentó cambio que nunca se aplicó; descubierto 4 ciclos después | 2026-04-27 | 57 |
| DEC-057 | projectName canónico = amaCafe; legacy alias preservado en previousName/legacyAliasId | Dashboard SYNAPTIC mostraba alias legacy por desync entre WORKSPACE_IDENTITY.md y .synaptic-workspace.json | 2026-04-27 | 57 |
| DEC-053 | Rename completo de projectName a 'amaCafe' en todos los metadata operativos | Saldar deuda técnica de Cycle 50 y resolver UX confuso reportado en Cycles 51-52 | 2026-04-27 | 53 |
| DEC-050 | Adopt OPTION A: sync metadata via aliasOf + WORKSPACE_IDENTITY.md + DEPRECATED.md | Minimum-invasive, preserves INTELLIGENCE chain (cycles 1-49) without renames or data migration | 2026-04-27 | 50 |
| DEC-050 | Canonical workspace dir is import-1777213083759-63z86j; the other is alias/orphan | All 48 cycles of work live in this physical directory | 2026-04-27 | 49 |
| DEC-049 | Persist all 🔴 ALTA recommendations as structured list in BITACORA per cycle | Verbal-only recommendations cannot be executed in subsequent cycles | 2026-04-27 | 49 |
| DEC-044-4 | Script de rotación de secrets siempre con dry-run por defecto | Operaciones destructivas requieren paso explícito --apply para evitar ejecuciones accidentales | 2026-04-26 | 44 |
| DEC-044-3 | Rate limiters dedicados por endpoint sensible en middleware/security.js | Perfiles de abuso distintos requieren límites distintos (login=brute force, upload=DoS) | 2026-04-26 | 44 |
| DEC-044-2 | requireAdmin aplicado en server.js a nivel de mount, no en cada router | Single source of truth para autorización admin; evita olvidar el guard en routers nuevos | 2026-04-26 | 44 |
| DEC-044-1 | Adoptar helmet@^8 con CSP custom (SumUp + reCAPTCHA whitelisted) | Defensa en profundidad: CSP previene XSS y limita orígenes externos a los estrictamente necesarios | 2026-04-26 | 44 |
| DEC-043 | Hero compacto sin h1 ni CTA 'Ver Menu' | h1 redundante con logo del header; CTA innecesario porque la grilla está inmediatamente debajo | 2026-04-26 | 42 |
| DEC-042 | Tagline 'Una nueva experiencia para disfrutar' migrado al header como pill central | Liberar espacio del Hero para que la grilla suba above-the-fold | 2026-04-26 | 42 |
| DEC-081 | Eliminar endpoint duplicado en settings.js, dejar comentario apuntando a server.js | Evitar código muerto y confusión sobre cuál handler responde | 2026-04-26 | 39 |
| DEC-080 | Endpoint /api/settings/recaptcha-config registrado en server.js antes del mount auth | Evita que requireAuth global bloquee el config necesario para el ChatWidget público | 2026-04-26 | 39 |
| DEC-031-C | Tests con node:test built-in en lugar de framework externo | Helper puro no justifica agregar Jest/Mocha como dependencia | 2026-04-26 | 31 |
| DEC-031-B | Migración 013 backfill idempotente con snapshot a orders_audit | Corrige 9 órdenes legacy (incl #189) y permite reversibilidad si hay problema | 2026-04-26 | 31 |
| DEC-031-A | Helper `deriveFulfillmentFromPayment` centraliza lógica payment→fulfillment status | Evita divergencia entre webhooks.js, orders.js, payments.js que tenían 3 UPDATE distintos | 2026-04-26 | 31 |
| DEC-082 | Auto-refresh 30s con toggle en Vista de Cocina | Operación en tiempo casi-real sin saturar backend | 2026-04-26 | 25 |
| DEC-081 | Bloquear avance de estado si payment_status != 'paid' | Evita preparar/enviar órdenes sin pago confirmado | 2026-04-26 | 25 |
| DEC-080 | Vista de Cocina como sub-tab de Órdenes (Opción C) | Mantiene consistencia con patrón sub-tabs del Ciclo 23 y resuelve gap de items no visibles | 2026-04-26 | 25 |
| DEC-024 | Use PRODUCTS_SUBTABS constant with description field per sub-tab | Centralized config enables contextual descriptions below sub-nav for user clarity | 2026-04-26 | 23 |
| DEC-023 | Consolidate 3 product tabs under single 'Productos' parent tab with sub-navigation | Reduces top-bar saturation from 8 to 6 tabs and groups semantically related views | 2026-04-26 | 23 |
| DEC-018-C | Vite proxy must include '/static' alongside '/api' and '/webhook' | Backend serves uploaded images under /static; missing proxy returns SPA HTML | 2026-04-26 | 18 |
| DEC-018-B | Drop inline regex from Express routes; validate numeric IDs in handler with Number.isInteger | Express 5 / path-to-regexp v8 no longer supports ':id(\d+)' syntax | 2026-04-26 | 18 |
| DEC-018-A | Backend must run from active workspace cwd, killed and restarted on workspace switch | Stale PIDs from prior workspaces silently serve old code, causing phantom 404s | 2026-04-26 | 18 |
| DEC-015 | Análisis Productos retiene tab analítico con icono BarChart3, sin sub-vista crud duplicada | Separación clara entre operación (Mantenedor) y análisis (métricas/inventario) | 2026-04-26 | 14 |
| DEC-014 | ProductsCrudPanel promovido a tab principal 'Mantenedor Productos' (default landing del AdminPage) | Fix UX inmediato: el panel CRUD estaba enterrado como sub-vista dentro de tab analítico | 2026-04-26 | 14 |
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

- [Cycle 116] Encrypted columns in db_taza_data are exclusively in 'settings' table (3 keys), not payment_methods
- [Cycle 116] rotate-encryption-secret.js requires both OLD and NEW env vars or aborts at lines 27-30
- [Cycle 116] keyManager.js (C81) is available for decrypt verification in smoke tests
- [Cycle 114] pg_dump parcial de tablas críticas (payment_methods, users, orders) como backup pre-rotación
- [Cycle 114] Smoke test focalizado: 5 muestras decrypt + 1 JWT round-trip entre C112 y C113
- [Cycle 114] CREDENTIAL_ROTATION_C112-C113.md gitignored con valores enmascarados
- [Cycle 113] Orden de rotación: ENCRYPTION_SECRET → validación SumUp decrypt → JWT_SECRET + RECAPTCHA_SECRET + SUMUP_API_KEY
- [Cycle 113] SUMUP_API_KEY prod requiere coordinación con dashboard del proveedor (potencial bloqueador)
- [Cycle 113] Backend reinicio + smoke test (login JWT + checkout SumUp) obligatorio post-rotación
- [Cycle 112] Pre-flight obligatorio: pg_dump + snapshot .env + verificar rows cifradas + tests round-trip keyManager
- [Cycle 112] Documentación rotación va en docs/CREDENTIAL_ROTATION_C112-C113.md (gitignored, sin valores)
- [Cycle 112] Tag pre-railway-c102 disponible como rollback anchor
- [Cycle 107] SHA mapping post-rebase: dae064c→bf7ad7a, 8226645→5622fb3, b5e33db→f8c3ddb
- [Cycle 107] Tag pre-rebase-c107 publicado en origin como punto de rollback
- [Cycle 107] Los 3 commits ahead eran puramente estado SYNAPTIC (harness/BITACORA/INTELLIGENCE)
- [Cycle 106] Commit eea6d78 (C104 POST SYNAPTIC) y cab5f03 (chore convencional) tienen diff idéntico: 5 ins / 45794 del / 11 archivos
- [Cycle 106] Merge base actual: cf40db2 (C104 PRE); divergencia +3/-1 vs origin/main
- [Cycle 106] Rebase de SHAs nunca pusheados no requiere --force-push
- [Cycle 104] Gitignore patterns added for INTELLIGENCE_*.json in both backups/ and intelligence/ paths
- [Cycle 104] Push was fast-forward (no --force), 14 commits to origin/main
- [Cycle 103] Pre-flight halt criteria: unexpected commits, sensitive files (.env), or non-fast-forward conflict abort the chain
- [Cycle 103] Tag pre-railway-c102 mirrors pre-purge-c78 convention as rollback anchor before external deploy
- [Cycle 103] Fast-forward push is reversible via git revert, not trivially — treat as MEDIUM blast radius
- [Cycle 101] validateInput.js: 171 LoC, walks body+query+params, 5000-char cap, inspects keys for $ops
- [Cycle 101] Test glob widened to src/middleware/*.test.js in package.json
- [Cycle 101] Chat route mounted at server.js:110 (pre-guard), validateInput at server.js:111
- [Cycle 100] Public routes (no requireAuth): auth.js, products.js, chat.js, webhooks.js, cart.js (per-handler)
- [Cycle 100] Stack: Express 5, helmet 8, express-rate-limit 8 — no validator library installed
- [Cycle 100] 13 route files require parameterized PG query audit for SQLi vector confirmation
- [Cycle 98] Architect-mode cycles must persist task definitions if Tier/Bx labels will be referenced later
- [Cycle 98] DG-079 Immediate Execution allows clarifying questions for ambiguous/risky scope
- [Cycle 95] Default branch on AmaCafeDos = main (verified via gh api)
- [Cycle 95] Only branch on remote = main; no stale branches to clean
- [Cycle 95] Last push timestamp 2026-04-28T01:02:39Z matches C94 push
- [Cycle 95] C78 filter-repo purge of .env remains intact after C94 push
- [Cycle 94] Remote origin: https://github.com/creynals/AmaCafeDos.git
- [Cycle 94] main HEAD remoto: d888a2f
- [Cycle 94] Tag pre-purge-c78 remota: 347807f
- [Cycle 94] Tag real es c78 (creada cuando purga ejecutó), no c77 (Decision Gate)
- [Cycle 93] Repo destino: https://github.com/creynals/AmaCafeDos (vacío)
- [Cycle 93] Branch local: master (historial reescrito en C78 vía filter-repo)
- [Cycle 93] Branch destino solicitado: main
- [Cycle 93] Tag pre-purge-c77 disponible localmente como respaldo de purga
- [Cycle 87] sumup.config.js exposes bootstrapModeFromEnv with DB UPSERT and in-proc cache invalidation
- [Cycle 87] server.js:144-153 calls promoter inside logAndValidateSumupConfig before mode resolution
- [Cycle 87] Pre-commit hook blocks .env* (allows .env.example), node_modules/, .DS_Store/Thumbs.db, dist/build/, files >5 MiB
- [Cycle 87] Backend test count: 27 (C85) → 35 (C87), +8 covering bootstrap edge cases
- [Cycle 85] imageStorage util is the only place IMAGES_DIR is computed; routes import it
- [Cycle 85] /static/products mount must precede /static in server.js for volume override to work
- [Cycle 85] preDeployCommand chains: migrate.js && seed-volume-images.js
- [Cycle 85] Test baseline now 27/27 (was 22/22) with 5 new resolver tests
- [Cycle 84] railway.toml at repo root configures backend; frontend/railway.toml configures frontend service
- [Cycle 84] backend/package.json now exposes `migrate` and `test` scripts
- [Cycle 84] Migration smoke test confirmed 55ms idempotent apply against live local Postgres
- [Cycle 82] keyManager exports: deriveKey, encryptWithSecret, decryptWithSecret, rotateValue + ALGORITHM/KEY_LENGTH/IV_LENGTH constants
- [Cycle 82] 16 round-trip tests in keyManager.test.js including cross-module compatibility
- [Cycle 82] Bug #2 (v{N}: versioning prefix) requires migration 014 + encryption_keys table — deferred to OPTION C
- [Cycle 81] crypto.js (45 líneas) y rotate-encryption-secret.js (138 líneas) duplican ALGORITHM, deriveKey, salt 'amacafe-salt', encrypt, decrypt
- [Cycle 81] OPTION B propone keyManager.js como módulo compartido con rotateValue(oldSecret, newSecret, encryptedText)
- [Cycle 81] OPTION C requiere migración 014 idempotente para prefijar valores existentes con v1:
- [Cycle 78] git-filter-repo v2.47.0 instalado en el sistema
- [Cycle 78] .git size reducido de 15M a 7.8M (-48%) tras purga
- [Cycle 78] backend/.env removido del histórico desde commit 95136d9 (C1) hasta d80d39b (C44)
- [Cycle 78] backend/.env.example preservado intacto en working tree e historial reescrito
- [Cycle 77] git filter-repo requiere brew install git-filter-repo en macOS
- [Cycle 77] BFG Repo-Cleaner requiere Java instalado (es un JAR)
- [Cycle 77] Force-push reescribe SHAs: cualquier clon externo debe re-clonar
- [Cycle 67] Migration 014 idempotente con IF NOT EXISTS
- [Cycle 67] createOrder() firma estesa a 5 parametri (5° = customerInstructions)
- [Cycle 67] INSERT orders esteso da 12 a 13 placeholders
- [Cycle 67] serializeOrder() aggiornato per includere il nuovo campo
- [Cycle 57] .synaptic-workspace.json es leído por el platform service para el header del dashboard
- [Cycle 57] PROJECT_INIT.synaptic.project.id debe ser el directorio físico, no el alias legacy
- [Cycle 57] Validar JSON con json.loads tras editar .synaptic-workspace.json y PROJECT_INIT.synaptic
- [Cycle 53] 7 archivos modificados: .synaptic-workspace.json, session.json, INTELLIGENCE.json, MANTRA.md, RULES.md, DESIGN_DOC.md, WORKSPACE_IDENTITY.md
- [Cycle 53] Alias legacy preservado solo en campos previousName, BITACORA histórica y backups
- [Cycle 53] Validación JSON post-cambio confirma decisions count preservado (2)
- [Cycle 50] Canonical dir: import-1777213083759-63z86j; historical alias projectName: import-1776956320164-2m9x2n
- [Cycle 50] WORKSPACE_IDENTITY.md is the canonical source of truth for workspace identity going forward
- [Cycle 49] BITACORA cycle entries must include explicit 'Recomendaciones' section when recommendations are issued
- [Cycle 49] WORKSPACE_IDENTITY.md should document canonical dir, alias, and backup .zip location
- [Cycle 44] ENCRYPTION_SECRET cifra settings.sumup_* y settings.recaptcha_secret_key — rotar requiere decrypt+re-encrypt
- [Cycle 44] helmet@^8.1.0 añadido como dependencia en backend/package.json
- [Cycle 44] 7 mounts admin protegidos con requireAdmin en server.js
- [Cycle 44] Limiters: authLimiter (/auth/login), bulkImportLimiter (/bulk-import), uploadImageLimiter (/upload-image)
- [Cycle 42] Header.jsx: pill tagline con icono Coffee, oculto en mobile (<md)
- [Cycle 42] Hero.jsx: padding reducido a py-6 sm:py-8 (~70-80% menos altura)
- [Cycle 42] Build: 1753 módulos, 156ms, 0 errores ESLint
- [Cycle 39] ChatWidget depende de GET /settings/recaptcha-config siendo público para cargar siteKey
- [Cycle 39] Endpoints /admin/settings/recaptcha* siguen protegidos por requireAuth - sin regresión
- [Cycle 31] UPDATE statements en webhooks/orders/payments ahora usan COALESCE($2, status) para no sobrescribir status manual
- [Cycle 31] Migración 013 se aplica automáticamente vía runMigrations() al iniciar backend
- [Cycle 31] 9 órdenes legacy #180-#189 con payment_status='failed' pasarán a status='cancelled'
- [Cycle 25] GET /api/admin/orders ahora retorna items[] vía json_agg+COALESCE
- [Cycle 25] KITCHEN_STATUSES=['pending','in_progress','out_for_delivery']
- [Cycle 25] Tailwind: usar mapas estáticos para clases condicionales por columna
- [Cycle 23] AdminPage.jsx now uses dual state: activeTab + activeProductsSubtab (default 'crud')
- [Cycle 23] Vite build: 1752 módulos en 160ms — performance baseline for AdminPage refactor
- [Cycle 23] ProductsCrudPanel / ProductsTab / BulkImportTab mounted unchanged under sub-nav
- [Cycle 21] Admin credentials for E2E: admin / admin123 @ localhost:8080
- [Cycle 21] Pending E2E validations: Bulk Import, Multi-image Gallery, Mantenedor Productos CRUD
- [Cycle 18] Backend PID 73456 now runs from import-1777213083759-63z86j/backend, log at /tmp/synaptic_backend_c18.log
- [Cycle 18] Migrations 010a and 012 are idempotent and applied in initSchema()
- [Cycle 18] Use lsof -p <pid> | grep cwd to verify a running process's working directory
- [Cycle 14] AdminPage.jsx TABS array: products-crud primero, products segundo
- [Cycle 14] Default activeTab cambiado de 'products' a 'products-crud'
- [Cycle 14] ProductsTab.view default ahora 'inventory' (sin opción 'crud')
- [Cycle 14] Build size: 430.13 kB / 115.65 kB gzip — sin regresión de bundle
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

- [Cycle 104, 2026-04-28] Repo state: origin/main at cab5f03, tag pre-railway-c102 at 47974e1d as rollback anchor
- [Cycle 103, 2026-04-28] Add .synaptic/intelligence/INTELLIGENCE_*.json to .gitignore (pending Option B confirmation)
- [Cycle 101, 2026-04-28] New middleware layer: backend/src/middleware/validateInput.js wired globally on /api after express.json()
- [Cycle 94, 2026-04-28] Repositorio AmaCafeDos ahora público en GitHub con branch main como principal
- [Cycle 87, 2026-04-28] SumUp config now has env→DB promotion phase on boot before mode resolution
- [Cycle 87, 2026-04-28] Repository now ships pre-commit hook + installer script under scripts/git-hooks/
- [Cycle 85, 2026-04-27] Backend storage path is now env-configurable via IMAGES_STORAGE_PATH
- [Cycle 85, 2026-04-27] Production image storage moved from git-bundled assets to Railway persistent Volume at /data/products
- [Cycle 84, 2026-04-27] Two-service Railway topology: backend (Nixpacks + preDeploy migrate + /api/health) and frontend (vite preview)
- [Cycle 84, 2026-04-27] Frontend BASE URL no longer hardcoded; resolved at build time from VITE_API_BASE_URL
- [Cycle 82, 2026-04-27] New shared utility layer: backend/src/utils/keyManager.js as crypto primitives module
- [Cycle 82, 2026-04-27] crypto.js reduced from 45 to 27 lines (thin wrapper)
- [Cycle 82, 2026-04-27] rotate-encryption-secret.js: ~30 duplicated lines removed
- [Cycle 81, 2026-04-27] Refactor pendiente: crypto.js se convertiría en wrapper delgado sobre keyManager.js si se elige OPTION B
- [Cycle 78, 2026-04-27] Histórico git completo reescrito: HEAD f7447e1 → 347807f, 94 commits con nuevos SHAs
- [Cycle 67, 2026-04-27] Schema orders esteso con colonna customer_instructions TEXT
- [Cycle 67, 2026-04-27] Admin GET /api/admin/orders SELECT esteso
- [Cycle 57, 2026-04-27] Estructura canónica: projectName (actual) + previousName + renamedAt + renamedInCycle en .synaptic-workspace.json
- [Cycle 57, 2026-04-27] PROJECT_INIT.synaptic ahora separa project.id (físico) de legacyAliasId (histórico)
- [Cycle 53, 2026-04-27] projectName canonical ahora es 'amaCafe' en lugar de 'import-1776956320164-2m9x2n'
- [Cycle 50, 2026-04-27] Introduced aliasOf/canonicalDir/canonicalProjectName fields in .synaptic-workspace.json schema
- [Cycle 44, 2026-04-26] Capa de seguridad HTTP centralizada: helmet + CSP + rate-limits + requireAdmin en server.js
- [Cycle 44, 2026-04-26] backend/.env removido del tracking git (sigue en disco local)
- [Cycle 39, 2026-04-26] server.js ahora registra rutas públicas individuales antes del mount con auth global
- [Cycle 31, 2026-04-26] Centralización de lógica fulfillment en backend/src/utils/sumup.js (single source of truth)
- [Cycle 25, 2026-04-26] Nuevo componente KitchenView.jsx (~370 líneas) bajo Órdenes
- [Cycle 25, 2026-04-26] OrderDetailsRow ahora incluye tabla de items en fila expandida
- [Cycle 23, 2026-04-26] AdminPage tab structure: 8 flat tabs → 6 tabs with 1 parent containing 3 sub-tabs
- [Cycle 18, 2026-04-26] Vite proxy table extended: /api, /webhook, /static all forward to localhost:7001
- [Cycle 14, 2026-04-26] AdminPage navegación primaria: Mantenedor Productos ahora landing tab
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
