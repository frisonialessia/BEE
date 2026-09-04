"use client";

import { Lock, Radio, ShieldCheck, UserCheck, Waypoints } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ComponentType, type ReactNode } from "react";

import { BarsVsTarget } from "@/components/charts/bars-vs-target";
import { Donut } from "@/components/charts/donut";
import { HorizontalFunnel } from "@/components/charts/horizontal-funnel";
import { DATA, mix } from "@/components/charts/palette";
import { StageTiles } from "@/components/charts/stage-tiles";
import { useBoxSize } from "@/components/charts/use-box-size";
import { useReveal } from "@/components/marketing-motion";
import { localeTags, type Locale } from "@/i18n/locales";
import { getDayLabels } from "@/lib/signal-activity-grid";
import { cn } from "@/lib/utils";

/**
 * MarketingTrustCards — "Por qué confiar en BEE" as five dashboard cards,
 * each one a full chart drawn with the same components Resumen uses
 * (src/components/charts), so a visitor who later signs in recognises the
 * marks. Layout is the dashboard's 12-column grid: 6 · 6 / 6 · 6 / 12.
 *
 *   Cero alucinaciones     → coverage tiles + HorizontalFunnel of signals
 *                             scored per real source (indigo).
 *   Aprobación humana      → StageTiles Preparadas · Aprobadas · Enviadas ·
 *                             Rechazadas + BarsVsTarget of approvals by
 *                             week (honey).
 *   Multi-tenant real      → Donut of four isolated organizations + tiles
 *                             "0 consultas cruzadas" (lilac).
 *   Seguro desde el diseño → day × hour heat grid of webhook deliveries,
 *                             every one HMAC-verified, "0 incidentes"
 *                             (magenta).
 *   Fuentes reales (wide)  → the six providers that exist today in
 *                             apps/api/app/services/external_api/providers/
 *                             with weekly mini-bars, and six planned
 *                             integrations outlined in the muted token.
 *
 * Color: one hue per card — chip, icon disc, bars, slices and tiles wear
 * the card's hue at 100/70/45 % toward white (palette.mix), never toward
 * ink and never a blend of two hues. Type: standard classes only. Figures
 * are illustrative demo values (the section footnote says so); amounts
 * show on hover, the way every dashboard chart behaves.
 *
 * Entry motion (see .bee-trust in globals.css): the cards rise with the
 * stagger and the marks play once — donut arcs fill, funnel and bars grow,
 * the heat cells fade in — all driven by the same data-reveal state. The
 * server render is the finished chart.
 */

type Hue = string;

/** Three strengths of one hue, by how large a value is against the max. */
function strength(hue: Hue, value: number, max: number): string {
  return value >= max * 0.66 ? hue : value >= max * 0.33 ? mix(hue, 70) : mix(hue, 45);
}

/** Deterministic hash → [0, 1). Same input, same output on server and
 *  client — Math.random() would break hydration. */
function hash01(a: number, b: number): number {
  const h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  const m = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((m ^ (m >>> 16)) >>> 0) / 4294967295;
}

// ── Demo figures ────────────────────────────────────────────────────────────

/** Signals scored per source — the six providers that exist in the API. */
const SCORED_BY_SOURCE = [
  { id: "linkedin", value: 148 },
  { id: "googleSearch", value: 122 },
  { id: "g2", value: 96 },
  { id: "gdelt", value: 74 },
  { id: "hiring", value: 61 },
  { id: "website", value: 38 },
] as const;

const APPROVAL = { prepared: 42, approved: 35, sent: 35, rejected: 7 } as const;
/** Approved drafts per week, eight weeks — sums to APPROVAL.approved. */
const APPROVED_BY_WEEK = [3, 5, 4, 6, 4, 5, 3, 5];

const TENANTS = [
  { id: "orgA", value: 34 },
  { id: "orgB", value: 27 },
  { id: "orgC", value: 21 },
  { id: "orgD", value: 18 },
] as const;
const TENANT_STRENGTHS = [100, 72, 48, 28] as const;

/** Webhook deliveries by weekday × hour (Mon = 0). Business-hours shape
 *  with a deterministic jitter — 168 cells, none omitted. */
function hourProfile(h: number): number {
  if (h < 7) return 0.05;
  if (h < 9) return 0.35;
  if (h < 13) return 1;
  if (h < 15) return 0.7;
  if (h < 19) return 0.9;
  if (h < 22) return 0.3;
  return 0.08;
}
const DELIVERIES = Array.from({ length: 7 * 24 }, (_, i) => {
  const day = Math.floor(i / 24);
  const hour = i % 24;
  const dayWeight = day < 5 ? 1 : day === 5 ? 0.3 : 0.15;
  return { day, hour, count: Math.round(dayWeight * hourProfile(hour) * (8 + hash01(day + 3, hour + 11) * 14)) };
});
const DELIVERIES_TOTAL = DELIVERIES.reduce((s, c) => s + c.count, 0);
const DELIVERIES_MAX = Math.max(...DELIVERIES.map((c) => c.count), 1);
const REJECTED_SIGNATURES = 12;

/** Live providers (apps/api/app/services/external_api/providers/) with
 *  signals per week, eight weeks. Names are proper nouns, not translated;
 *  `kind` is the translated one-line role. */
const LIVE_SOURCES = [
  { id: "linkedin", name: "LinkedIn", weeks: [14, 18, 16, 21, 19, 24, 22, 26] },
  { id: "g2", name: "G2", weeks: [9, 11, 10, 14, 12, 13, 15, 17] },
  { id: "googleSearch", name: "Google Search", weeks: [12, 15, 13, 17, 16, 19, 18, 22] },
  { id: "gdelt", name: "GDELT", weeks: [7, 9, 8, 11, 10, 12, 11, 14] },
  { id: "hiring", name: "Greenhouse · Lever", weeks: [5, 7, 6, 9, 8, 10, 9, 12] },
  { id: "website", name: "Website", weeks: [4, 5, 5, 6, 6, 7, 7, 8] },
] as const;

/** Planned integrations — outlined, muted, "próximamente". The bars are a
 *  placeholder shape, never a figure. */
const PLANNED_SOURCES = [
  { id: "crunchbase", name: "Crunchbase", weeks: [3, 4, 4, 5, 5, 6, 6, 7] },
  { id: "apollo", name: "Apollo", weeks: [4, 4, 5, 5, 6, 6, 7, 7] },
  { id: "hubspot", name: "HubSpot", weeks: [2, 3, 3, 4, 5, 5, 6, 7] },
  { id: "salesforce", name: "Salesforce", weeks: [3, 3, 4, 4, 5, 6, 6, 7] },
  { id: "slack", name: "Slack", weeks: [5, 5, 5, 6, 6, 6, 7, 7] },
  { id: "gmail", name: "Gmail", weeks: [2, 3, 4, 4, 5, 6, 6, 7] },
] as const;

// ── Shared bits ─────────────────────────────────────────────────────────────

/** The hover pill every chart uses — dark ink, card-colored text. */
function Pill({ left, top, width, children }: { left: number; top: number; width: number; children: ReactNode }) {
  const shift = left / width > 0.8 ? "-translate-x-full" : left / width < 0.2 ? "translate-x-0" : "-translate-x-1/2";
  return (
    <div
      className={cn("pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-text)] px-2 py-1 text-xs font-medium text-[var(--color-card)]", shift)}
      style={{ left, top: Math.max(0, top) }}
    >
      {children}
    </div>
  );
}

function TrustCard({
  hue,
  icon: Icon,
  title,
  caption,
  wide = false,
  children,
}: {
  hue: Hue;
  icon: ComponentType<{ className?: string }>;
  title: string;
  caption: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("bee-bento bee-bento-pad flex flex-col gap-4", wide ? "md:col-span-2 lg:col-span-12" : "lg:col-span-6")}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: mix(hue, 20), color: hue }}>
          <Icon className="size-4 stroke-[1.75]" />
        </span>
        <div className="min-w-0">
          <h3 className="bee-card-title !mb-0">{title}</h3>
          <p className="bee-caption">{caption}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

// ── Card 4: heat grid (day × hour, the dashboard's activity heatmap shape) ──

const GAP = 3;
const LABEL_W = 32;
const HEADER_H = 18;
const HOUR_MARKS = [0, 6, 12, 18];

function HeatGrid({ hue, dayLabels, ariaLabel, format }: { hue: Hue; dayLabels: string[]; ariaLabel: string; format: (count: number) => string }) {
  const [ref, { width: boxW }] = useBoxSize<HTMLDivElement>({ width: 480, height: 160 });
  const [hover, setHover] = useState<number | null>(null);
  // Cells shrink to the box, text never does: 1 SVG unit = 1 px.
  const CELL = Math.max(6, Math.floor((boxW - LABEL_W - 23 * GAP) / 24));
  const STEP = CELL + GAP;
  const width = LABEL_W + 24 * STEP;
  const height = HEADER_H + 7 * STEP;
  const active = hover !== null ? DELIVERIES[hover] : null;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="bee-trust-heat block" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {HOUR_MARKS.map((h) => (
          <text key={h} x={LABEL_W + h * STEP + CELL / 2} y={HEADER_H - 6} textAnchor="middle" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {h}h
          </text>
        ))}
        {dayLabels.map((label, day) => (
          <text key={label} x={LABEL_W - 8} y={HEADER_H + day * STEP + CELL / 2 + 4} textAnchor="end" fill="var(--color-text-muted)" style={{ fontSize: "var(--bee-fs-body-2)" }}>
            {label}
          </text>
        ))}
        {DELIVERIES.map((cell, i) => (
          <rect
            key={i}
            x={LABEL_W + cell.hour * STEP}
            y={HEADER_H + cell.day * STEP}
            width={CELL}
            height={CELL}
            rx={Math.min(3, CELL / 4)}
            fill={hue}
            fillOpacity={cell.count === 0 ? 0.08 : 0.18 + 0.82 * (cell.count / DELIVERIES_MAX)}
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {active && (
        <Pill left={LABEL_W + active.hour * STEP + CELL / 2} top={HEADER_H + active.day * STEP - 32} width={width}>
          {dayLabels[active.day]} · {active.hour}:00–{active.hour}:59 · {format(active.count)}
        </Pill>
      )}
    </div>
  );
}

// ── Card 5: weekly mini-bars per source ─────────────────────────────────────

function MiniBars({ values, hue, dim = false, format }: { values: readonly number[]; hue: Hue; dim?: boolean; format: (week: number, value: number) => string }) {
  const [ref, { width: W, height: H }] = useBoxSize<HTMLDivElement>({ width: 140, height: 40 });
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  const n = values.length;
  const slot = W / n;
  const bw = Math.max(3, Math.round(slot * 0.62));
  return (
    <div ref={ref} className="relative h-10 w-full">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="bee-trust-bars absolute inset-0 block"
        aria-hidden
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - rect.left) / slot))));
        }}
      >
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * (H - 2));
          return (
            <rect
              key={i}
              x={i * slot + (slot - bw) / 2}
              y={H - h}
              width={bw}
              height={h}
              rx={2}
              fill={dim ? DATA.muted : strength(hue, v, max)}
              opacity={dim ? 0.3 : hover !== null && hover !== i ? 0.45 : 1}
            />
          );
        })}
      </svg>
      {hover !== null && !dim && (
        <Pill left={hover * slot + slot / 2} top={-30} width={W}>
          {format(hover + 1, values[hover])}
        </Pill>
      )}
    </div>
  );
}

function SourceTile({
  name,
  kind,
  weeks,
  hue,
  planned = false,
  soonLabel,
  format,
}: {
  name: string;
  kind: string;
  weeks: readonly number[];
  hue: Hue;
  planned?: boolean;
  soonLabel?: string;
  format: (week: number, value: number) => string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5", planned && "border-dashed")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-semibold", planned && "text-[var(--color-text-muted)]")}>{name}</p>
          <p className="bee-micro truncate">{kind}</p>
        </div>
        {planned ? (
          <span className="bee-micro shrink-0 rounded-full px-2 py-0.5" style={{ background: mix(DATA.muted, 12) }}>
            {soonLabel}
          </span>
        ) : (
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: hue }} aria-hidden />
        )}
      </div>
      <MiniBars values={weeks} hue={hue} dim={planned} format={format} />
    </div>
  );
}

// ── The section ─────────────────────────────────────────────────────────────

export function MarketingTrustCards() {
  const t = useTranslations("marketing.landing.guarantees");
  const tc = useTranslations("marketing.landing.trustCharts");
  const locale = useLocale() as Locale;
  const dayLabels = getDayLabels(locale);
  const nf = new Intl.NumberFormat(localeTags[locale]);
  const { ref, state } = useReveal<HTMLDivElement>({ threshold: 0.15, settleMs: 2000 });

  const coverageMax = Math.max(...SCORED_BY_SOURCE.map((s) => s.value));
  const weekLabel = (n: number) => tc("week", { n });

  return (
    <div ref={ref} data-reveal={state} className="bee-reveal bee-reveal--stagger bee-trust grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      {/* 1 · Cero alucinaciones — indigo */}
      <TrustCard hue={DATA.indigo} icon={ShieldCheck} title={t("noHallucinations.title")} caption={t("noHallucinations.description")}>
        <StageTiles
          tiles={[
            { label: tc("coverage.real"), value: "100 %", color: DATA.indigo },
            { label: tc("coverage.invented"), value: "0", color: mix(DATA.indigo, 70) },
            { label: tc("coverage.empty"), value: "27", color: mix(DATA.indigo, 45) },
          ]}
        />
        <div className="bee-trust-funnel flex min-h-0 flex-1 flex-col justify-center">
          <HorizontalFunnel
            rows={SCORED_BY_SOURCE.map((s) => ({ label: tc(`sources.kinds.${s.id}`), value: s.value, color: strength(DATA.indigo, s.value, coverageMax) }))}
            formatValue={(v) => nf.format(v)}
          />
        </div>
      </TrustCard>

      {/* 2 · Aprobación humana siempre — honey */}
      <TrustCard hue={DATA.honey} icon={UserCheck} title={t("humanApproval.title")} caption={t("humanApproval.description")}>
        <StageTiles
          tiles={[
            { label: tc("approval.prepared"), value: String(APPROVAL.prepared), color: DATA.honey },
            { label: tc("approval.approved"), value: String(APPROVAL.approved), color: mix(DATA.honey, 70) },
            { label: tc("approval.sent"), value: String(APPROVAL.sent), color: mix(DATA.honey, 70) },
            { label: tc("approval.rejected"), value: String(APPROVAL.rejected), color: mix(DATA.honey, 45) },
          ]}
        />
        <div className="bee-trust-bars flex min-h-[9rem] flex-1 flex-col">
          <BarsVsTarget
            points={APPROVED_BY_WEEK.map((value, i) => ({ label: weekLabel(i + 1), value, current: i === APPROVED_BY_WEEK.length - 1 }))}
            color={DATA.honey}
            minHeight={140}
            formatValue={(v) => `${nf.format(v)} ${tc("approval.unit")}`}
            colorFor={(p, _i, max) => strength(DATA.honey, p.value, max)}
          />
        </div>
      </TrustCard>

      {/* 3 · Multi-tenant real — lilac */}
      <TrustCard hue={DATA.violet} icon={Lock} title={t("multiTenant.title")} caption={t("multiTenant.description")}>
        <StageTiles
          tiles={[
            { label: tc("tenant.cross"), value: "0", color: DATA.violet },
            { label: tc("tenant.scoped"), value: "100 %", color: mix(DATA.violet, 70) },
            { label: tc("tenant.isolated"), value: String(TENANTS.length), color: mix(DATA.violet, 45) },
          ]}
        />
        <div className="bee-trust-donut flex min-h-[9rem] flex-1 flex-col justify-center">
          <Donut
            slices={TENANTS.map((org, i) => ({ label: tc(`tenant.${org.id}`), value: org.value, color: TENANT_STRENGTHS[i] === 100 ? DATA.violet : mix(DATA.violet, TENANT_STRENGTHS[i]) }))}
            centerLabel={tc("tenant.center", { n: TENANTS.length })}
          />
        </div>
      </TrustCard>

      {/* 4 · Seguro desde el diseño — magenta */}
      <TrustCard hue={DATA.magenta} icon={Radio} title={t("secureByDesign.title")} caption={t("secureByDesign.description")}>
        <StageTiles
          tiles={[
            { label: tc("security.signed"), value: "100 %", color: DATA.magenta },
            { label: tc("security.rejected"), value: String(REJECTED_SIGNATURES), color: mix(DATA.magenta, 70) },
            { label: tc("security.incidents"), value: "0", color: mix(DATA.magenta, 45) },
          ]}
        />
        <HeatGrid hue={DATA.magenta} dayLabels={dayLabels} ariaLabel={tc("security.aria")} format={(count) => tc("security.deliveries", { count })} />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
          <span>
            {tc("security.total")} <b className="font-semibold text-[var(--color-text)] tabular-nums">{nf.format(DELIVERIES_TOTAL)}</b>
          </span>
          <span className="flex items-center gap-2">
            {tc("security.less")}
            <span className="flex gap-1">
              {[0.1, 0.35, 0.6, 0.85, 1].map((o) => (
                <span key={o} className="size-2.5 rounded-sm" style={{ background: DATA.magenta, opacity: o }} />
              ))}
            </span>
            {tc("security.more")}
          </span>
        </div>
      </TrustCard>

      {/* 5 · Fuentes reales — indigo, full row */}
      <TrustCard hue={DATA.indigo} icon={Waypoints} title={t("sources.title")} caption={t("sources.description")} wide>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="bee-eyebrow flex items-center gap-2" style={{ color: DATA.indigo }}>
              <span className="size-1.5 rounded-full" style={{ background: DATA.indigo }} aria-hidden />
              {tc("sources.live", { count: LIVE_SOURCES.length })}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {LIVE_SOURCES.map((s) => (
                <SourceTile key={s.id} name={s.name} kind={tc(`sources.kinds.${s.id}`)} weeks={s.weeks} hue={DATA.indigo} format={(week, value) => `${weekLabel(week)} · ${nf.format(value)} ${tc("sources.unit")}`} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="bee-eyebrow flex items-center gap-2">
              <span className="size-1.5 rounded-full border border-dashed border-[var(--color-text-muted)]" aria-hidden />
              {tc("sources.planned", { count: PLANNED_SOURCES.length })}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {PLANNED_SOURCES.map((s) => (
                <SourceTile key={s.id} name={s.name} kind={tc(`sources.kinds.${s.id}`)} weeks={s.weeks} hue={DATA.indigo} planned soonLabel={tc("sources.soon")} format={() => ""} />
              ))}
            </div>
          </div>
        </div>
      </TrustCard>
    </div>
  );
}
