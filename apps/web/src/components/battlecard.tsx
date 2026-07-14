import {
  AlertCircle,
  Bot,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  Radio,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  signalTypeLabels,
  scoreVariant,
  timeAgo,
  urgencyColors,
  urgencyLabels,
} from "@/lib/format";
import type { Battlecard } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The CEO Battlecard — BEE's flagship output.
 *
 * Renders the full synthesized brief: company + lead context, the triggering
 * signal, and the three mandatory strategy fields (pain_point,
 * closing_argument, timing_window) plus the recommended play.
 *
 * Frontend-ready: no post-processing, one API call.
 */
export function BattlecardView({ card }: { card: Battlecard }) {
  const { strategy, company, lead, signal } = card;
  const urgency = strategy.timing_window.urgency;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={scoreVariant(card.score)}>{Math.round(card.score)}</Badge>
            {card.ready_to_action && (
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="size-3" />
                Ready to action
              </Badge>
            )}
            <Badge variant="outline">{signalTypeLabels[signal.signal_type as keyof typeof signalTypeLabels] ?? signal.signal_type}</Badge>
          </div>
          <h2 className="text-base font-semibold leading-snug">
            {card.title.replace(/^Opportunity:\s*/, "")}
          </h2>
          <p className="text-xs text-muted-foreground">
            Signal detected {timeAgo(signal.detected_at)} · via{" "}
            <span className="font-medium">{strategy.generator}</span>
          </p>
        </div>
      </div>

      {/* Context row: company + lead */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 className="size-3" />
              Company
            </div>
            <p className="font-semibold">{company.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{company.domain}</p>
            {company.industry && (
              <p className="text-xs text-muted-foreground">{company.industry}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <User className="size-3" />
              Lead
            </div>
            <p className="font-semibold">{lead.full_name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{lead.title}</p>
            <div className="mt-2 flex gap-2">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-muted-foreground hover:text-foreground"
                  title={lead.email}
                >
                  <Mail className="size-3.5" />
                </a>
              )}
              {lead.linkedin_url && (
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  title="LinkedIn"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pain point */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertCircle className="size-4 text-[var(--warning)]" />
            Pain point
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm leading-relaxed">{strategy.pain_point}</p>
        </CardContent>
      </Card>

      {/* Closing argument */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-primary" />
            Closing argument
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              via {strategy.channel}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <blockquote className="border-l-2 border-primary/60 pl-3 text-sm italic leading-relaxed">
            {strategy.closing_argument}
          </blockquote>
        </CardContent>
      </Card>

      {/* Timing window */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4" />
            Timing window
            <span className={cn("ml-auto text-xs font-medium", urgencyColors[urgency])}>
              {urgencyLabels[urgency]}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          <p className="text-sm leading-relaxed">{strategy.timing_window.reason}</p>
          {strategy.timing_window.expires_at && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Window closes: {strategy.timing_window.expires_at}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommended play */}
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          {strategy.next_best_action === "reach_out" ? (
            <Phone className="size-3" />
          ) : (
            <Radio className="size-3" />
          )}
          {String(strategy.next_best_action).replace(/_/g, " ")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {String(strategy.channel)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          {String(strategy.playbook).replace(/_/g, " ")}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bot className="size-3" />
          {strategy.generator} v{strategy.generator_version}
        </span>
      </div>
    </div>
  );
}
