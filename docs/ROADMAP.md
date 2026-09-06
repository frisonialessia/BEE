# BEE — Roadmap

Qué se puede hacer con BEE hoy, qué falta, y qué se rompe cuando crezca.
Escrito para que quien tome el código sepa dónde está la frontera antes de
empezar — y para no volver a descubrirla con un incidente.

Cada punto dice **qué existe hoy** y **qué falta**. Los horizontes no son
fechas, son dependencias: cada uno desbloquea al siguiente.

> **Última revisión:** septiembre de 2026.

---

## Dónde vive cada cosa

Hay cuatro documentos y es fácil perderse. Este es el mapa:

| Documento | Qué contiene | Cuándo leerlo |
|---|---|---|
| **`docs/ROADMAP.md`** (este) | Producto y arquitectura, por horizontes | Para saber qué sigue |
| [`docs/PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) | La auditoría de riesgos, con archivo y línea | Antes de un despliegue serio |
| [`docs/MONETIZATION_ROADMAP.md`](MONETIZATION_ROADMAP.md) | Planes, precios y su mapeo técnico | Para el modelo de negocio |
| [`docs/DESIGN_BRIEF.md`](DESIGN_BRIEF.md) | El sistema de diseño, como especificación | Antes de tocar cualquier página |

Y [`DEPLOY_CHECKLIST.md`](../DEPLOY_CHECKLIST.md) en la raíz es la lista
operativa de qué configurar para desplegar.

---

## Horizonte 0 — Antes de abrir el registro

Dos puntos, y en realidad son **uno solo**: el segundo bloquea al primero.

### 0.1 Verificación de correo

**Hoy.** `POST /auth/register` crea la organización, crea el usuario OWNER y
entrega un token de sesión en el acto. No existe ningún campo
`email_verified` en el proyecto.

**Por qué bloquea.** Los correos son **únicos a nivel global**
(`app/services/auth/service.py`), así que registrarse con la dirección de
otra empresa hace dos daños a la vez: suplanta a esa organización **y** deja
al dueño legítimo sin poder registrarse nunca. Por eso el registro está hoy
cerrado con `SIGNUP_INVITE_CODE` y la landing ofrece una lista de espera.

**Qué falta.** Campo `User.email_verified` y una tabla de tokens, reusando
tal cual el patrón que ya existe para el reseteo de contraseña (migración
`028_password_reset_tokens`). Hasta verificar: entrar en modo solo lectura o
bloquear el login — decisión de producto, el mecanismo es el mismo.

### 0.2 Correo saliente

**Hoy.** `EMAIL_SMTP_HOST` sin configurar. El proveedor
(`services/omnichannel/providers/email.py`) tiene tres niveles —Gmail
conectado, SMTP del servidor, y simulado— y cae al tercero: escribe el
correo al log y devuelve éxito.

**Consecuencia.** Recuperar contraseña dice que funcionó y no entrega nada.
El usuario ve un mensaje de éxito, no recibe el correo, y nadie se entera.

**Qué falta.** Un proveedor (Resend, Postmark, SES) con el dominio
verificado por SPF y DKIM — sin eso el correo llega a spam y el problema
sigue pareciendo el mismo. Son seis variables de entorno, cero código.

---

## Horizonte 1 — Antes de los primeros clientes de pago

### 1.1 Redis

**Hoy.** `JOB_QUEUE_BACKEND` sin poner en `redis`, así que
`IngestionWorker.enqueue` cae a una `asyncio.Queue` **dentro del proceso**.

**Por qué importa, y por qué no es cuestión de volumen.** En un servidor de
siempre eso está bien. En una función serverless, cuando la instancia se
congela, el trabajo encolado desaparece — y el webhook ya respondió 202.
**Esto se rompe con UN solo emisor real, no con mil.** Hoy no duele solo
porque no hay ninguno: en 24 horas de producción, cero llamadas a
`/signals/webhook` y cero a `/webhooks/receive`.

**Qué falta.** Provisionar Redis y poner `REDIS_URL`,
`JOB_QUEUE_BACKEND=redis` y `CRON_SECRET`. El código de la cola durable, el
reintento con retroceso exponencial y la cola de mensajes muertos ya están
escritos y probados. **El disparador para hacerlo es conectar la primera
fuente real de señales, no una cifra de usuarios.**

Redis arregla de paso otra cosa: los límites de abuso (`signup_guard`,
`login_guard`, el límite general por IP) guardan su ventana en memoria del
proceso, así que con N instancias vivas el límite efectivo es N veces el
configurado. Cada guard detecta el cliente de Redis por su cuenta.

⚠️ **No enciendas el stream de notificaciones al mismo tiempo.** Ver 3.5.

### 1.2 Almacenamiento de archivos

**Hoy.** `User.avatar_url` guarda la imagen entera como `data:` URI dentro
de la fila, hasta **300 000 caracteres** (`app/models/user.py`).

**Por qué es el más caro de todos.** `get_current_user` recarga el usuario
completo de la base **en cada petición autenticada** — es a propósito, para
revalidar rol e `is_active`. Eso significa que cada petición arrastra el
avatar entero desde Postgres. No es un problema de disco, es de ancho de
banda por petición.

**Qué falta.** Un almacén de blobs (Vercel Blob, S3, Cloudinary), guardar
solo la URL, y migrar los data URIs existentes. Mientras tanto, excluir
`avatar_url` de los `SELECT` que no lo necesitan ya sería una mejora.

### 1.3 El progreso del vendedor, en el servidor

**Hoy.** Los hitos viven en `localStorage`, con clave fija y **sin
identificador de usuario**
(`components/celebration/use-milestone-celebration.ts`).

**Consecuencias reales.** El vendedor cambia de computadora y su camino
arranca de cero. Dos personas en el mismo navegador comparten el mismo
progreso. Borrar datos del sitio borra el historial. En incógnito nunca
celebra nada.

**Qué falta.** Una tabla `user_milestones` con el último hito celebrado. El
`localStorage` se queda solo como caché. Para un producto cuyo gancho es la
gamificación, esto es la funcionalidad rota más visible que queda.

### 1.4 Sesión en cookie `httpOnly` con refresh

**Hoy.** Un único token de acceso en `localStorage`, sin rotación ni
revocación del lado del servidor.

**Atenuante.** `get_current_user` revalida al usuario contra la base en cada
petición, así que desactivar una cuenta corta el acceso de inmediato aunque
el token siga vigente. No es nada, pero no sustituye a lo de abajo.

**Qué falta.** Cookie `httpOnly` + `SameSite=Lax`, refresh token con
rotación, y un `/auth/logout` que invalide del lado del servidor. Es un
cambio en el cliente y en `api/deps.py`.

### 1.5 Observabilidad

**Hoy.** `sentry_sdk.init()` ya está cableado en `app/main.py` y
`setup_tracing()` instrumenta FastAPI, SQLAlchemy y httpx con
OpenTelemetry. **Ambos están inertes** porque no hay DSN ni endpoint
configurados.

**Qué falta.** Poner `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN`, y apuntar
`OTEL_EXPORTER_OTLP_ENDPOINT` a un colector. Es configuración, no código —
y es lo que convierte "algo falló" en "esta consulta tardó 4 s en esta
organización".

---

## Horizonte 2 — Producto

### 2.1 Divisa por equipo y conversión con tasa histórica

**Hoy.** Cada equipo tiene su divisa (`teams.currency`, ISO 4217, migración
047) y Ventas la usa para formatear.

**Falta.** Que el cerebro reconozca una cifra y su divisa dentro del texto
de una señal (una ronda, un contrato público) y la convierta a la del equipo
antes de guardarla. Con un servicio `services/fx/` con caché por día y **la
tasa usada guardada junto al monto**, para que siempre pueda auditarse
("USD 32,000 a MXN 18.1 el 4 sep 2026"). La conversión se hace con la tasa
del día del hecho, **nunca con la de hoy** — si no, Ventas y Pronóstico
cambian retroactivamente y dejan de ser un histórico.

### 2.2 Colmena a escala

**Hoy.** Dibuja hasta 200 cuentas (las más calientes) en el Resumen y todas
en Señales · Intención, con filtro por etapa.

**Falta.** Agrupar por industria o por responsable como capas del panal, y
un modo "solo las mías" para equipos grandes. Ver también 3.4: con muchas
cuentas, el recorte deja de poder hacerse en el navegador.

### 2.3 Historial y navegación temporal

**Hoy.** Toda gráfica de tiempo muestra un año y se aleja a dos o cinco.

**Falta.** Arrastrar sobre la gráfica para acotar un rango a mano, y
comparar un periodo contra el anterior en la misma caja.

### 2.4 Más conexiones

**Hoy.** Cinco cuentas por OAuth real (Gmail, LinkedIn, Salesforce, HubSpot,
Jira), tres canales de salida (email, LinkedIn, X) y cinco fuentes de
mercado (G2, búsqueda de Google, portales de contratación, prensa GDELT,
noticias). Slack, los tableros de BI y n8n/Zapier/Make ya funcionan por
webhook entrante o saliente, sin conector dedicado.

**El criterio de entrada** es lo que le da de comer al cerebro, no el
volumen de logos: una fuente que mejora un tipo de señal que BEE ya puntúa,
un canal que la persona ya usa para vender, o un lugar donde el equipo ya
guarda su trabajo. Por orden de fricción resuelta:

- **Calendario** (Google, Outlook) — hoy el calendario de BEE es propio y no
  sincroniza con el que el vendedor usa todos los días. La más directa.
- **WhatsApp Business** — cuarto canal de salida, el más fuerte para venta
  directa en LatAm; misma forma que los tres de `omnichannel/providers/`.
- **Datos de financiamiento** (Crunchbase, PitchBook) y **de stack**
  (BuiltWith) — no reemplazan la detección por texto, la hacen más precisa:
  menos falso positivo en `funding_round` y `tech_adoption`.
- **Más portales de contratación** (Indeed) y **tipos de cambio** (para 2.1).
- **Notion / Drive** — para que un battlecard viva donde el equipo trabaja.
- **Reddit** — señal de comunidad, como fuente de mercado.

**No entran** herramientas sin relación con detectar una señal, preparar una
jugada o cerrarla. Sumarlas por presencia visual no es la lógica de este
roadmap.

### 2.5 Deduplicación de organizaciones por dominio

**Hoy.** La única forma de crear una organización es registrarse, y todo
compañero posterior lo da de alta un OWNER/ADMIN. Es una decisión defendible
para el MVP.

**Falta.** El segundo empleado de la misma empresa que llegue por la landing
**crea una organización paralela** sin que nada lo impida. Detectar el
dominio del correo y ofrecer "solicitar acceso" en vez de crear otra. A
escala, esto fragmenta cuentas de clientes reales.

---

## Horizonte 3 — Escala

Qué se rompe, en qué orden, y qué lo arregla. No son mejoras generales: cada
una tiene un disparador concreto.

| Cuándo | Qué se rompe primero | Arreglo |
|---|---|---|
| **El primer emisor real** | La cola en proceso pierde trabajo | Redis (1.1) |
| **~100 usuarios con foto** | El avatar viaja en cada petición autenticada | Blobs (1.2) |
| **~1 000 usuarios** | Los límites de abuso son por instancia; reputación del dominio de correo | Redis (1.1); calentar el dominio |
| **~10 000 cuentas por tenant** | Consultas que filtran y ordenan; la colmena en el navegador | Índices compuestos (3.1); recorte en servidor (3.4) |
| **~100 000 usuarios** | Conexiones a la base; el motor en el camino de la petición; tablas de eventos sin techo | 3.2, 3.3, 3.6 |

### 3.1 Índices compuestos

**Hoy.** Las 39 tablas con `organization_id` tienen un índice encabezado por
esa columna, creado en la misma migración que crea la tabla. Verificado
contra `pg_index`, no contra los archivos — ver `PRODUCTION_READINESS.md`
§4.1, que incluye la consulta para repetirlo.

**Falta.** Ese índice te lleva al tenant; después Postgres ordena. Una
consulta como `WHERE organization_id = ? AND status = ? ORDER BY created_at
DESC` sobre un tenant con decenas de miles de filas ordena en memoria en
cada carga de página. La respuesta son índices compuestos —
`(organization_id, status, created_at DESC)` — **decididos con `EXPLAIN
ANALYZE` sobre datos reales, no por inspección.** Añadirlos antes es pagar
escrituras más lentas por lecturas que quizá nadie hace.

### 3.2 Las tablas que crecen con el uso, no con los clientes

`account_activity_events`, `dark_funnel_signals`,
`incoming_engagement_events`, `audit_entries`, `workflow_tasks` y
`sequence_executions` no crecen con el número de clientes: crecen con lo que
cada cliente hace, todos los días, para siempre.

**Falta.** Particionado por tiempo (`PARTITION BY RANGE (created_at)`,
mensual) y una política de retención explícita: cuánto tiempo se conserva un
evento de actividad, y qué se archiva. Es mucho más barato decidirlo antes
de tener 200 millones de filas que después.

### 3.3 El motor de señales fuera del camino de la petición

**Hoy.** `POST /signals/webhook` verifica la firma, **corre todos los
analizadores**, persiste la señal, materializa la oportunidad y contesta
201. Todo dentro de la petición.

**Por qué se rompe.** Con un analizador de LLM en la cadena, esa petición
depende de la latencia de un tercero. Con volumen, el emisor empieza a ver
timeouts y a reintentar, lo que multiplica la carga justo cuando ya está
alta.

**Falta.** Que `/signals/webhook` haga solo lo barato —verificar, resolver
el tenant, persistir crudo— y conteste; y que el análisis viva entero detrás
de la cola. La forma ya existe en `/webhooks/receive`; es mover la frontera.

### 3.4 La colmena en servidor

**Hoy.** El navegador recibe hasta 200 cuentas y las dibuja. Funciona porque
el recorte a las más calientes se hace antes de mandarlas.

**Falta.** Con tenants grandes, el recorte y la agregación (por industria,
por responsable, por etapa) tienen que hacerse en la base, no en el cliente.

### 3.5 Notificaciones en vivo fuera de serverless

**Hoy.** Sin Redis, el stream manda un evento `unavailable` y termina; el
frontend cae a un sondeo de 30 s. Funciona.

**El riesgo aparece justo al encender Redis.** Cada pestaña abierta sostiene
una conexión que ocupa una función durante
`NOTIFICATIONS_STREAM_MAX_SECONDS = 60`, reconectando en bucle. Mil usuarios
con el dashboard abierto son mil funciones ejecutándose de forma permanente,
pagadas por segundo.

**Falta.** Mover el stream a un runtime que soporte conexiones largas, o a
un proveedor de realtime. Hasta entonces, **el sondeo de 30 s es la opción
correcta**, no una carencia.

### 3.6 La decisión que la escala va a forzar: salir de serverless

Es el punto arquitectónico más grande de este documento, así que conviene
escribirlo antes de tenerlo encima.

**Serverless es la decisión correcta hoy.** Costo cero cuando nadie usa la
app, despliegue trivial, escala automática. Para un producto sin usuarios de
pago es difícil de superar.

**Y es la decisión equivocada a escala**, por cuatro razones que ya se ven en
el código:

1. **No hay proceso vivo**, así que cualquier trabajo en segundo plano
   necesita Redis y un cron (1.1) en vez de un worker.
2. **No hay conexiones largas**, así que el SSE se paga por segundo (3.5).
3. **Presión sobre el pool.** `DB_POOL_SIZE=2` y `DB_MAX_OVERFLOW=3` son
   hasta 5 conexiones **por instancia**. Con cientos de instancias
   concurrentes, el pooler de Neon es lo único que evita agotar la base — y
   tiene su propio techo.
4. **El arranque en frío** vuelve a leer la revisión del esquema, reconstruye
   el motor y re-instrumenta, en cada instancia nueva.

**El disparador para migrar** no es una cifra de usuarios: es la primera de
estas tres cosas que ocurra — necesitar notificaciones en vivo de verdad,
que la latencia de la cola importe para el producto, o que el gasto en
segundos de función supere al de una instancia encendida todo el día. El
`Dockerfile` con su etapa `runtime` ya existe justamente para que ese día no
haya que reescribir nada: se despliega el mismo contenedor en Fly, Railway,
Render o ECS.

### 3.7 Lectura contra escritura

**Falta.** Las consultas de Pronóstico, Control y los tableros recorren
mucho más que las de escritura. Cuando compitan con las transaccionales, una
réplica de lectura las separa. Neon soporta ramas de solo lectura; el cambio
en el código es un segundo engine y enrutar por tipo de operación.

### 3.8 Cuotas por tenant

**Falta.** Hoy los límites de abuso son por IP. Nada impide que una sola
organización consuma la capacidad de todas: es el problema del vecino
ruidoso. Hacen falta cuotas por organización (señales por hora, llamadas a
la API, trabajos en cola) y una prioridad en la cola que respete el plan
contratado — ver `MONETIZATION_ROADMAP.md`, donde los planes ya están
definidos.

### 3.9 Búsqueda

**Hoy.** `services/brain_search/` existe, y pgvector está habilitado desde
la migración `001` con una tabla `vector_embeddings`.

**Falta.** Que la búsqueda pase de recorrer filas a un índice real: generar
embeddings al escribir y consultar con un índice ANN (`ivfflat` o `hnsw`).
La infraestructura ya está; falta el uso.

### 3.10 Multi-región y residencia de datos

**Falta.** Un cliente europeo va a preguntar dónde viven sus datos. Los
campos de borrado GDPR ya existen en `Organization` (migración
`042_organization_deletion_request`), que es la mitad difícil. La otra mitad
—poder decir "tu organización vive en la UE"— implica base por región y
enrutado por tenant. No antes de que alguien lo pida por contrato.

---

## Lo que deliberadamente no está aquí

Decir que no también es roadmap:

- **Una app móvil nativa.** El producto es responsivo y el trabajo de un
  vendedor con BEE es de lectura y decisión, no de captura. Una app nativa
  duplicaría la superficie sin resolver nada que el navegador no resuelva.
- **Un constructor de informes a medida.** Los tableros de BI ya se conectan
  por webhook saliente. Reimplementar Power BI dentro de BEE es un producto
  distinto.
- **Más logos de integración por tener más logos.** Ver el criterio en 2.4.
- **Microservicios.** El backend está por capas y se despliega como una
  unidad. Partirlo antes de tener un cuello de botella medido cambia un
  problema conocido por uno distribuido.
- **Reescribir el frontend en otra cosa.** La frontera HTTP existe
  justamente para que eso sea posible algún día sin tocar el motor; que sea
  posible no es una razón para hacerlo.
