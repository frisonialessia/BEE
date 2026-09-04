# BEE — Roadmap de producto

Lo que sigue después del rediseño de septiembre de 2026, en el orden en que
conviene atacarlo. Cada punto dice qué existe hoy y qué falta.

## 1. Divisa por equipo y conversión automática

**Hoy.** Cada equipo tiene una divisa (`teams.currency`, ISO 4217, migración
047) y el modelo de Ventas la usa para formatear montos. Los KPIs muestran
solo el número, sin divisa, porque el espacio del tile es para la cifra y la
divisa se configura una vez en los ajustes del equipo.

**Falta.**

- Ajustes de equipo: elegir la divisa del equipo (y, si hace falta, una
  preferencia por usuario) en la página de Equipo, con vista previa del
  formato.
- Conversión automática en el cerebro de BEE: cuando entra una señal que
  habla de dinero fuera de una oportunidad (una ronda de inversión, un
  contrato público, una expansión con monto), el motor debe reconocer la
  cifra y su divisa de origen en el texto de la señal y convertirla a la
  divisa del equipo antes de guardarla en `analysis` y de proponer un
  monto para la oportunidad.
- Una API de tipos de cambio (por ejemplo, un proveedor con tasas diarias)
  detrás de un servicio `services/fx/` con caché por día y la tasa usada
  guardada junto al monto, para que un monto convertido siempre pueda
  auditarse ("USD 32,000 a MXN 18.1 el 4 sep 2026").
- Montos históricos: la conversión se hace con la tasa del día de la señal
  o del cierre, nunca con la tasa de hoy, para que Ventas y Pronóstico no
  cambien retroactivamente.

## 2. Colmena a escala

**Hoy.** La colmena dibuja hasta 200 cuentas en el Resumen (las más
calientes) y todas en Señales · Intención, con filtro por etapa.

**Falta.** Agrupar por industria o por responsable como capas del panal, y
un modo "solo las mías" para equipos grandes.

## 3. Historial y navegación temporal

**Hoy.** Toda gráfica de tiempo muestra un año y se aleja a dos o cinco con
las píldoras de periodo; el sandbox carga cinco años de cierres.

**Falta.** Arrastrar sobre la gráfica para acotar un rango a mano y
comparar un periodo contra el anterior en la misma caja.

## 4. Más conexiones — nuevos orígenes de señal y canales de salida

**Hoy.** Control · Conexiones conecta, por OAuth real, cinco cuentas:
Gmail, LinkedIn, Salesforce, HubSpot y Jira (`app/api/v1/endpoints/
integrations.py`). BEE habla en la voz de la persona por tres canales
(`omnichannel/providers/`): email, LinkedIn y X/Twitter. El cerebro de
BEE ya escanea cinco fuentes de mercado (`services/external_api/
providers/`): G2, búsqueda de Google, portales de contratación
(Greenhouse · Lever), prensa (GDELT) y noticias de Google, más el sitio
propio de la cuenta. Slack/Teams, los tableros de BI (Power BI, Tableau,
Looker Studio) y n8n/Zapier/Make ya funcionan hoy sin conector dedicado —
por webhook entrante o saliente, no por OAuth — así que técnicamente ya
"conectan", aunque no aparezcan como tarjeta propia.

**Cada conexión nueva entra por lo que le da de comer al cerebro, no por
volumen de logos**: una fuente de datos que mejora un tipo de señal que
BEE ya puntúa, un canal que la persona ya usa para vender, o un lugar
donde el equipo ya guarda su trabajo.

- **Calendario** (Google Calendar, Outlook) — la fricción más directa:
  hoy el calendario de BEE es propio y no sincroniza con el que el
  vendedor ya usa todos los días.
- **WhatsApp Business** — un cuarto canal de salida, el más fuerte para
  venta directa en LatAm; incorpora la misma forma que email/LinkedIn/X
  en `omnichannel/providers/`.
- **Datos de financiamiento** (Crunchbase, PitchBook) y **de stack
  tecnológico** (BuiltWith) — no reemplazan la detección por texto que ya
  existe, la hacen más precisa: menos falso positivo en los tipos de
  señal `funding_round` y `tech_adoption`.
- **Más portales de contratación** (Indeed, además de Greenhouse/Lever) y
  **datos de mercado/divisa** (para el punto 1: tipos de cambio diarios).
- **Notion / Google Drive** — para que un battlecard o un artefacto viva
  también donde el equipo ya trabaja, no solo dentro de BEE.
- **Reddit** — señal de comunidad/sentimiento; encaja como una fuente de
  mercado más, no como canal de salida.

**No entran, salvo que cambie el caso de uso**: herramientas sin relación
con detectar una señal, preparar una jugada o cerrarla (p. ej. Figma,
Monday.com — Jira ya cubre gestión de proyectos, Substack) — sumarlas
solo por presencia visual en una página de integraciones no es la lógica
que sigue este roadmap.

**Landing.** Una fila "Conecta con tus herramientas" con los conectores
reales (arriba) es fácil de justificar — no son promesas, ya funcionan.
Pendiente de decidir: el estilo va contra la regla de "solo tinta y la
paleta de BEE" que rige el resto de la landing — un logo real de
Salesforce o Slack es a todo color por definición. Dos caminos: (a)
insignias de solo texto/tinta, dentro de la regla, con menos impacto
visual de "estamos conectados con todo"; (b) una excepción puntual y
explícita a la regla del color, solo en esta fila, con los logos
oficiales reales (no una aproximación) — pendiente de que el equipo lo
decida y de conseguir los archivos de marca correctos si se elige (b).
