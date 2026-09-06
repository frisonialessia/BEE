# BEE — Auditoría de riesgos y preparación para producción

Estado del código auditado: `main` @ `88e3065` · 2026-09-06

Este documento es el resultado de una revisión sobre el código real (no sobre
supuestos): cada hallazgo lleva el archivo y la línea que lo sustenta, y cada
arreglo está descrito de forma que se pueda ejecutar sin volver a investigar.
Sirve para dos cosas: cerrar el MVP para pruebas públicas, y dejar por escrito
qué hay que resolver para que BEE aguante como SaaS.

---

## 0. Una corrección de premisa

**BEE no usa Supabase.** No hay ninguna dependencia, cliente ni configuración de
Supabase en el repositorio. La autenticación es **JWT propio contra FastAPI**:

- Emisión: `apps/api/app/core/security.py:143` `create_access_token()`
- Validación: `apps/api/app/api/deps.py` `get_current_user()` — recarga el `User`
  de la base y revalida `is_active`/rol **en cada petición**, así que desactivar
  a alguien corta su acceso de inmediato aunque su token siga vigente. Esto está
  bien resuelto y no hay que tocarlo.
- Almacenamiento en el navegador: `apps/web/src/lib/auth-storage.ts:15`
  (`localStorage`).
- `apps/web/src/proxy.ts` (el antiguo `middleware.ts`, renombrado en Next 16)
  **no interviene en la autenticación**: solo copia `Accept-Language` a una
  cookie de idioma.

Cualquier plan que arranque de "revisar la configuración de Supabase" apunta a
un componente que no existe.

---

## 1. Lo que ya está bien resuelto

Conviene decirlo porque acota el trabajo real:

| Área | Estado |
|---|---|
| Aislamiento multi-tenant | Helpers centralizados en `app/services/permissions/service.py` (`scope_to_organization`, `scope_by_organization_id`, `get_visible_user_ids`) |
| Paginación | Todos los listados tienen tope (`le=100`…`le=500`); no hay endpoints sin límite |
| Fuerza bruta en login | `app/core/login_guard.py` — per-IP, y explícitamente **no** per-email para no crear un DoS de cuentas ajenas |
| Alta de organización | Transacción única, email globalmente único, slug único, rol OWNER (`app/services/auth/service.py:48`) |
| Deriva de esquema | Se detecta y se grita al arrancar (`app/core/schema_check.py`), y `/ready` responde 503 |
| CORS y preflight | El orden de middlewares está razonado para que OPTIONS no muera en el guard de API key (`app/main.py:155-168`) |
| Errores en el frontend | `app/error.tsx`, `app/global-error.tsx`, `app/dashboard/error.tsx` |
| Cierre de sesión ante 401 | `apps/web/src/lib/api/client.ts:199` — solo si había token, para no desloguear en un login fallido |
| Suite de pruebas | Hermética (SQLite en memoria), sin servicios externos |

---

## 2. P0 — Bloqueantes antes de abrir a usuarios reales

### 2.1 No existe verificación de correo

`POST /api/v1/auth/register` (`app/api/v1/endpoints/auth.py:42`) crea la
Organization, crea el usuario OWNER y **devuelve un token de sesión en el acto**.
No hay ningún campo `email_verified` en ningún modelo del proyecto.

Qué permite hoy, sin ningún esfuerzo:

- Registrarse como `direccion@empresa-que-no-es-mia.com` y quedar como OWNER de
  una organización con ese dominio.
- Crear organizaciones basura en volumen (el único freno es
  `SIGNUP_RATE_LIMIT_PER_HOUR = 5` por IP).
- Ocupar un correo ajeno de forma permanente: los emails son **globalmente
  únicos** (`service.py:58`), así que el dueño legítimo ya no podrá registrarse.

**Arreglo.** Añadir `User.email_verified: bool` y una tabla de tokens de
verificación reutilizando tal cual el patrón que ya existe para el reseteo de
contraseña (migración `028_password_reset_tokens` + `app/models/password_reset`).
Hasta verificar: permitir entrar pero en modo solo lectura, o bloquear el login
—decisión de producto, el mecanismo es el mismo—. Depende de 2.2.

### 2.2 `EMAIL_SMTP_HOST` sin configurar en producción

El propio arranque lo dice en cada cold start (log de Vercel, 07:33:43):

> `INSECURE PRODUCTION CONFIG — EMAIL_SMTP_HOST is unset — password-reset emails
> will be mock-logged, never delivered; self-serve password recovery is silently
> broken.`

"Silently" es la palabra importante: el usuario pide recuperar su contraseña, ve
un mensaje de éxito, y no llega nada. Con usuarios reales esto se convierte en
tickets de soporte que solo se pueden resolver a mano con
`POST /api/v1/internal/support/reset-password`, que es una herramienta de
emergencia, no un proceso.

Además **bloquea 2.1**: sin correo saliente no hay verificación posible.

**Arreglo.** Configurar SMTP (Resend, Postmark, SES) en las variables de entorno
de `bee-api` y verificar el dominio remitente (SPF/DKIM), o los correos irán a
spam y el problema seguirá pareciendo el mismo.

### 2.3 Sesión en `localStorage`, sin refresh ni revocación

`apps/web/src/lib/auth-storage.ts:15`. Un único token de acceso, guardado donde
cualquier JavaScript de la página puede leerlo. No hay refresh token, no hay
`/auth/logout` que invalide del lado del servidor, y el frontend **no publica
Content-Security-Policy** (`apps/web/next.config.ts` no define `headers()`; la
CSP que sí existe es la del API, en `SecurityHeadersMiddleware`).

Atenúa el riesgo —pero no lo elimina— que `get_current_user` revalide al usuario
contra la base en cada petición: desactivar la cuenta corta el acceso.

**Arreglo, por orden de coste:**
1. (Barato, hoy) Publicar CSP y `X-Frame-Options` en el frontend, y acortar la
   vigencia del token.
2. (Correcto) Mover la sesión a cookie `httpOnly` + `SameSite=Lax` y añadir
   refresh token con rotación. Es un cambio en el cliente y en `deps.py`.

### 2.4 Error de hidratación en todo `/probar/*`

Reproducido en `/probar` y `/probar/sales` (React #418 en producción). Causa
exacta, `apps/web/src/features/tour/tour-intro-popup.tsx:36-45`:

```ts
const [alreadySeen] = useState(() => {
  if (typeof window === "undefined") return true;   // servidor: no pinta nada
  return Boolean(window.localStorage.getItem(STORAGE_KEY)); // cliente: sí pinta
});
```

El servidor renderiza `null` y el cliente renderiza el popup. React detecta el
nodo extra, **descarta el árbol completo del sandbox y lo vuelve a renderizar en
el cliente**. Es la primera pantalla que ve un prospecto.

**Arreglo.** Empezar en `false` y leer `localStorage` dentro de un `useEffect`,
que corre solo en cliente y después de hidratar.

---

## 3. P1 — Se rompe cuando hay usuarios concurrentes

### 3.1 La cola de trabajos no procesa absolutamente nada

Son **dos** condiciones, no una:

1. `CRON_SECRET` no está definido, así que `/api/v1/internal/jobs/tick` responde
   **404 por diseño** (`app/api/v1/endpoints/internal_job_queue.py:29-34`: "un
   despliegue que nunca optó por esto no debería ni revelar que la ruta
   existe"). En los logs de Vercel se ve el 404 **cada minuto**.
2. Aunque lo definas, `run_job_queue_tick` devuelve `enabled=False` mientras
   `JOB_QUEUE_BACKEND != "redis"` (`app/services/external_api/worker.py:553`).

Consecuencia con webhooks reales: `IngestionWorker.enqueue` cae al
`asyncio.Queue` en proceso (`worker.py:120`), que vive **dentro de una función
serverless**. El webhook responde `202 Accepted` y, cuando Vercel congela esa
instancia, **el trabajo encolado desaparece sin dejar rastro**. No es una cola
lenta: es pérdida de datos silenciosa.

**Arreglo.** Provisionar Redis, poner `REDIS_URL`, `JOB_QUEUE_BACKEND=redis` y
`CRON_SECRET`. El código ya está escrito para eso; solo hay que encenderlo.

### 3.2 Los límites de abuso son por instancia, no globales

`signup_guard`, `login_guard`, `password_reset_guard` y `APIRateLimitMiddleware`
guardan su ventana deslizante **en memoria del proceso**. En serverless hay N
instancias vivas, así que el límite efectivo es N × el configurado, y se
reinicia con cada cold start. Un atacante que rote peticiones consigue muchos
más intentos de los que dice la configuración.

**Arreglo.** El mismo `REDIS_URL` de 3.1. Está previsto en el diseño
(`config.py:79-90`): cada guard detecta el cliente Redis por su cuenta y, si
falla, degrada al comportamiento actual en vez de caerse.

### 3.3 El SSE, cuando lo enciendas, se come las funciones

Hoy sin Redis el stream manda un evento `unavailable` y termina
(`app/api/v1/endpoints/notifications_stream.py`), y el frontend cae a un poll de
30 s. Funciona.

El riesgo aparece **justo después de encender Redis**: cada pestaña abierta
mantiene una conexión que ocupa una función serverless durante
`NOTIFICATIONS_STREAM_MAX_SECONDS = 60` (`config.py:99`), reconectando en bucle.
Mil usuarios con el dashboard abierto = mil funciones ejecutándose de forma
permanente. En Vercel eso se paga por segundo de ejecución.

**Arreglo.** Encender Redis para las colas y los guards (3.1, 3.2) **pero dejar
el SSE apagado** hasta moverlo a un runtime que soporte conexiones largas
(Edge/Node en un servicio aparte, o un proveedor de realtime). El poll de 30 s
es suficiente para el MVP.

### 3.4 Confirmar que el pooler de Neon está en uso

`DB_POOL_SIZE = 2`, `DB_MAX_OVERFLOW = 3` (`config.py:76-77`): hasta 5
conexiones por instancia serverless. Verificado en los logs de producción que
`DATABASE_URL` apunta a `ep-jolly-field-awhxt8aq-pooler…` — correcto. **No lo
cambies al endpoint directo**: ese es solo para las migraciones.

---

## 4. P2 — El muro de escala (camino a 100 000 usuarios)

### 4.1 30 de 39 tablas multi-tenant no tienen índice en `organization_id`

Este es el hallazgo más caro de todos y el más barato de arreglar.

Tablas con índice (9): `teams`, `users`, `companies`, `leads`, `opportunities`,
`signals`, `quotas`, `saved_views`, `meetings`.

Tablas **sin** índice (30), entre ellas las que crecen sin techo con el uso:
`account_activity_events`, `audit_entries`, `dark_funnel_signals`,
`incoming_engagement_events`, `pending_actions`, `hot_lead_scores`,
`assistant_conversations`, `sequence_executions`, `workflow_tasks`,
`strategy_outcomes`, `network_connections`, `opportunity_tasks`,
`admin_audit_logs`, `failed_events`, `anomaly_alerts`, `artifact_corrections`,
`account_briefs`, `brand_fragments`, `dynamic_sequences`, `integration_connections`,
`lead_psychographics`, `market_insights`, `message_templates`,
`organization_api_keys`, `outbound_webhooks`, `tactic_variants`, `team_profiles`,
`user_style_profiles`, `voice_profiles`, `autopilot_configs`.

Toda consulta con `WHERE organization_id = …` sobre esas tablas hace **escaneo
secuencial completo**. Con 10 organizaciones no se nota; con 10 000 y millones
de eventos, cada petición del dashboard lee la tabla entera de todos los
clientes para devolver las filas de uno.

**Arreglo.** Una sola migración con 30 `op.create_index(...)`. Usar
`CREATE INDEX CONCURRENTLY` si se aplica con datos ya en producción.

### 4.2 `avatar_url` guarda la imagen dentro de la tabla `users`

`app/models/user.py:57` y `app/schemas/auth.py:160`: hasta **300 000 caracteres**
por fila, porque no hay almacenamiento de blobs y la foto se guarda como
`data:` URI en la propia fila.

A 100 000 usuarios eso son hasta 30 GB en la tabla que se consulta en **cada
petición autenticada** (`get_current_user` recarga el `User` completo). El
avatar viaja por la red en cada `/auth/me`, cada listado de equipo, cada
asistente de una reunión.

**Arreglo.** Vercel Blob / S3 / Cloudinary, guardar solo la URL, y migrar los
data URIs existentes. Mientras tanto, excluir `avatar_url` de los `SELECT` que
no lo necesitan.

### 4.3 El "camino del vendedor" vive solo en el navegador

`apps/web/src/components/celebration/use-milestone-celebration.ts:9,25` y
`apps/web/src/lib/notifications/milestone-log.ts:8`: el progreso de hitos se
guarda en `localStorage`, con clave fija y **sin identificador de usuario**.

Consecuencias concretas y visibles:

- El vendedor cambia de portátil o abre el móvil → su camino arranca de cero.
- Dos personas en el mismo navegador (un equipo compartiendo un portátil de
  demo) **comparten el mismo progreso**.
- "Borrar datos del sitio" borra el historial de logros.
- Modo incógnito: nunca celebra nada.

Para un producto cuyo gancho es la gamificación, el progreso tiene que ser un
hecho del servidor, no del navegador.

**Arreglo.** Tabla `user_milestones` (o un campo en `User`) con el último hito
celebrado, y que el frontend lo lea del API. El `localStorage` se queda solo
como caché.

### 4.4 Peso del sandbox en el navegador

Medido: **247 KB en `localStorage`, repartidos en 21 claves**, leídos con
`JSON.parse` síncrono en cada acceso (`apps/web/src/lib/demo/store.ts:162`).
Está lejos del límite de 5 MB, pero es trabajo en el hilo principal en cada
navegación del sandbox. No es urgente; es lo siguiente a mirar si `/probar` se
siente lento en móviles modestos.

### 4.5 No existe el flujo de "unirse a una organización existente"

Por diseño (`app/api/v1/endpoints/auth.py:47-49`): la única forma de crear una
Organization es registrarse, y todo compañero posterior lo da de alta un
OWNER/ADMIN con `POST /api/v1/users`. Es una decisión defendible para el MVP,
pero significa que un segundo empleado de la misma empresa que llegue por la
landing **creará una organización paralela y duplicada** sin que nada se lo
impida. A escala esto fragmenta cuentas de clientes reales.

**Arreglo (post-MVP).** Detectar el dominio del correo en el registro y, si ya
existe una organización con ese dominio, ofrecer "solicitar acceso" en vez de
crear otra.

---

## 5. Salida a producción — datos reales

### 5.1 El sandbox no se "migra": convive

Conviene aclararlo porque cambia el plan. `apps/web/src/lib/demo/mode.ts`
conmuta la fuente de datos: en `/probar` se lee de `lib/demo/store.ts`
(`localStorage`), y en el producto real se llama a `beeApi`. **Son dos caminos
paralelos ya separados.** No hay nada que migrar del sandbox a producción: el
sandbox se queda como demo pública y el producto real ya usa la base desde el
primer día.

Lo que falta no es migración de datos, es **la cadena operativa**:

| # | Paso | Estado |
|---|---|---|
| 1 | Migraciones automáticas en cada despliegue | Workflow `.github/workflows/migrate.yml` ya existe; el secreto `PRODUCTION_DATABASE_URL` ya está puesto y la base está en `051` |
| 2 | Redis (colas + límites de abuso) | Pendiente — ver 3.1 y 3.2 |
| 3 | SMTP con dominio verificado | Pendiente — ver 2.2 |
| 4 | Almacenamiento de blobs para avatares | Pendiente — ver 4.2 |
| 5 | Índices de `organization_id` | Pendiente — ver 4.1 |
| 6 | Backups / point-in-time recovery en Neon | Verificar en el plan contratado |
| 7 | Observabilidad | `sentry_sdk` ya está cableado (`app/main.py:105`); falta poner `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` |

> **Lección aprendida, que hay que dejar escrita:** `migrate.yml` se saltó
> silenciosamente sus 4 primeras ejecuciones (`exit 0` con un `::warning::`
> cuando el secreto no estaba), mostrando palomita verde en Actions mientras la
> base se quedaba 26 revisiones atrás. Un paso que puede no hacer nada debe
> fallar, no avisar. Cambiar ese `exit 0` por `exit 1` es una línea.

### 5.2 Alta de organizaciones reales desde la landing — ya funciona

El flujo completo **ya existe de punta a punta** y está verificado:

```
apps/web/src/app/page.tsx:66
  <form action="/register" method="get">  → email como ?email=
        │
apps/web/src/app/register/page.tsx:21
  searchParams.get("email")  → precarga el campo
        │
POST /api/v1/auth/register   (OrganizationRegister:
                              organization_name, full_name, email, password)
        │
app/api/v1/endpoints/auth.py:42
  ├─ SIGNUP_INVITE_CODE (si está puesto)  → 403
  ├─ signup_guard per-IP                  → 429
  └─ AuthService.register_organization()
        │
app/services/auth/service.py:48   ── una sola transacción ──
  ├─ email único a nivel global           → 409 si ya existe
  ├─ Organization(name, slug único)
  └─ User(role=OWNER, organization_id)
        │
create_access_token(user.id, organization_id, role)  → sesión iniciada
```

Lo que **falta** para poder llamarlo "alta de organizaciones reales":

1. **Verificación de correo** (2.1) — sin esto, cualquiera se apropia del
   dominio de otra empresa.
2. **Regla de correo corporativo** — hoy `EmailStr` acepta `gmail.com`. Si el
   producto es B2B, rechazar dominios de correo personal en el registro es una
   validación de tres líneas en `OrganizationRegister`.
3. **Beta controlada, si se quiere** — `SIGNUP_INVITE_CODE` (`config.py:192`) ya
   está implementado: ponerle un valor cierra el registro a quien tenga el
   código, y quitarlo lo vuelve a abrir. Sin cambios de código.
4. **Deduplicación por dominio** (4.5) — post-MVP.

---

## 6. Plan de ejecución

### Fase 1 — Antes de invitar a nadie (P0)

1. Configurar SMTP en `bee-api` + verificar el dominio remitente. *(2.2)*
2. Implementar verificación de correo sobre el patrón de
   `password_reset_tokens`. *(2.1)*
3. Arreglar `TourIntroPopup` con un `useEffect`. *(2.4)*
4. Publicar CSP y acortar la vigencia del token. *(2.3, paso 1)*
5. Cambiar el `exit 0` de `migrate.yml` por `exit 1`. *(5.1)*

### Fase 2 — Antes de la primera decena de clientes (P1)

6. Provisionar Redis → `REDIS_URL`, `JOB_QUEUE_BACKEND=redis`, `CRON_SECRET`.
   **Dejar el SSE apagado.** *(3.1, 3.2, 3.3)*
7. Migración con los 30 índices de `organization_id`. *(4.1)*
8. Poner `SENTRY_DSN` en ambos proyectos. *(5.1)*

### Fase 3 — Antes de escalar (P2)

9. Avatares a almacenamiento de blobs + migrar los data URIs existentes. *(4.2)*
10. Progreso de hitos al servidor. *(4.3)*
11. Sesión en cookie `httpOnly` + refresh token. *(2.3, paso 2)*
12. SSE fuera de las funciones serverless. *(3.3)*
13. Deduplicación de organizaciones por dominio. *(4.5)*
