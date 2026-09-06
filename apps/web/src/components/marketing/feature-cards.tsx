import { getTranslations } from "next-intl/server";

import { HIVE_RAMP, REST, SALES, TONE, tint } from "@/components/charts/palette";
import { hexagonPath, layoutRadialHive, rampIndex } from "@/lib/visualization/honeycomb-radial";

/**
 * Por qué BEE no es un CRM, en tarjetas.
 *
 * Sustituye a dos intentos anteriores que fallaban por lo mismo, desde lados
 * opuestos: siete bandas de adjetivos ("detección en tiempo real") que no
 * enseñaban nada, y después un marco con tablas de registros del sandbox que
 * enseñaban demasiado — nombres de cuentas, montos, scores — como si esta
 * página fuera el producto. No lo es: es la explicación de por qué el
 * producto existe. Quien quiera ver datos entra a /probar, que está a un clic.
 *
 * Así que aquí las gráficas son **abstractas a propósito**: barras, hexágonos,
 * un embudo, un anillo. Ningún número, ninguna etiqueta, ningún nombre de
 * empresa — la forma sola dice qué hace cada pieza, y no hay que fingir que
 * son datos de nadie. La regla 10 del brief ("nada inventado") deja de ser un
 * problema cuando no se afirma ningún dato.
 *
 * Cada tarjeta lleva una capacidad que un CRM no tiene, y la lleva sola: un
 * título que es la diferencia, dos líneas que la explican, y una figura en el
 * tono del módulo. Un tono por caja a 100/70/45 %, verdes solo en Ventas, y
 * ni un glifo de color (DESIGN_BRIEF §2.1, §2.2, §2.4, §2.5).
 *
 * Componente de servidor: no hay estado, no hay pestañas, no hay medición de
 * caja. Todo es CSS y SVG estático, así que no puede desincronizarse entre el
 * render del servidor y el del cliente — el fallo que ya nos costó /probar.
 */

/** Ancho en columnas (de 12) por tarjeta, en lg. Abajo todas van a 1.
 *  Ocho tarjetas en filas de tres dejan dos solas al final, así que las dos
 *  últimas van a media fila cada una y la cuadrícula cierra completa. */
const SPAN: Record<string, string> = {
  signal: "lg:col-span-4",
  hive: "lg:col-span-4",
  window: "lg:col-span-4",
  pipeline: "lg:col-span-4",
  play: "lg:col-span-4",
  sales: "lg:col-span-4",
  learn: "lg:col-span-6",
  network: "lg:col-span-6",
};

/** Alto de la figura por tarjeta. No es decorativo: el embudo son cinco
 *  barras con sus separaciones y no cabe en la caja corta — se montaba
 *  encima del párrafo. El panal necesita altura para leerse como panal. */
const FIG_H: Record<string, string> = {
  hive: "h-40",
  pipeline: "h-28",
};

const ORDER = ["signal", "hive", "window", "pipeline", "play", "sales", "learn", "network"] as const;
type CardId = (typeof ORDER)[number];

/** El tono que lleva cada tarjeta. Ventas es la única con verdes. */
const HUE: Record<CardId, string> = {
  signal: TONE.market,
  hive: TONE.marketDeep,
  window: TONE.urgency,
  pipeline: TONE.forecast,
  play: TONE.calm,
  sales: SALES.won,
  learn: TONE.prepared,
  network: TONE.forecast,
};

/* ── Figuras ────────────────────────────────────────────────────────────────
   Todas sin ejes, sin números y sin leyenda: son la forma de la idea, no una
   medición. `aria-hidden` en todas — lo que hay que leer está en el texto. */

/** Barras que crecen: una señal que se acumula antes de que exista el lead. */
function Bars({ hue, values }: { hue: string; values: number[] }) {
  return (
    <div className="flex h-full w-full items-end gap-1.5" aria-hidden>
      {values.map((v, i) => (
        <i
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${v}%`, background: i === values.length - 1 ? hue : tint(hue, 70) }}
        />
      ))}
    </div>
  );
}

/** Panal: el mismo del sandbox, no una aproximación.
 *
 *  El primer intento dibujaba tres anillos concéntricos de un solo tono, y
 *  no se parecía: la colmena de BEE reparte las celdas en espiral por calor
 *  (la más caliente al centro) y las pinta con HIVE_RAMP, trece pasos que
 *  van del miel profundo al lavanda. Aquí se reusan las MISMAS funciones que
 *  usa el producto — `layoutRadialHive`, `hexagonPath`, `rampIndex` — que
 *  son puras, así que se puede dibujar en el servidor con un tamaño fijo sin
 *  volver la tarjeta un componente de cliente ni medir su caja.
 *
 *  Lo único que no viene del producto son los datos, porque aquí no hay:
 *  61 celdas (cuatro anillos) y el color por posición, sin cuentas detrás.
 */
function Hive() {
  const COUNT = 61;
  const W = 260;
  const H = 176;
  const layout = layoutRadialHive(COUNT, W, H, { maxRadius: 14 });
  const steps = HIVE_RAMP.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-hidden>
      {layout.ghosts.map((g, i) => (
        <path key={`g${i}`} d={hexagonPath(g.x, g.y, layout.radius - 1)} fill={REST} />
      ))}
      {layout.cells.map((c, i) => (
        <path
          key={`c${i}`}
          d={hexagonPath(c.x, c.y, layout.radius - 1)}
          fill={HIVE_RAMP[rampIndex(i, c.ring, COUNT, steps)]}
        />
      ))}
    </svg>
  );
}

/** Embudo de cinco etapas — el pipeline, y nada más que el pipeline. */
function Pipeline({ hue }: { hue: string }) {
  const stages = [100, 82, 62, 44, 28];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2" aria-hidden>
      {stages.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <i
            className="h-4 rounded-md"
            style={{
              width: `${w}%`,
              // La última etapa es un cierre: verde, igual que la columna
              // "Cerradas" del tablero real (§2.2).
              background: i === stages.length - 1 ? SALES.won : tint(hue, i < 2 ? 100 : 70),
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Barras contra una meta, en los tres verdes de Ventas. */
function SalesBars() {
  const values = [46, 58, 70, 64, 88, 100];
  const greens = [SALES.mint, SALES.lime, SALES.won];
  return (
    <div className="relative flex h-full w-full items-end gap-1.5" aria-hidden>
      <i
        className="absolute inset-x-0 border-t border-dashed"
        style={{ bottom: "82%", borderColor: "var(--color-text-muted)" }}
      />
      {values.map((v, i) => (
        <i
          key={i}
          className="flex-1 rounded-sm"
          style={{ height: `${v}%`, background: greens[Math.min(2, Math.floor(i / 2))] }}
        />
      ))}
    </div>
  );
}

/** Un lazo cerrado: lo que se gana o se pierde vuelve a la siguiente jugada. */
function Loop({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 260 72" className="h-full w-full" aria-hidden>
      {/* Tres pasos y una vuelta: el resultado regresa al principio. */}
      <path
        d="M28 52 H232"
        fill="none"
        stroke={tint(hue, 45)}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M232 52 C252 52 252 16 232 16 H28 C8 16 8 52 28 52"
        fill="none"
        stroke={hue}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {[28, 130, 232].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy={52}
          r="11"
          // El último nodo es el cierre: dinero ganado, y por eso verde. Es
          // la misma excepción que ya tienen el paso "Cliente" del embudo y
          // la columna "Cerradas" del tablero (DESIGN_BRIEF §2.2) — el resto
          // del lazo es el aprendizaje, que no es dinero y se queda en lila.
          fill={i === 2 ? SALES.won : hue}
        />
      ))}
    </svg>
  );
}

/** Un camino de nodos: la ruta corta hacia una cuenta a través de la red. */
function Network({ hue }: { hue: string }) {
  const nodes = [
    { x: 16, y: 56 },
    { x: 90, y: 18 },
    { x: 168, y: 54 },
    { x: 244, y: 20 },
  ];
  return (
    <svg viewBox="0 0 260 72" className="h-full w-full" aria-hidden>
      <polyline
        points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
        fill="none"
        stroke={tint(hue, 45)}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={i === nodes.length - 1 ? 14 : 10} fill={i === nodes.length - 1 ? hue : tint(hue, 70)} />
      ))}
    </svg>
  );
}

/** La jugada: una burbuja del copiloto, con la marca de BEE. */
function Play({ hue }: { hue: string }) {
  return (
    <div className="flex h-full w-full items-start gap-2" aria-hidden>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: hue }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- marca estática */}
        <img src="/icon.svg" alt="" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <i className="h-2.5 w-full rounded-full" style={{ background: tint(hue, 100) }} />
        <i className="h-2.5 w-4/5 rounded-full" style={{ background: tint(hue, 70) }} />
        <i className="h-2.5 w-3/5 rounded-full" style={{ background: tint(hue, 45) }} />
      </span>
    </div>
  );
}

/** Cuatro barras que suben: la ventana en la que conviene entrar. */
function Window({ hue }: { hue: string }) {
  return <Bars hue={hue} values={[34, 52, 76, 100]} />;
}

function Figure({ id, hue }: { id: CardId; hue: string }) {
  switch (id) {
    case "signal":
      return <Bars hue={hue} values={[22, 34, 30, 48, 62, 58, 84, 100]} />;
    case "hive":
      return <Hive />;
    case "window":
      return <Window hue={hue} />;
    case "pipeline":
      return <Pipeline hue={hue} />;
    case "play":
      return <Play hue={hue} />;
    case "sales":
      return <SalesBars />;
    case "learn":
      return <Loop hue={hue} />;
    case "network":
      return <Network hue={hue} />;
  }
}

export async function FeatureCards() {
  const t = await getTranslations("legalMarketing.funcionalidades.cards");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
      {ORDER.map((id) => {
        const hue = HUE[id];
        return (
          <article
            key={id}
            className={`bee-bento bee-bento-pad flex flex-col ${SPAN[id]}`}
            style={{ borderTop: `3px solid ${hue}` }}
          >
            <p className="bee-micro truncate">{t(`${id}.eyebrow`)}</p>
            <h3 className="mt-1.5 text-base font-semibold leading-tight">{t(`${id}.title`)}</h3>
            {/* line-clamp en vez de altura fija: la traducción al inglés es
                más corta y el alto lo reparte el grid, no el texto (§2.14). */}
            {/* Sin line-clamp: esto es copia fija en dos idiomas, no texto de
                una API, y el grid ya iguala el alto de cada fila. Recortarlo
                a cuatro líneas cortaba la frase a media palabra en tablet y
                en teléfono, donde la columna es más angosta. */}
            <p className="bee-caption mt-2 mb-5 leading-relaxed">{t(`${id}.text`)}</p>
            {/* La figura vive abajo y a altura fija: así los pies de todas
                las tarjetas de una fila quedan a la misma altura, tenga cada
                una el texto que tenga. */}
            {/* La separación la pone el mb-5 del párrafo, no un padding
                aquí: un padding cuenta dentro del alto de la caja, así que
                h-28 daba 28 menos el padding y las cinco barras del embudo
                se salían por abajo. */}
            <div className={`mt-auto w-full ${FIG_H[id] ?? "h-20"}`}>
              <Figure id={id} hue={hue} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
