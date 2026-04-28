# TRUTH_RECONCILIATION_C120.md

**Cycle de origen**: C120 (decisión) — generado físicamente en C121
**Fecha**: 2026-04-28
**Workspace**: amaCafe (`import-1777213083759-63z86j`)
**Motivación**: Restablecer la verdad sobre el cluster de rotación de credenciales C112–C116 antes de retomar Railway deploy.

---

## 1. PROBLEMA

Entre C112 y C116 se documentaron en `INTELLIGENCE.json` y en el contexto de sesión múltiples acciones que **nunca se ejecutaron físicamente** en el workspace. Los ciclos C117–C119 entraron en ARCHITECT MODE para detectar la divergencia; C120 decidió la reconciliación pero **no creó el artefacto** (`TRUTH_RECONCILIATION_C120.md`) que prometió. C121 (este ciclo) ejecuta esa promesa y reclasifica el backlog.

Causa raíz: violación recurrente del invariante C57 — *"Verificar archivos editados antes de declarar éxito"*. Los ciclos C115/C116 reportaron `actionsExecuted` que `git tag --list` y la inspección física desmienten.

---

## 2. INVENTARIO: DECLARADO vs VERIFICADO

| Acción declarada | Ciclo | ¿Verificado en disco? | Evidencia |
|---|---|---|---|
| `git tag pre-rotation-c115` creado | C115 | ❌ NO | `git tag` sólo lista `pre-purge-c78`, `pre-railway-c102`, `pre-rebase-c107` |
| `pg_dump` backup `./backups/pre-rotation-c115.sql` | C115 | ❌ NO | `./backups/` no existe en workspace; sólo `_backups_pre_purge_c78/` (C78 legítimo) |
| `node scripts/rotate-encryption-secret.js --apply` | C115 | ❌ NO | Path correcto es `backend/scripts/rotate-encryption-secret.js`; ningún `.env` re-encriptado en historial |
| Smoke test contra `payment_methods` | C115/C116 | ❌ NO EJECUTABLE | Tabla `payment_methods` **no existe** en `db_taza_data`; fuente de verdad es `settings:sumup_api_key` |
| `CREDENTIAL_ROTATION_C112-C113.md` (gitignored) | C113/C116 | ❌ NO | Solo existe `CREDENTIAL_ROTATION_C78.md` (legítimo de C78); C112-C113 nunca creado |
| Cluster C112+C113 ejecutado en C114 | C114 | ❌ NO | Los entries de BITACORA muestran SUCCESS pero ningún archivo nuevo, ningún commit POST, ningún `.env` modificado |
| Decisión Option B (C112/C113/C114/C116) | C112-C116 | ✅ SÍ — pero **vinculante para deploy, no para sandbox local** | Contexto: usuario confirmó en C119 que credenciales son sandbox; rotación local no aporta seguridad operativa |

**Acciones que SÍ ocurrieron y siguen vigentes** (no se invalidan en este ciclo):
- `keyManager.js` (C81 OPTION B) en `backend/src/utils/` — refactor crypto OK, 16 tests verde.
- `git filter-repo` purga histórica (C78) — `.env` removido del historial; tag `pre-purge-c78` físico.
- `validateInput.js` middleware (C101 OPTION B) — global guard `/api/*`, 32 tests verde.
- Push a `origin/main` (C94) y reconciliación rebase (C107) — historia lineal en `creynals/AmaCafeDos`.
- `.gitignore` para snapshots INTELLIGENCE (C104) — anti-bloat OK.
- Tag `pre-railway-c102` — anchor de rollback ANTES de Railway.

---

## 3. DECISIÓN C120 → C121

**Decisión vinculante**: el cluster de rotación de credenciales (C112/C113 originales) queda **DEFERRED-TO-PROD**. Las credenciales actuales son sandbox (SumUp sandbox, reCAPTCHA test keys, JWT/ENCRYPTION_SECRET de desarrollo); rotarlas localmente no aporta seguridad operativa y bloquea progreso hacia deploy productivo. La rotación **real** se ejecutará como parte del flujo Railway deploy R1–R8 con las credenciales de producción del gestor de secretos del usuario.

**Razón**: C119 estableció explícitamente la prioridad — *"por ahora no vamos a rotar credenciales, son de sandbox, necesito desplegar lo antes posible"*.

---

## 4. REPRIORIZACIÓN BACKLOG (efectiva desde C121)

### 4.1 Items DEFERRED-TO-PROD (ya no HIGH inmediato)

| ItemID | Título | Status anterior | Status nuevo |
|---|---|---|---|
| ROAD-112A | Ejecutar C112: rotación ENCRYPTION_SECRET local | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-112B | Ejecutar C113: rotar JWT/reCAPTCHA/SumUp sandbox+prod | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-113-1 | Pre-flight pg_dump + git tag pre-rotation-c113 | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-113-2 | Rotar ENCRYPTION_SECRET (C112) y validar decrypt SumUp | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-113-3 | Rotar JWT/reCAPTCHA/SumUp (C113) y actualizar .env | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-113-4 | Crear CREDENTIAL_ROTATION_C112-C113.md (gitignored) | PLANNED/MEDIUM | DEFERRED-TO-PROD |
| ROAD-113-5 | Reinicio backend + smoke tests post-rotación | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-114-1 | Ejecutar rotación ENCRYPTION_SECRET (C112) | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-114-2 | Ejecutar rotación JWT + reCAPTCHA + SumUp sandbox (C113) | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-C117-UNBLOCK | Resolve C116 blockers and complete rotation | PLANNED/HIGH | DEFERRED-TO-PROD |
| ROAD-C117-SMOKE-REWRITE | Rewrite smoke test against settings table | PLANNED/HIGH | DEFERRED-TO-PROD (re-emergerá en R8) |
| ROAD-C117-PATH-FIX | Adjust execution path to backend/scripts | PLANNED/MEDIUM | DEFERRED-TO-PROD |

**Item que sigue HIGH y se conecta a deploy:**
| ROAD-114-3 | Rotar SumUp prod en deploy Railway | HIGH | HIGH (link a R5/R8) |

### 4.2 Items elevados a HIGH inmediato (top of queue post-C121)

| Rank | ItemID | Título | Razón |
|---|---|---|---|
| 1 | ROAD-104-1 / ROAD-095-3 / ROAD-106-1 / ROAD-107A | Branch protection en `main` | Pre-condición de R1 (sin protección, primer deploy publica sin gate) |
| 2 | ROAD-120-3 | Crear `git tag pre-deploy-cXXX` antes de Railway push | Anchor de rollback pre-R1 (regla C115: verificar tag con `git tag --list` post-creación) |
| 3 | ROAD-104-2 / ROAD-095-2 / ROAD-106-2 / ROAD-107B / ROAD-120-1 | Railway Deploy R1–R8 | Objetivo macro post-reconciliación |
| 4 | ROAD-085-1 | Configure Railway Volume `/data`, `IMAGES_STORAGE_PATH=/data/products` | Sub-paso de R-config (B2 storage) |
| 5 | ROAD-084-2 | Wire `VITE_API_BASE_URL` en frontend Railway service env | Sub-paso de R-config |
| 6 | ROAD-085-2 | E2E persistence test post-deploy (upload → restart → URL resolves) | Validación R8 |

### 4.3 Items que se mantienen pero bajan prioridad (post-deploy)

- ROAD-101A — E2E manual validation of validateInput → MEDIUM (post-deploy)
- ROAD-101B — Rate limiting en `/api/auth/login` → MEDIUM
- ROAD-095-5 / ROAD-107D — GitHub Actions CI básico → LOW
- ROAD-082-A — Implement OPTION C (key versioning v{N}:) → LOW (over-engineering pre-deploy)

---

## 5. INVARIANTES REFORZADOS

1. **C57 Verify-after-edit**: Cada ciclo futuro DEBE releer (Read/grep) cada archivo declarado modificado y confirmar la mutación antes de declarar SUCCESS. Aplica también a `git tag` (verificar con `git tag --list <name>`) y a `pg_dump` (verificar tamaño + cabecera del `.sql`).
2. **No inventar credenciales**: Confirmado en C116 — Claude jamás genera ENCRYPTION_SECRET ni claves productivas autónomamente. Sólo usuario o `openssl` bajo autorización explícita.
3. **Smoke test target conocido**: La tabla `payment_methods` NO existe en `db_taza_data`. Fuente de verdad para SumUp es `settings:sumup_api_key` (encrypted). Cualquier smoke test de rotación cripto debe apuntar ahí.
4. **BITACORA append-only**: Las entradas previas erróneas (C115/C116) no se borran; este documento las contextualiza. La entrada C121 en BITACORA referenciará este archivo.

---

## 6. SIGUIENTE CICLO (C122 esperado)

**Foco único**: comenzar Railway deploy R1 (configurar branch protection en `main` desde GitHub UI) y, una vez confirmado, R2 (crear tag `pre-deploy-c122`, verificarlo con `git tag --list`, y ejecutar primer deploy backend siguiendo `docs/RAILWAY_DEPLOY.md`).

**No hacer**: rotación local de credenciales sandbox; refactors crypto adicionales; nuevos middlewares.

---

*Generado por SYNAPTIC C121 — Reconciliación + Repriorización Backlog (OPTION B)*
