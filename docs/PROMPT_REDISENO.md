# Prompt de rediseño de BEE (para el chat que reconstruye la interfaz)

Copia el bloque de abajo tal cual como primer mensaje. Las imágenes que
menciona están en `docs/design/`.

---

Vamos a reconstruir desde cero toda la interfaz de BEE (landing, dashboard y
sandbox `/probar`) reutilizando el cerebro que ya existe: API, demo store,
hooks y modelos de cálculo. Antes de tocar nada lee `CLAUDE.md`,
`docs/DESIGN_BRIEF.md` y mira estas cinco imágenes en `docs/design/`:

1. `referencia-bento-colmena.jpg` — la referencia visual maestra. Copia su
   arquitectura: tarjetas blancas independientes sobre fondo gris muy tenue,
   bordes de 1 px y sombra suave, radio 24 px, márgenes iguales entre todas
   las tarjetas, títulos cortos con caption en gris, KPIs con número grande y
   una tendencia mínima al lado, listas con separadores finos, avatares
   redondos y etiquetas en píldora, una colmena hexagonal como gráfica
   central con las métricas clave debajo, un mapa de calor día × hora, y un
   gráfico de barras finas a lo ancho para series largas.
2. `referencia-nueva-reunion.png` — la ventana "Nueva reunión" del calendario.
   Es el idioma de TODA ventana y formulario de BEE: tarjeta blanca, título
   grande, etiquetas pequeñas, inputs grises rellenos (`bee-input`), opciones
   como píldoras que se activan, colores como fila de puntos con anillo en
   el elegido, una línea de ayuda, pie con Cancelar y Guardar en azul.
   Responde al instante a cada cambio.
3. `referencia-calendario.png` — el calendario: bloques de cita de alto fijo
   con título, hora y cuenta siempre visibles, color elegido por la persona.
4. `referencia-ventas.png` — la página de Ventas: encabezado → tira de KPIs
   → cuadrícula de 12 columnas. Es el estándar de página. Única página con
   verdes.
5. `referencia-crm.png` — el CRM: una columna por etapa con su color BEE,
   tarjetas con la intensidad del color según el score, arrastrar entre
   columnas.

Estas cuatro pantallas (reunión, calendario, Ventas, CRM) NO se tocan. Todo
lo demás se rehace para parecerse a ellas y a la imagen 1.

## Reglas (no negociables)

- Colores solo de la paleta BEE: `--color-chart-1` miel `#ffb213`,
  `--color-chart-2` miel intensa `#fca000`, `--color-chart-3` miel clara
  `#ffbe55`, `--color-chart-4` índigo `#8a9eff`, `--color-chart-5` magenta
  `#d567ff`, `--color-chart-6` lila `#c197ff`, `--color-primary` lavanda
  `#c8d7f8`, tinta `#222222`, blanco `#ffffff`, fondo `#f1f2f6`. Helper
  `mix(hue, pct)` solo hacia blanco. Nunca un color inventado, nunca un tono
  mezclado con tinta.
- Verde (`SALES.won #52c871`, `lime #9cd147`, `mint #b4e8c5`) SOLO en la
  página de Ventas, en las tarjetas cerradas del CRM y como opción de color
  de cita en Calendario. En ninguna otra pantalla, ni en la landing.
- Azul (`--color-chart-4`) SOLO en botones primarios. No en gráficas, links,
  chips ni iconos.
- Ningún texto ni icono lleva color: todo en tinta o tinta apagada. El color
  vive en marcas de gráfica, celdas de colmena, fondos de chips y barras.
- Un color por caja: chip, barra, anillo y filas de una misma tarjeta
  comparten el tono a 100 / 70 / 45 %.
- Fondos blancos en todo; el fondo de página es `#f1f2f6`; la landing puede
  llevar un velo lavanda muy suave solo en el hero.
- Tipografía estándar y única: `bee-display` para títulos de página,
  `bee-card-title` para títulos de tarjeta, `text-sm` para contenido,
  `bee-caption` para etiquetas, `bee-micro` solo para horas. Nada de tamaños
  arbitrarios ni letras mini.
- Contornos, márgenes y tamaños idénticos en todas las tarjetas: usa
  `OverviewCard` + `.bee-overview` (12 columnas, gap 1.5 rem, filas de 18 rem
  mínimo) y `StatStrip` + `StatTile` para KPIs. No inventes otro shell.
- Ninguna tarjeta con espacio en blanco: las gráficas miden su caja
  (`use-box-size`), las listas muestran solo las filas que caben
  (`use-row-capacity`), las tablas fijas reparten la altura (`.bee-fill`).
  Si una caja no se puede llenar con datos reales, se hace más chica o se
  fusiona con otra.
- Cifras y porcentajes solo al pasar el mouse en las gráficas; en KPIs, el
  número grande y una tendencia mínima.
- Nada inventado: todo número sale de la API o del demo store, marcado como
  "datos de ejemplo" en el sandbox y en la landing.
- Cero información repetida entre páginas y entre cajas. Cada dato vive en
  una sola gráfica; si dos cajas responden la misma pregunta se fusionan en
  una sola gráfica más potente.
- Las tiras de KPIs empiezan a la misma altura en todas las páginas
  (encabezado y pestañas en una sola fila, `MergedPageTabs`).
- Una sola ventana lateral para ver y crear oportunidades, leads y empresas,
  construida con el idioma de "Nueva reunión". Con borrador automático:
  nada de lo escrito se pierde.
- Idioma automático por navegador (ya implementado); todo texto nuevo en
  `messages/es` y `messages/en`.
- Verificación antes de cada commit: `pnpm exec tsc --noEmit -p .`,
  `pnpm lint`, build, captura de cada página a 1440 px y auditoría de que no
  haya ningún color fuera de paleta. Commits en `main` explicando el porqué.

## Qué construir, en este orden

1. **Shell de página y ventana de oportunidad.** Página = encabezado
   (eyebrow · título · caption) con pestañas y acciones a la derecha → tira
   de KPIs → cuadrícula. Ventana lateral = formulario a la izquierda con el
   idioma de "Nueva reunión" (empresa, contacto, oportunidad, etapa como
   píldoras, responsable como píldoras de equipo, prioridad como fila de
   puntos) y a la derecha la tarjeta de la oportunidad que se arma en vivo
   mientras escribes, con las gráficas de la cuenta debajo.
2. **Resumen (dashboard y sandbox).** Bento asimétrico como la imagen 1:
   tira de 4 KPIs (2 de mercado, 2 de dinero) → colmena de intención como
   bloque central con sus métricas por etapa debajo y "La jugada de hoy" a
   su lado → Brief · Calendario · Ranking → Ventas · Embudo · Dónde eres
   más fuerte (matriz industria × señal) → Mercado (señales por semana y
   mezcla en una sola caja). Nueve cajas, cuatro preguntas: hoy, dinero,
   mercado, dónde apuntar.
3. **Señales** (feed · priorización · intención con la colmena y el mapa
   día × hora), **Estrategias** (battlecards con filtro por etapa · qué
   funciona), **Pronóstico** (proyección con el simulador integrado ·
   ganado/perdido), **Control** (un tablero de salud · conexiones),
   **Empresas** (una tira de KPIs para directorio y leads), **Red**, **Voz
   de marca**, **Secuencias**. Mismo shell, mismas gráficas, sin repetir
   datos con el Resumen: el Resumen es una ventana, cada página es el
   detalle.
4. **Landing** estilo Linear: navbar flotante, hero con titular grande en
   tinta, demo en vivo pegada al hero mostrando solo Señales con gráficas
   reales, tres bandas de producto (llega la señal · BEE arma la jugada · tú
   decides), y al final Ventas explicando la diferencia contra un CRM
   tradicional y contra las herramientas de intención, con el simulador
   sobre blanco. Sin mencionar fuentes conectadas, sin verdes, sin
   contadores inventados, sin efectos.

Empieza por el punto 1 y muéstrame una captura antes de seguir con el 2.

---
