import { hexbin as d3Hexbin } from "d3-hexbin";
import { interpolateRgb } from "d3-interpolate";
import { scaleLinear } from "d3-scale";

import { hashDomain } from "@/lib/control/lead-board";
import type { HotLeadScore } from "@/types/extended";
import type { BuyingStage } from "@/types/extended";

import { BEE_COLORS, TEMPERATURE_SCALE } from "@/lib/brand/colors";

/** Closing-temperature scale for Colmena (re-export for components). */
export const TEMPERATURE_COLORS = {
  cool: TEMPERATURE_SCALE[0],
  mild: TEMPERATURE_SCALE[1],
  warm: TEMPERATURE_SCALE[2],
  hot: TEMPERATURE_SCALE[3],
  blaze: TEMPERATURE_SCALE[4],
  peak: TEMPERATURE_SCALE[5],
} as const;

const STAGE_X: Record<string, number> = {
  awareness: 0.12,
  consideration: 0.38,
  decision: 0.62,
  ready_to_buy: 0.88,
};

export interface LeadPoint {
  x: number;
  y: number;
  temperature: number;
  lead: HotLeadScore;
}

export interface HiveHexCell {
  x: number;
  y: number;
  temperature: number;
  maxTemperature: number;
  count: number;
  leads: HotLeadScore[];
}

export function createTemperatureColorScale() {
  return scaleLinear<string>()
    .domain([0, 20, 45, 65, 85, 100])
    .range([...TEMPERATURE_SCALE])
    .interpolate(interpolateRgb);
}

/** Map DarkFunnel leads to 2D points (stage × temperature + stable jitter). */
export function leadsToPoints(
  leads: HotLeadScore[],
  width: number,
  height: number,
  radius: number,
): LeadPoint[] {
  // Padding must never be smaller than a hexagon's own radius — otherwise a
  // cell whose centroid lands near the plotted edge (a real, if unlikely,
  // outcome of jitter + the STAGE_X columns closest to 0/1, "awareness" at
  // 0.12 and "ready_to_buy" at 0.88) draws partly outside the canvas, which
  // clips it: a real signal rendered half-invisible at the card's edge,
  // reading as a hexagon quietly disappearing. The percentage-based padding
  // below is fine on a roomy card but was never large enough on its own —
  // it doesn't know how big a hexagon it needs to leave room for, since
  // radius grows precisely when leads are sparse (see hexRadius in
  // SignalHexMap.tsx) and a sparse canvas is also often narrower. `* 1.15`
  // is slack for the jitter above pushing a point a few px further out
  // than its column's nominal position.
  const padX = Math.max(width * 0.06, radius * 1.15);
  const padY = Math.max(height * 0.08, radius * 1.15);
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  // Jitter used to be a flat pixel amount (±12.5px x, ±8px y) no matter how
  // big the canvas was. That's plenty of spread on a compact card, but on a
  // wide, tall hero canvas each of the 4 stage columns collapsed into a
  // tight little dot surrounded by mostly-empty space — same "container
  // grew, content didn't" bug the chart heights had. Scaling the jitter to
  // the plotted area itself makes each stage's cluster fill the room it
  // actually has, on any container size. 0.09 of the stage-column width
  // stays well under half the 0.26 spacing between STAGE_X columns, so
  // neighboring stages' clusters never overlap.
  const jitterX = plotW * 0.09;
  const jitterY = plotH * 0.07;

  // Belt-and-suspenders on top of the radius-aware padding above: the
  // padding math keeps a stage column's *nominal* center comfortably clear
  // of the edge, but jitter can still push an individual point outward from
  // there — clamping every point's final position to [radius, dimension -
  // radius] is a hard, unconditional guarantee that no hexagon can ever be
  // centered close enough to the canvas edge to get clipped, independent of
  // how the padding/jitter percentages above interact for any given canvas
  // size or lead count.
  const minX = radius;
  const maxX = width - radius;
  const minY = radius;
  const maxY = height - radius;

  return leads.map((lead) => {
    const hash = hashDomain(lead.company_domain);
    const stageKey = lead.buying_stage as BuyingStage;
    const stageX = STAGE_X[stageKey] ?? 0.5;
    const rawX = padX + stageX * plotW + ((hash % 100) - 50) * (jitterX / 50);
    const rawY =
      padY +
      (1 - lead.research_intensity_score / 100) * plotH +
      (((hash >> 7) % 80) - 40) * (jitterY / 40);
    const x = Math.min(Math.max(rawX, minX), maxX);
    const y = Math.min(Math.max(rawY, minY), maxY);

    return {
      x,
      y,
      temperature: lead.research_intensity_score,
      lead,
    };
  });
}

/** Aggregate lead points into hex bins via d3-hexbin. */
export function binLeadPoints(points: LeadPoint[], radius: number): HiveHexCell[] {
  const generator = d3Hexbin<LeadPoint>()
    .radius(radius)
    .x((d) => d.x)
    .y((d) => d.y);

  const bins = generator(points);

  return bins.map((bin) => {
    const temps = bin.map((p) => p.temperature);
    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    return {
      x: bin.x,
      y: bin.y,
      temperature: avg,
      maxTemperature: Math.max(...temps),
      count: bin.length,
      leads: bin.map((p) => p.lead),
    };
  });
}

/** Draw a pointy-top hexagon on Canvas. */
export function drawHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Find hex cell under cursor (nearest center within radius). */
export function findHexAt(
  cells: HiveHexCell[],
  mx: number,
  my: number,
  radius: number,
): HiveHexCell | null {
  let best: HiveHexCell | null = null;
  let bestDist = radius * 1.1;

  for (const cell of cells) {
    const dist = Math.hypot(cell.x - mx, cell.y - my);
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }

  return best;
}

export function renderHiveCanvas(
  ctx: CanvasRenderingContext2D,
  cells: HiveHexCell[],
  width: number,
  height: number,
  radius: number,
  hovered: HiveHexCell | null,
  hoverStrength = 0,
): void {
  const color = createTemperatureColorScale();
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (const cell of cells) {
    const isHovered = hovered === cell;
    const scale = isHovered ? 1 + hoverStrength * 0.06 : 1;
    const r = (radius - 1) * scale;

    drawHexagon(ctx, cell.x, cell.y, r);
    ctx.fillStyle = color(cell.temperature);
    ctx.globalAlpha = isHovered ? 0.88 + hoverStrength * 0.12 : 0.82;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isHovered
      ? BEE_COLORS.chart.magenta
      : "rgba(138, 158, 255, 0.15)";
    ctx.lineWidth = isHovered ? 1 + hoverStrength * 1.5 : 0.5;
    ctx.stroke();
  }
}
