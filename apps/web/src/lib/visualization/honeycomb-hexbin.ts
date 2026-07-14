import { hexbin as d3Hexbin } from "d3-hexbin";
import { interpolateRgb } from "d3-interpolate";
import { scaleLinear } from "d3-scale";

import { hashDomain } from "@/lib/control/lead-board";
import type { HotLeadScore } from "@/types/extended";
import type { BuyingStage } from "@/types/extended";

/** Terracotta → ochre closing-temperature scale (BEE hive palette). */
export const TEMPERATURE_COLORS = {
  cool: "#f0e6dc",
  warm: "#d4a574",
  hot: "#c4724a",
  blaze: "#8b4513",
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
    .domain([0, 35, 65, 100])
    .range([
      TEMPERATURE_COLORS.cool,
      TEMPERATURE_COLORS.warm,
      TEMPERATURE_COLORS.hot,
      TEMPERATURE_COLORS.blaze,
    ])
    .interpolate(interpolateRgb);
}

/** Map DarkFunnel leads to 2D points (stage × temperature + stable jitter). */
export function leadsToPoints(
  leads: HotLeadScore[],
  width: number,
  height: number,
): LeadPoint[] {
  const padX = width * 0.06;
  const padY = height * 0.08;

  return leads.map((lead) => {
    const hash = hashDomain(lead.company_domain);
    const stageKey = lead.buying_stage as BuyingStage;
    const stageX = STAGE_X[stageKey] ?? 0.5;
    const x =
      padX +
      stageX * (width - padX * 2) +
      ((hash % 100) - 50) * 0.25;
    const y =
      padY +
      (1 - lead.research_intensity_score / 100) * (height - padY * 2) +
      (((hash >> 7) % 80) - 40) * 0.2;

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
): void {
  const color = createTemperatureColorScale();
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (const cell of cells) {
    const isHovered = hovered === cell;
    drawHexagon(ctx, cell.x, cell.y, radius - 1);
    ctx.fillStyle = color(cell.temperature);
    ctx.globalAlpha = isHovered ? 1 : 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isHovered ? TEMPERATURE_COLORS.blaze : "rgba(139, 69, 19, 0.12)";
    ctx.lineWidth = isHovered ? 2 : 0.5;
    ctx.stroke();
  }
}
