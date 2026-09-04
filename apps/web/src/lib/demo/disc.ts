/** JS port of app.services.psychographic.classifier.classify_from_title —
 *  same rule-based DISC heuristic (title regex patterns + industry
 *  modifiers, additive deltas off a 0.25 base, clamped to [0,1]) so the
 *  sandbox's DISC panel demonstrates the real algorithm instead of an
 *  empty state or a fabricated score with no relationship to the lead's
 *  actual title. Deterministic — same lead always gets the same profile
 *  across reloads, never re-rolled. See that Python module's docstring for
 *  the full rationale; keep this in sync if the backend table changes. */

import type { DISCStyle } from "@/types/extended";

interface TitleRule {
  pattern: RegExp;
  d: number;
  i: number;
  s: number;
  c: number;
}

// D — Dominance: C-suite, Sales, Business Development, Founder
// I — Influence: Marketing, Brand, Communications, Partnerships, PR
// S — Steadiness: HR, People, Customer Success, Support, Operations
// C — Conscientiousness: Engineering, Finance, Legal, Data, Research
const TITLE_RULES: TitleRule[] = [
  { pattern: /ceo|founder|co-founder|chief executive|president|owner/, d: 0.5, i: 0.05, s: -0.1, c: -0.1 },
  { pattern: /vp sales|head of sales|chief sales|svp sales|evp sales/, d: 0.45, i: 0.1, s: -0.1, c: -0.1 },
  { pattern: /vp|vice president|svp|evp/, d: 0.3, i: 0.05, s: -0.05, c: -0.05 },
  { pattern: /director of sales|sales director|business development director/, d: 0.4, i: 0.1, s: -0.1, c: -0.1 },
  { pattern: /coo|chief operating|operations director|vp operations/, d: 0.35, i: 0.0, s: 0.1, c: -0.05 },
  { pattern: /cfo|chief financial|finance director|vp finance/, d: 0.2, i: -0.05, s: 0.05, c: 0.3 },

  { pattern: /cmo|chief marketing|vp marketing|head of marketing/, d: 0.0, i: 0.45, s: 0.05, c: -0.05 },
  { pattern: /marketing manager|brand manager|content|social media|communications/, d: -0.05, i: 0.4, s: 0.1, c: -0.05 },
  { pattern: /partnership|alliances|ecosystem|community|evangelist/, d: -0.05, i: 0.4, s: 0.1, c: -0.05 },
  { pattern: /sales enablement|account executive|account manager|business development manager/, d: 0.1, i: 0.35, s: 0.05, c: -0.05 },

  { pattern: /hr|human resources|people ops|talent|recruiting|recruiter/, d: -0.1, i: 0.1, s: 0.45, c: -0.05 },
  { pattern: /customer success|customer experience|client success|account management/, d: -0.1, i: 0.15, s: 0.4, c: -0.05 },
  { pattern: /support|helpdesk|service desk|customer service/, d: -0.1, i: 0.05, s: 0.45, c: 0.0 },
  { pattern: /project manager|program manager|delivery manager|implementation/, d: -0.05, i: 0.05, s: 0.35, c: 0.1 },
  { pattern: /operations manager|office manager|admin|coordinator/, d: -0.05, i: 0.0, s: 0.4, c: 0.1 },

  { pattern: /cto|chief technology|vp engineering|head of engineering/, d: 0.1, i: -0.05, s: -0.05, c: 0.45 },
  { pattern: /engineer|developer|architect|programmer|software/, d: -0.1, i: -0.05, s: 0.0, c: 0.45 },
  { pattern: /data scientist|data analyst|data engineer|ml engineer|ai/, d: -0.1, i: -0.05, s: 0.05, c: 0.5 },
  { pattern: /finance|financial|accountant|controller|treasurer|auditor/, d: -0.1, i: -0.1, s: 0.1, c: 0.5 },
  { pattern: /legal|counsel|compliance|risk|security|ciso/, d: -0.05, i: -0.1, s: 0.15, c: 0.45 },
  { pattern: /research|scientist|analyst|strategy|intelligence/, d: -0.05, i: 0.0, s: 0.05, c: 0.45 },
  { pattern: /product manager|product owner/, d: 0.05, i: 0.1, s: 0.1, c: 0.3 },
];

const INDUSTRY_MODIFIERS: Record<string, [number, number, number, number]> = {
  finance: [0.05, -0.05, 0.05, 0.1],
  healthcare: [-0.05, 0.05, 0.15, 0.05],
  technology: [0.05, 0.05, -0.05, 0.1],
  startup: [0.15, 0.1, -0.1, -0.05],
  enterprise: [0.0, 0.0, 0.1, 0.05],
  government: [-0.1, -0.05, 0.2, 0.1],
  education: [-0.1, 0.1, 0.2, 0.0],
  marketing: [0.0, 0.2, 0.0, 0.0],
  legal: [-0.05, -0.05, 0.1, 0.2],
  manufacturing: [0.05, 0.0, 0.15, 0.05],
  retail: [0.05, 0.1, 0.05, 0.0],
};

const BASE_SCORE = 0.25;

export const STYLE_PREFERENCES: Record<
  Exclude<DISCStyle, "UNKNOWN">,
  { tone: string; length: string; avoid: string[] }
> = {
  D: {
    tone: "direct",
    length: "short",
    avoid: ["as per", "just wanted to", "hope you're doing well", "circle back", "synergy"],
  },
  I: {
    tone: "enthusiastic",
    length: "medium",
    avoid: ["detailed data dump", "extensive analysis", "according to the report"],
  },
  S: {
    tone: "warm",
    length: "medium",
    avoid: ["urgent", "immediately", "disrupt", "aggressive growth"],
  },
  C: {
    tone: "analytical",
    length: "long",
    avoid: ["trust me", "everyone knows", "best in class", "industry-leading"],
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Same algorithm as classify_from_title — see this module's docstring. */
export function classifyFromTitle(
  title: string | null,
  industry: string | null,
): {
  d: number;
  i: number;
  s: number;
  c: number;
  dominant: Exclude<DISCStyle, "UNKNOWN">;
  secondary: Exclude<DISCStyle, "UNKNOWN"> | null;
  confidence: number;
  matchedRules: number;
} {
  const titleLower = (title ?? "").toLowerCase().trim();
  let d = BASE_SCORE;
  let i = BASE_SCORE;
  let s = BASE_SCORE;
  let c = BASE_SCORE;
  let matchedRules = 0;

  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(titleLower)) {
      d += rule.d;
      i += rule.i;
      s += rule.s;
      c += rule.c;
      matchedRules += 1;
    }
  }

  if (industry) {
    const mod = INDUSTRY_MODIFIERS[industry.toLowerCase().trim()];
    if (mod) {
      d += mod[0];
      i += mod[1];
      s += mod[2];
      c += mod[3];
    }
  }

  d = clamp01(d);
  i = clamp01(i);
  s = clamp01(s);
  c = clamp01(c);

  const unsorted: [Exclude<DISCStyle, "UNKNOWN">, number][] = [
    ["D", d],
    ["I", i],
    ["S", s],
    ["C", c],
  ];
  const scores = unsorted.sort((a, b) => b[1] - a[1]);

  const dominant = scores[0][0];
  const secondary = scores[1][1] > 0.35 ? scores[1][0] : null;
  const maxScore = scores[0][1];
  const secondScore = scores[1][1];
  const confidence = Math.max(0.1, Math.min(0.99, (maxScore - secondScore) / Math.max(maxScore, 0.01)));

  return { d, i, s, c, dominant, secondary, confidence: Math.round(confidence * 100) / 100, matchedRules };
}

/** Full LeadPsychographic shape for a demo lead — deterministic, computed
 *  on read (no persistence needed, same as everything else in the demo
 *  store that's cheap to recompute). */
export function demoClassifyLead(
  leadId: string,
  title: string | null,
  industry: string | null,
): {
  id: string;
  lead_id: string;
  d_score: number;
  i_score: number;
  s_score: number;
  c_score: number;
  dominant_style: DISCStyle;
  secondary_style: DISCStyle | null;
  confidence: number;
  preferred_tone: string;
  preferred_message_length: string;
  avoid_phrases: string[];
  classification_source: string;
  classification_notes: string;
  classified_at: string;
  created_at: string;
} {
  const result = classifyFromTitle(title, industry);
  const prefs = STYLE_PREFERENCES[result.dominant];
  const now = new Date().toISOString();
  return {
    id: `demo-disc-${leadId}`,
    lead_id: leadId,
    d_score: result.d,
    i_score: result.i,
    s_score: result.s,
    c_score: result.c,
    dominant_style: result.dominant,
    secondary_style: result.secondary,
    confidence: result.confidence,
    preferred_tone: prefs.tone,
    preferred_message_length: prefs.length,
    avoid_phrases: prefs.avoid,
    classification_source: "title_heuristic",
    classification_notes: `Matched ${result.matchedRules} title rule(s). Industry: ${industry ?? "none"}.`,
    classified_at: now,
    created_at: now,
  };
}
