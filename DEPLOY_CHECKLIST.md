# BEE — Deployment Checklist

> **Biblia de despliegue** — completa esta lista antes de habilitar tráfico real
> (webhooks públicos, frontend en producción, enriquecimiento externo).

Estado del backend tras External Ingestion: **Ready**.

---

## 1. Variables de entorno obligatorias (seguridad)

| Variable | Acción |
|----------|--------|
| `API_SECRET_KEY` | Generar con `python -c "import secrets; print(secrets.token_hex(32))"` — protege todos los endpoints REST |
| `WEBHOOK_SIGNATURE_REQUIRED` | `true` en producción |
| `WEBHOOK_SIGNING_SECRET` | Secreto aleatorio fuerte — el default `change-me-in-production` **no** es seguro |
| `LINKEDIN_WEBHOOK_SECRET` | Secreto HMAC por provider para `/api/v1/webhooks/receive` |
| `G2_WEBHOOK_SECRET` / `GOOGLE_WEBHOOK_SECRET` | Configurar cuando esos providers estén activos |
| `ENVIRONMENT` | `production` (habilita cabeceras HSTS) |

### Base de datos

```bash
# Migraciones (incluye tabla pgvector Sales DNA):
cd apps/api && alembic upgrade head

# Extensión pgvector (one-time, Postgres gestionado):
CREATE EXTENSION IF NOT EXISTS vector;
```

> Usar `init_db()` solo en local. En producción, **siempre Alembic**.

---

## 2. Variables recomendadas (ventaja competitiva)

| Variable | Propósito |
|----------|-----------|
| `VECTOR_STORE_BACKEND=pgvector` | Memoria Sales DNA persistente |
| `AI_PROVIDER=openai` + `AI_API_KEY` | Generación de estrategia/artefactos con LLM |
| `LINKEDIN_ACCESS_TOKEN` | Enriquecimiento real de perfiles LinkedIn (sin token → mock) |
| `EXTERNAL_INGESTION_ENABLED=true` | Arranca `IngestionWorker` al boot de la app |

Referencia completa: `apps/api/.env.example`

---

## 3. Gotchas — pasos manuales (leer antes de abrir tráfico)

### 1. `/api/v1/webhooks/receive` está exento de API key

Autenticación por **HMAC por provider**, no por `X-API-Key`. No eliminar esta exención: los sistemas externos no pueden enviar `X-API-Key`.

### 2. `IngestionWorker` es in-process (`asyncio.Queue`)

Arranca automáticamente al boot cuando `EXTERNAL_INGESTION_ENABLED=true`. En despliegues **multi-instancia**, considerar una cola respaldada por Redis (futuro) para que las tareas de enriquecimiento no se pierdan al reiniciar.

### 3. Docker Compose Postgres no incluye pgvector por defecto

Usar imagen `pgvector/pgvector:pg16` o ejecutar `CREATE EXTENSION vector` manualmente **antes** de `VECTOR_STORE_BACKEND=pgvector`.

### 4. LinkedIn API requiere aprobación OAuth de la app

Sin `LINKEDIN_ACCESS_TOKEN`, BEE usa perfiles mock deterministas (seguro en staging, **no** válido para enriquecimiento real en producción).

### 5. El frontend debe enviar `X-API-Key`

En todas las llamadas API cuando `API_SECRET_KEY` esté configurado. Configurar `NEXT_PUBLIC_BEE_API_KEY` en la app Next.js (ver `apps/web/.env.example`).

### 6. Dry run post-deploy

Verificar el pipeline completo tras cada despliegue:

```bash
python scripts/simulate_signal.py --mode http --base-url https://your-api.example.com
```

Modo local (sin servidor):

```bash
python scripts/simulate_signal.py
python scripts/simulate_signal.py --failure   # valida logs seguros ante caída de LinkedIn
```

---

## 4. Health checks

| Endpoint | Propósito |
|----------|---------|
| `GET /api/v1/health` | Liveness (sin auth) |
| `GET /api/v1/ready` | Conectividad DB |
| `GET /api/v1/status` | Chequeo profundo (DB, vector store, DLQ, security) |
| `GET /api/v1/webhooks/status` | Profundidad de cola del worker + config de providers |

---

## 5. Orden de despliegue sugerido

1. Provisionar Postgres con pgvector
2. Configurar secrets (API key, webhook HMAC, tokens externos)
3. `alembic upgrade head`
4. Desplegar API con `ENVIRONMENT=production`
5. Verificar `/api/v1/ready` y `/api/v1/status`
6. Ejecutar dry run (`scripts/simulate_signal.py --mode http`)
7. Abrir webhooks a internet pública (ver recomendaciones de seguridad en README §7)
8. Desplegar frontend con `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_BEE_API_KEY`

---

## 6. Frontend — Vercel (monorepo)

El frontend Next.js vive en **`apps/web/`**. El repo **no** tiene `app/` en la raíz — si Vercel apunta al root del monorepo, el build falla con `Couldn't find any app directory` y las rutas devuelven **404**.

### Configuración obligatoria en Vercel

> **Error común:** si Root Directory = `apps/web` y Output Directory = `apps/web/.next`,
> Vercel busca `apps/web/apps/web/.next` → 404 / build failed.
> Output Directory debe ser **`.next`** (o vacío) cuando Root Directory = `apps/web`.

**Opción A — Root Directory = `apps/web` (recomendada para Next.js):**

| Setting | Valor |
|---------|-------|
| **Root Directory** | `apps/web` |
| **Install Command** | `cd .. && pnpm install --frozen-lockfile --filter web` |
| **Build Command** | `pnpm build` |
| **Output Directory** | `.next` *(o dejar vacío — nunca `apps/web/.next`)* |

Config en repo: `apps/web/vercel.json`

**Opción B — Root Directory = repo root:**

| Setting | Valor |
|---------|-------|
| **Root Directory** | *(vacío / `.`)* |
| **Install Command** | `pnpm install --frozen-lockfile` |
| **Build Command** | `pnpm --dir apps/web build` |
| **Output Directory** | `apps/web/.next` |

Config en repo: `vercel.json` (raíz)

El lockfile canónico está en la **raíz** del repo (`pnpm-lock.yaml`).

### Variables de entorno (Production + Preview)

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | URL pública del API FastAPI (ej. `https://api.tu-dominio.com`) |
| `NEXT_PUBLIC_BEE_API_KEY` | Mismo valor que `API_SECRET_KEY` del backend |

### Verificación post-deploy

Tras el deploy, confirma que el build log incluye:

```
○ /dashboard/control
○ /dashboard
○ /dashboard/signals
```

URLs de prueba:

- `/` — landing
- `/dashboard` — overview
- `/dashboard/control` — panel operador (redirect desde `/control`)

### Archivos de referencia en el repo

| Archivo | Propósito |
|---------|-----------|
| `apps/web/vercel.json` | Install/build commands para Vercel |
| `apps/web/next.config.ts` | Redirect `/control` → `/dashboard/control` |
| `apps/web/src/app/dashboard/control/page.tsx` | Ruta App Router |
| `apps/web/.env.example` | Template de variables |

---

*Última actualización: fase External Ingestion — backend Ready.*
