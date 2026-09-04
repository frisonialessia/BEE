# BEE — Brief de rediseño de interfaz

Documento de arranque para reconstruir la landing, el dashboard y el sandbox
desde cero, reutilizando el cerebro (API, modelos, demo store, hooks) y el
sistema de diseño ya escrito. Escrito el 2026-09-04 tras la decisión de la
fundadora: "lo único de BEE que me gusta es la ventana para agendar evento en
el calendario, el calendario, la página de ventas y el CRM. Todo lo demás
quiero rediseñarlo con el cerebro que ya tenemos".

## 1. Lo que sí gusta, y qué lo hace funcionar

Estas cuatro piezas son la referencia. No se tocan; todo lo nuevo se diseña
para parecerse a ellas.

### Ventana "Nueva reunión" (calendario)
`apps/web/src/features/calendar/calendar-page.tsx` (bloque `<Dialog>` al final
del archivo, ~línea 1568).

- Tarjeta blanca centrada (`DialogContent max-w-lg`), título grande
  (`bee-display text-lg`), cierre limpio.
- Etiquetas pequeñas arriba de cada campo (`text-xs font-medium
  text-muted-foreground`), inputs rellenos en gris (`bee-input`, fondo
  `--color-background`, altura fija `--bee-control-h-compact`).
- Opciones como píldoras que se activan (`bee-btn-ghost` / `bee-filter-tab`,
  estado activo con relleno lavanda `--color-primary`).
- Elección de color como fila de puntos (`size-6 rounded-full`, el elegido
  con anillo en tinta y `scale-110`), con una línea de ayuda en `bee-micro`.
- Pie con Cancelar (ghost) y Guardar (`bee-btn--primary`, azul).
- Todo responde al instante: escribir cambia el estado, elegir un color lo
  muestra, no hay pasos ni pantallas intermedias.

### Calendario
Misma carpeta. Semana con bloques de cita de alto fijo (nunca se corta título,
hora ni cuenta), color de la cita elegido por la persona (los seis tonos BEE
más los tres verdes solo para cierres), arrastrar para reagendar con
confirmación, mini-mes y "Desglose de tiempo" en la columna izquierda.

### Página de Ventas
`apps/web/src/features/sales/sales-view.tsx`. Es el estándar de página:
encabezado (eyebrow · título · caption) → `StatStrip` de `StatTile` → cuadrícula
`.bee-overview` de 12 columnas con `OverviewCard`. Única página con verdes
(`SALES.won / lime / mint`), siempre los tres juntos.

### CRM (tablero)
`apps/web/src/features/crm/crm-board.tsx`. Columnas con un color BEE cada una
(miel, lila, índigo…), tarjetas con la intensidad del color según el score,
sin números en la tarjeta, cerradas en verdes, arrastrar entre columnas.
Encabezado con pestañas en la misma fila (`MergedPageTabs`).

## 2. Reglas de diseño acumuladas (todas siguen vigentes)

1. **Colores**: solo tokens BEE (`--color-chart-1..6`, `--color-primary`
   lavanda, `--color-text` tinta, `--color-card` blanco, `--color-background`).
   Nunca un color inventado ni mezclas de un tono con tinta (dan dorados y
   morados que no son BEE). Helper `mix(hue, pct)` solo hacia blanco.
2. **Verde solo en Ventas** (y en las tarjetas cerradas del CRM y como opción
   de color de cita en Calendario). En ninguna otra página.
3. **Azul solo en botones** (`bee-btn--primary`). No en gráficas, links ni
   chips.
4. **Ningún texto ni icono lleva color**: todo en tinta (`--color-text`) o
   tinta apagada (`--color-text-muted`). El color vive en marcas de gráfica,
   fondos de chips, celdas y barras.
5. **Un color por caja/tema**: dentro de una caja, chip, barra, anillo y
   filas comparten el mismo tono a 100/70/45 %.
6. **Fondos blancos** en todo el producto y la landing; el hero de la landing
   admite solo un velo lavanda muy suave.
7. **Tipografía estándar**: `bee-display`, `bee-card-title`, `text-sm`,
   `bee-caption`, `bee-micro` (solo para horas). Nada de tamaños arbitrarios
   ni "mini letras".
8. **Ninguna caja con espacio en blanco**: las gráficas miden su caja
   (`use-box-size`), las listas muestran las filas que caben
   (`use-row-capacity`), las tablas fijas reparten la altura (`.bee-fill`).
   Si una caja no se puede llenar, se hace más pequeña o se fusiona.
9. **Cifras y porcentajes solo al pasar el mouse** en las gráficas.
10. **Nada inventado**: todo número sale de datos reales o del demo store,
    etiquetado como datos de ejemplo. Sin "20,000 usuarios", sin resúmenes de
    IA fabricados.
11. **KPIs a la misma altura en todas las páginas**: encabezado y pestañas en
    una sola fila, luego la tira de KPIs.
12. **Una sola ventana** para ver y crear oportunidades, leads y empresas: la
    lateral (`.bee-drawer--wide`). Debe hablar el mismo idioma que "Nueva
    reunión" (inputs grises, píldoras, puntos, respuesta inmediata).
13. **La landing no menciona fuentes conectadas** (LinkedIn, G2, etc.) hasta
    que existan más integraciones. Demo en vivo solo con Señales, pegada al
    hero, estilo Linear; Ventas al final explicando la diferencia contra CRMs
    y herramientas de intención.

## 3. Qué se reutiliza tal cual (el "cerebro")

- Backend completo (`apps/api`), migraciones, endpoints, scoping multi-tenant.
- Demo store del sandbox: `apps/web/src/lib/demo/store.ts`,
  `seed-history.ts`, `overview.ts` (datos, jugadas, cuotas, reuniones de
  cuatro semanas).
- Hooks de datos: `apps/web/src/hooks/queries/*`.
- Modelos de cálculo: `src/lib/sales-model.ts`, `daily-brief.ts`,
  `strategy-evidence.ts`, `industry-signal-grid.ts`,
  `signal-activity-grid.ts`, `quotas.ts`, `forecast.ts`, `icp.ts`.
- Sistema de diseño: `src/app/globals.css` (tokens, `.bee-card`,
  `.bee-bento`, `.bee-overview`, `.bee-fill`, `.bee-input`, `.bee-btn*`,
  `.bee-eyebrow/display/card-title/caption/micro`, `.bee-drawer*`).
- Componentes de gráfica: `src/components/charts/*` (`area-chart`,
  `bars-vs-target`, `donut`, `horizontal-funnel`, `progress-ring`,
  `stage-tiles`, `stat-tile`, `delta-chip`, `use-box-size`,
  `use-row-capacity`, `palette.ts` con `DATA`, `SALES`, `mix`).
- Shell de página: `OverviewCard`, `StatStrip`, `MergedPageTabs`
  (encabezado + pestañas + acciones en una fila, `belowTabs` para la tira).
- Colmena: `src/lib/visualization/honeycomb-hexbin.ts` (`layoutHiveCells`).
- Idioma automático por navegador (`src/proxy.ts`, `src/i18n/request.ts`).

## 4. Qué se reconstruye

- Landing completa (`src/app/page.tsx`, `src/components/marketing-*`),
  /funcionalidades y /contacto.
- Resumen (`src/features/dashboard/dashboard-overview.tsx` y sus cajas).
- Señales (feed, priorización, intención), Estrategias, Pronóstico,
  Ganado/Perdido, Control (salud + conexiones), Red, Voz de marca,
  Secuencias, Empresas y Leads.
- La ventana de oportunidad (`src/features/crm/drawer/*`): partir de la
  ventana "Nueva reunión" como referencia, no del drawer actual.

Recomendación de orden: 1) definir el shell de página y la ventana de
oportunidad copiando la reunión; 2) Resumen; 3) Señales y Estrategias;
4) Pronóstico y Control; 5) landing.

## 5. Estado de ramas y producción (2026-09-04)

- `main` y `claude/bee-mvp-audit-729dn4` contienen todo lo anterior. El
  último commit en `main` es `dbfcf61`; la rama tiene además `c95e456`
  (landing a medio hacer, no desplegar).
- Producción (Vercel `bee-api`) sigue con **deriva de esquema**: la base Neon
  en `DATABASE_URL` está en la migración 025 y el código espera 047; login y
  registro devuelven `internal_error` hasta correr `neon-025-to-047.sql` en
  Neon o apuntar `DATABASE_URL` a Supabase (`ohlrpxaydrucglkawwxs`, ya en
  047). `CRON_SECRET` sin definir en Vercel deja el cron de la cola en 404.
- Verificación local que funcionó: `pnpm exec tsc --noEmit -p .`,
  `pnpm lint`, build y capturas con Playwright; auditoría de tonos fuera de
  paleta con un script de estilos computados (todas las rutas en 0).

## 6. Estado del rediseño (2026-09-04, tarde)

Todo el rediseño está en `main`, en seis commits (fases 1 a 5 y la
limpieza). Reglas que quedaron fijadas en código, además de las de la
sección 2:

- **Paleta de trabajo**: `apps/web/src/components/charts/palette.ts`.
  `TONE` asigna un tono a lo que representa cada gráfica (miel mercado,
  lila lo que BEE prepara, magenta urgencia, índigo pronóstico y equipo,
  lavanda calma); `tint(hue, 100 | 70 | 45)` y `level(hue, i)` dan las
  tres intensidades hacia blanco y `REST` (gris de página) para lo demás;
  `heat(hue, 0..1)` para celdas secuenciales; `HIVE_RAMP` para la colmena.
- **Una sola colmena**: `components/charts/honeycomb.tsx` sobre
  `lib/visualization/honeycomb-radial.ts` (espiral desde el centro, celdas
  huecas para el anillo en curso). `features/signals/intent-hive.tsx` la
  alimenta con datos reales. Nadie dibuja otra.
- **Shell**: `components/dashboard/page-shell.tsx` (PageHeader, PageShell),
  `components/merged-page-tabs.tsx`, `components/charts/stat-tile.tsx`
  (StatStrip, StatTile), `components/dashboard/overview-card.tsx`
  (OverviewCard, CardLink), `.bee-page*`, `.bee-tile*`, `.bee-tabs*`,
  `.bee-row`, `.bee-dot` en `globals.css`.
- **Ninguna letra de color**: el botón primario y las píldoras activas
  llevan texto en tinta.
- **Color elegido por la persona**: `components/color-dots.tsx` (seis tonos
  BEE + tres verdes). Las oportunidades tienen `color` (migración 048).
- **Auditoría**: un script de Playwright recorre cada ruta y comprueba que
  todo color computado sea un token, una mezcla hacia blanco de un token o
  un gris entre tinta y fondo; verdes solo en Ventas, CRM y Calendario.
  Última corrida: 0 hallazgos en las 21 rutas.
