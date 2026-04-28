# Railway Deploy Walkthrough — amaCafe

Eight numbered steps to ship the backend + frontend from this repo to Railway.
Generated in Cycle 87 (R1–R8). Companion to the live `railway.toml` files at
`./railway.toml` (backend) and `./frontend/railway.toml` (frontend). When the
TOML and this doc disagree, the TOML wins — it is what Railway actually reads.

A printable checklist version is at the bottom.

---

## R1. Push the cleaned repo to GitHub

Pre-flight (Cycle 87 — G1/G3/G4):

```bash
./scripts/install-git-hooks.sh        # arm pre-commit hook
git status                             # confirm no node_modules / .DS_Store / .env are staged
git diff --cached --stat               # sanity-check the diff size
```

Then publish:

```bash
gh repo create amacafe --private --source=. --remote=origin --push
# or, if origin already exists:
git push -u origin master
```

The pre-commit hook (G4) will refuse to ship `node_modules/`, `.env`, `.DS_Store`,
`dist/` or any single file >5 MiB. Override only with `--no-verify` and only when
you understand why.

## R2. Create the Railway project and connect the repo

In the Railway dashboard:

1. **New Project** → **Deploy from GitHub repo** → select the `amacafe` repo.
2. Railway will create one default service. **Delete it** — we want two
   purpose-built services (backend + frontend) configured below.

## R3. Add the Postgres plugin

1. Project → **+ New** → **Database** → **PostgreSQL**.
2. Railway provisions a managed Postgres and exposes `DATABASE_URL` as a
   shared variable. Copy its value or rely on `${{Postgres.DATABASE_URL}}`
   reference syntax in step R5.

## R4. Create the backend service

1. Project → **+ New** → **GitHub Repo** → pick the same repo.
2. **Service Settings → Source → Root Directory: `backend`**. This is critical:
   `railway.toml` at the repo root assumes Nixpacks runs inside `backend/`.
3. The TOML config is auto-detected — no manual build/start command needed.
   `preDeployCommand` runs `node scripts/migrate.js && node scripts/seed-volume-images.js`
   before the listener takes traffic (C84 + C85).

## R5. Configure backend environment variables

In the backend service → **Variables**, add:

| Variable                | Value                                                                                                  | Notes                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `${{Postgres.DATABASE_URL}}`                                                                            | Reference the plugin from R3.                                                                                        |
| `NODE_ENV`              | `production`                                                                                            | Activates the SumUp failsafe (mode≠mock).                                                                            |
| `ENCRYPTION_SECRET`     | freshly generated 32-byte base64                                                                       | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Do not reuse** the local-dev value. |
| `SUMUP_MODE`            | `live`                                                                                                  | Cycle 87 (R9) bootstrap promotes this into `settings.sumup_mode` on first boot. Set to `live` for prod.              |
| `SUMUP_RETURN_URL_BASE` | the public frontend URL (set after R7 once Railway assigns the host)                                   | Required by the SumUp checkout to build success / failure / webhook URLs.                                            |
| `FRONTEND_URL`          | the public frontend URL (after R7)                                                                     | CORS origin allow-list.                                                                                              |
| `IMAGES_STORAGE_PATH`   | `/data/products`                                                                                        | Must match the volume mount path in R6.                                                                              |
| `PORT`                  | *(leave unset)*                                                                                         | Railway injects it; `server.js` reads `process.env.PORT`.                                                            |

`SUMUP_RETURN_URL_BASE` and `FRONTEND_URL` can be left blank for the very
first deploy and filled in after R7 produces the frontend URL — the backend
will boot, just refuse to issue checkouts until they are set.

## R6. Attach the persistent volume (images)

1. Backend service → **Volumes** → **New Volume**.
2. **Mount path**: `/data` (must match `[deploy.volumes]` in `railway.toml`
   and the prefix of `IMAGES_STORAGE_PATH`).
3. Default size (1 GiB) is plenty for the current 12-image baseline. Bump it
   if/when the catalog grows.

The first boot’s `seed-volume-images.js` copies the bundled `fuentes/products/`
baseline into `/data/products`. Subsequent boots are no-ops on already-present
files, so admin uploads are never overwritten by a re-seed (C85 invariant).

## R7. Create the frontend service

1. Project → **+ New** → **GitHub Repo** → same repo.
2. **Service Settings → Source → Root Directory: `frontend`**.
3. **Variables**:
   - `VITE_API_BASE_URL` = `https://<backend-service>.up.railway.app/api`
     (use the URL Railway assigned to the backend in R5; include `/api`).
   - `PORT` left unset (Railway injects, `vite preview` reads `$PORT`).
4. After the frontend deploys, copy its public URL and **go back to R5** to
   set `SUMUP_RETURN_URL_BASE` and `FRONTEND_URL` on the backend, then
   redeploy the backend service so the new env values take effect.

`VITE_*` variables are inlined into the bundle at *build time*. Any change
requires a redeploy of the frontend service — restart alone is not enough.

## R8. Smoke-test the live deploy

Run these against the public URLs Railway assigned. Treat each one as a gate
before exercising the next.

```bash
# 1. Backend health.
curl -fsS https://<backend>.up.railway.app/api/health
# Expected: 200 OK with JSON body.

# 2. Confirm sumup mode resolved correctly. Tail the backend logs and look for:
#    [sumup] bootstrap: promoted SUMUP_MODE env to settings (was='mock', now='live')
#    [sumup] mode=live (source=settings)
# If you see "FAILSAFE TRIGGERED" the boot is dying — fix SUMUP_MODE in R5.

# 3. Frontend serves the bundle.
curl -fsS -o /dev/null -w '%{http_code}\n' https://<frontend>.up.railway.app/
# Expected: 200.

# 4. CORS handshake from frontend → backend.
curl -fsS -o /dev/null -w '%{http_code}\n' \
  -H "Origin: https://<frontend>.up.railway.app" \
  https://<backend>.up.railway.app/api/health
# Expected: 200 with Access-Control-Allow-Origin matching the Origin header.

# 5. Volume persistence E2E (the C85 acceptance test).
#    a. Log into /admin (admin / admin123 — rotate immediately!).
#    b. Upload an image via the product admin UI.
#    c. From Railway: Service → Restart.
#    d. Refresh the storefront — the image URL must still resolve.
#       If it 404s, IMAGES_STORAGE_PATH or the volume mount is misconfigured.
```

---

## Printable checklist

- [ ] **R1** — `install-git-hooks.sh` ran; clean `git push` to GitHub.
- [ ] **R2** — Railway project created; default service deleted.
- [ ] **R3** — Postgres plugin provisioned; `DATABASE_URL` available.
- [ ] **R4** — Backend service created with **Root Directory = `backend`**.
- [ ] **R5** — All eight backend env vars set (`DATABASE_URL`, `NODE_ENV`,
       `ENCRYPTION_SECRET`, `SUMUP_MODE`, `SUMUP_RETURN_URL_BASE`,
       `FRONTEND_URL`, `IMAGES_STORAGE_PATH`, ~~`PORT`~~).
- [ ] **R6** — Volume mounted at `/data`; `IMAGES_STORAGE_PATH=/data/products`.
- [ ] **R7** — Frontend service created with **Root Directory = `frontend`**;
       `VITE_API_BASE_URL` points at the backend; backend `FRONTEND_URL` /
       `SUMUP_RETURN_URL_BASE` updated and redeployed.
- [ ] **R8** — `/api/health` 200; sumup logs show `mode=live (source=settings)`;
       frontend bundle 200; CORS preflight clean; image upload survives a
       service restart.

---

## Troubleshooting

- **`[sumup] FAILSAFE TRIGGERED`** at boot — `NODE_ENV=production` and the
  effective sumup mode resolved to `mock`. Check that `SUMUP_MODE=live` is set
  on the backend service (R5). Cycle 87 added a one-shot env→settings promoter
  in `server.js`, so flipping the env var and redeploying is sufficient.
- **404 on `/static/products/<file>`** after a redeploy — the volume isn’t
  mounted, or `IMAGES_STORAGE_PATH` doesn’t match the mount path. Re-check R6.
- **CORS errors in browser console** — `FRONTEND_URL` on the backend doesn’t
  match the actual frontend origin Railway assigned. Update R5 and redeploy.
- **`VITE_*` change doesn’t take effect** — variables are baked at build time.
  Redeploy the frontend service (a restart is not enough).
- **`migrate.js` fails preDeploy** — Railway aborts the rollout and keeps the
  previous version live. Inspect the build logs for the failed migration name
  and fix forward; do not bypass.
