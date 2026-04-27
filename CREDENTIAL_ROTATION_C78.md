# 🔐 Checklist de Rotación de Credenciales — Post-Purga Ciclo 78

> **Generado**: 2026-04-27 (Ciclo 78)
> **Origen**: Decisión Gate Cycle 77 — Option B (git filter-repo) ejecutada en Cycle 78
> **Estado**: ⚠️ **PENDIENTE** — la purga del historial ya se ejecutó, pero las credenciales que estuvieron expuestas durante C1→C44 siguen siendo válidas hasta que se roten.

---

## ⚠️ Por qué esta rotación es OBLIGATORIA

La purga (`git filter-repo`) elimina los blobs de `backend/.env` del historial git. **No invalida las credenciales** que estuvieron contenidas en él. Cualquier credencial que vivió en un blob git (aunque sea por minutos) se considera comprometida permanentemente y debe rotarse.

Aplica el principio de seguridad estándar: **"si estuvo en el repo, está comprometido"**.

---

## 📋 Checklist por credencial

Marcar cada item con la fecha y el responsable cuando se complete.

### 1. `ENCRYPTION_SECRET` (cifrado at-rest)
- [ ] Generar nuevo valor: `openssl rand -hex 32`
- [ ] Ejecutar script de rotación: `node backend/scripts/rotate-encryption-secret.js --apply --old=<actual> --new=<nuevo>`
- [ ] Actualizar `backend/.env` con `ENCRYPTION_SECRET=<nuevo>`
- [ ] Reiniciar backend (`npm run dev`) y validar smoke test
- [ ] Fecha de rotación: __________ — Responsable: __________

### 2. SumUp Sandbox
- [ ] Login en https://developer.sumup.com (entorno sandbox)
- [ ] Revocar API key actual
- [ ] Generar nueva API key sandbox
- [ ] Actualizar `SUMUP_API_KEY` (sandbox) en `backend/.env`
- [ ] Validar checkout sandbox E2E
- [ ] Fecha: __________ — Responsable: __________

### 3. SumUp Producción
- [ ] Login en https://developer.sumup.com (entorno producción)
- [ ] Revocar API key actual
- [ ] Generar nueva API key prod
- [ ] Actualizar `SUMUP_API_KEY` (prod) en el secret manager del entorno productivo (NO en backend/.env)
- [ ] Validar checkout prod E2E (o mantener `SUMUP_MODE=sandbox` hasta que el deploy esté listo)
- [ ] Fecha: __________ — Responsable: __________

### 4. reCAPTCHA (Google)
- [ ] Login en https://www.google.com/recaptcha/admin
- [ ] Eliminar la site key actual del proyecto AmaCafe
- [ ] Crear nuevo par site key + secret key
- [ ] Actualizar `RECAPTCHA_SITE_KEY` (frontend `.env` o `vite.config.js`) y `RECAPTCHA_SECRET_KEY` (backend `.env`)
- [ ] Validar chat AI y formulario público que usa reCAPTCHA
- [ ] Fecha: __________ — Responsable: __________

### 5. `JWT_SECRET`
- [ ] Generar nuevo: `openssl rand -hex 64`
- [ ] Actualizar `JWT_SECRET` en `backend/.env`
- [ ] Reiniciar backend
- [ ] **Atención**: rotar JWT_SECRET invalida TODAS las sesiones activas — los usuarios deberán hacer login nuevamente
- [ ] Comunicar a usuarios admin antes de rotar
- [ ] Fecha: __________ — Responsable: __________

### 6. Contraseña DB (PostgreSQL/Neon/Railway)
- [ ] Acceder al provider DB (Neon dashboard, Railway, etc.)
- [ ] Reset password del rol que usa la app
- [ ] Actualizar `DATABASE_URL` en `backend/.env` con nueva contraseña
- [ ] Reiniciar backend y validar conexión
- [ ] Si la DB tiene otros consumidores (analytics, backups), actualizar también
- [ ] Fecha: __________ — Responsable: __________

---

## 🔍 Verificación post-rotación

Ejecutar al final de la rotación completa:

```bash
# 1. Verificar que backend arranca y conecta a DB
cd backend && npm run dev

# 2. Smoke test admin login (genera nuevo JWT con secret rotado)
# 3. Smoke test checkout SumUp (en sandbox)
# 4. Smoke test chat AI (verifica reCAPTCHA)
# 5. Smoke test cualquier campo cifrado at-rest (verifica ENCRYPTION_SECRET)
```

---

## 📌 Recordatorios

- ❌ NO hacer commit de `backend/.env` con los valores nuevos. `.gitignore` ya lo protege; verificar antes de cada commit con `git status`.
- ❌ NO almacenar las credenciales nuevas en historial de chat, screenshots, o canales no seguros.
- ✅ SÍ almacenar las credenciales nuevas en un password manager (1Password, Bitwarden) y/o secret manager del entorno productivo (Railway secrets, Doppler, AWS SSM).
- ✅ SÍ rotar de nuevo si en algún momento se sospecha exposición.

---

## 🔗 Referencias

- Ciclo 77: Decision Gate de estrategia de purga (BITACORA)
- Ciclo 78: Ejecución de purga con git filter-repo (BITACORA)
- Backup pre-purga: `_backups_pre_purge_c78/import-1777213083759-63z86j_pre_purge_c78_20260427T220728Z.tar.gz`
- HEAD pre-purga: `f7447e1` → HEAD post-purga: `347807f`
