/**
 * The one honeycomb layout in BEE — radial, like the reference: the
 * hottest item sits in the centre cell, the next ones fill the first ring,
 * and so on outward, so the comb is always a rounded hexagon whatever the
 * count. With real data it is born cell by cell: the empty positions of
 * the ring in progress are returned as `ghosts` (drawn hollow, in the page
 * grey) so the comb reads as a comb from the very first account and can be
 * seen growing.
 *
 * Pointy-top hexagons in axial coordinates (q, r); 1px of white between
 * cells comes from the stroke, not from spacing, so the cells touch.
 */

export interface HexCoord {
  q: number;
  r: number;
  /** Distance from the centre, in rings. */
  ring: number;
}

export interface HivePlacement {
  x: number;
  y: number;
  ring: number;
}

export interface HiveLayout {
  /** One placement per item, in the order given (hottest first). */
  cells: HivePlacement[];
  /** Empty positions of the outer ring in progress. */
  ghosts: HivePlacement[];
  /** Cell radius (centre to corner), in px. */
  radius: number;
  rings: number;
}

const SQRT3 = Math.sqrt(3);
// The six axial directions (pointy-top), in the order that walks a ring
// clockwise starting from the cell down-left of the centre.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** How many cells a full comb of `rings` rings holds (1, 7, 19, 37, 61…). */
export function cellsInRings(rings: number): number {
  return 1 + 3 * rings * (rings + 1);
}

/** How many rings a comb needs to hold `n` cells. */
export function ringsFor(n: number): number {
  let rings = 0;
  while (cellsInRings(rings) < n) rings += 1;
  return rings;
}

/** Spiral of axial coordinates: centre, then ring 1 clockwise, ring 2… */
export function spiral(count: number): HexCoord[] {
  const out: HexCoord[] = [{ q: 0, r: 0, ring: 0 }];
  for (let k = 1; out.length < count; k++) {
    // Ring k starts k steps along direction 4 from the centre.
    let q = -k;
    let r = k;
    for (const [dq, dr] of DIRS) {
      for (let step = 0; step < k; step++) {
        out.push({ q, r, ring: k });
        q += dq;
        r += dr;
      }
    }
  }
  return out.slice(0, count);
}

/**
 * Places `count` cells in the box, hottest first, the comb centred and as
 * large as fits (capped at `maxRadius`, floored at `minRadius`).
 */
export function layoutRadialHive(
  count: number,
  width: number,
  height: number,
  { maxRadius = 26, minRadius = 6 }: { maxRadius?: number; minRadius?: number } = {},
): HiveLayout {
  if (count <= 0 || width <= 0 || height <= 0) return { cells: [], ghosts: [], radius: maxRadius, rings: 0 };
  const rings = ringsFor(count);
  // A comb of R rings spans (2R + 1) cell widths (√3·r each) and
  // (1.5·(2R) + 2)·r in height.
  const byWidth = (width - 4) / ((2 * rings + 1) * SQRT3);
  const byHeight = (height - 4) / (3 * rings + 2);
  const radius = Math.max(minRadius, Math.min(maxRadius, byWidth, byHeight));
  const cx = width / 2;
  const cy = height / 2;
  const place = ({ q, r, ring }: HexCoord): HivePlacement => ({
    x: cx + SQRT3 * radius * (q + r / 2),
    y: cy + 1.5 * radius * r,
    ring,
  });
  const full = spiral(cellsInRings(rings));
  return {
    cells: full.slice(0, count).map(place),
    ghosts: full.slice(count).map(place),
    radius,
    rings,
  };
}

/** SVG path of a pointy-top hexagon. */
export function hexagonPath(cx: number, cy: number, radius: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/**
 * Which step of the ramp a cell takes: by its rank when there are enough
 * cells to walk the whole ramp, by its ring otherwise (three steps per
 * ring), so a young comb of five accounts already shows a hot centre and
 * a cooler first ring instead of five near-identical cells.
 */
export function rampIndex(rank: number, ring: number, count: number, steps: number): number {
  if (count >= steps) return Math.min(steps - 1, Math.floor((rank / count) * steps));
  return Math.min(steps - 1, ring * 3);
}
