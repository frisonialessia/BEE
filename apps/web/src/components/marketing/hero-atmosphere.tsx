import { hexagonPath, layoutRadialHive } from "@/lib/visualization/honeycomb-radial";

/**
 * The hero's backdrop: the same lavender wash as before, plus a large,
 * very faint hex cluster bled off the top-right corner — the honeycomb's
 * own shape, not a generic pattern or a blob. Pure and deterministic (no
 * randomness), so it costs nothing (no client JS: this renders on the
 * server, same markup every time) and never fights the text for
 * attention — stroke only, no fill, single-digit opacity.
 */
export function HeroAtmosphere() {
  // A big, dense cluster (rings=6, 127 cells) at a fixed size — this is
  // decoration sized to bleed off the hero, not a chart that needs to fit
  // a real box, so it doesn't need useBoxSize/client measurement.
  const layout = layoutRadialHive(127, 640, 640, { maxRadius: 30, minRadius: 30 });
  const cells = [...layout.cells, ...layout.ghosts];

  return (
    <div className="bee-hero-wash" aria-hidden>
      <svg
        viewBox="0 0 640 640"
        className="pointer-events-none absolute -right-32 -top-40 hidden h-[640px] w-[640px] lg:block"
      >
        {cells.map((c, i) => (
          <path key={i} d={hexagonPath(c.x, c.y, layout.radius)} fill="none" stroke="var(--color-text)" strokeOpacity={0.05} strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}
