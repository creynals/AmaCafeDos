# WORKSPACE IDENTITY

> Documento canónico de identidad del workspace activo.
> **Cycle 50** introdujo este documento (OPTION A — mínimo invasivo).
> **Cycle 53** completó la corrección renombrando `projectName` → `amaCafe` en toda la metadata operativa (fix del UX confuso reportado en Cycle 52).

## Identidad Canónica

| Campo | Valor |
|---|---|
| **Directorio físico canónico** | `import-1777213083759-63z86j` |
| **Path absoluto** | `/Users/christianreynals/Documents/Personales/goLAB/SYNAPTIC/SYNAPTIC_EXPERT/packages/agent/workspaces/import-1777213083759-63z86j` |
| **Project ID (físico)** | `import-1777213083759-63z86j` |
| **Project Name (display)** | `amaCafe` *(actualizado en Cycle 53)* |
| **Project Name previo (alias legacy)** | `import-1776956320164-2m9x2n` *(deprecado)* |
| **Creado** | 2026-04-26T14:18:03.759Z |
| **Renombrado** | 2026-04-27 (Cycle 53) |
| **Estado** | ACTIVO — usar para todos los ciclos SYNAPTIC |

## Alias Histórico

| Campo | Valor |
|---|---|
| **Directorio alias (legacy)** | `import-1776956320164-2m9x2n` |
| **Path absoluto** | `/Users/christianreynals/Documents/Personales/goLAB/SYNAPTIC/SYNAPTIC_EXPERT/packages/agent/workspaces/import-1776956320164-2m9x2n` |
| **Origen** | Workspace original `amaCafe`, creado 2026-04-23 |
| **Estado** | DEPRECATED — ver `import-1776956320164-2m9x2n/DEPRECATED.md` |
| **Último ciclo activo en este dir** | Cycle ≤44 (2026-04-26 ~23:02) |
| **Razón del fork** | Re-importación de workspace que generó nuevo `projectId` físico |

## Backup .zip (gestión usuario)

| Campo | Valor |
|---|---|
| **Origen** | Respaldo manual hecho por el usuario sobre `import-1777213083759-63z86j` |
| **Ubicación** | NO documentada en el repo — gestionada externamente por el usuario |
| **Propósito** | Snapshot defensivo previo a operaciones sensibles (rotación de secrets, purga git, etc.) |
| **Nota** | Si se restaura, restaurar al directorio canónico `import-1777213083759-63z86j` |

## Reglas de Convivencia

1. **Todo trabajo nuevo** ocurre en `import-1777213083759-63z86j` (este directorio).
2. **NO** modificar archivos en `import-1776956320164-2m9x2n` salvo para mantenimiento de su `DEPRECATED.md`.
3. **SYNAPTIC INTELLIGENCE** ya fue migrado en Cycle 53 a `projectName: amaCafe`. La trazabilidad histórica del alias legacy se preserva en `previousName` / `previousProjectName` dentro de cada metadata file. La cadena de decisiones (ciclos 1–49) permanece intacta en `decisions[]` de `INTELLIGENCE.json`.
4. **Backend cwd guard** (pendiente, MEDIUM en roadmap) debe validar contra `basePath` de este archivo.

## Decisiones Relacionadas

- **Cycle 45–48**: Análisis de la divergencia entre `projectName` y dir físico.
- **Cycle 49**: Decision Gate — usuario eligió OPTION A (mínimo invasivo).
- **Cycle 50**: Ejecución de la sincronización mínima invasiva (no renombró `projectName`).
- **Cycle 51–52**: Usuario reporta UX confuso — el dashboard SYNAPTIC seguía mostrando `import-1776956320164-2m9x2n`.
- **Cycle 53** (este fix): Renombrado completo `projectName` → `amaCafe` en `.synaptic-workspace.json`, `.synaptic/session.json`, `.synaptic/INTELLIGENCE.json` y `DESIGN_DOC.md`. Alias legacy preservado en campos `previousName`/`previousProjectName` para trazabilidad.

---

*Última actualización: 2026-04-27 — Cycle 53 (fix del UX confuso reportado en Cycle 52)*
