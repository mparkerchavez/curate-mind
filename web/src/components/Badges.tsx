import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { CONFIDENCE_LEGEND, STATUS_LEGEND } from "@/lib/legend-copy";

type Status = "emerging" | "active" | "established" | "evolved" | "retired";
type Confidence = "emerging" | "active" | "established" | "strong" | "moderate" | "suggestive";

const STATUS_COLORS = {
  emerging: "warning",
  active: "brand",
  established: "success",
  evolved: "blue",
  retired: "error",
} as const;

const CONFIDENCE_COLORS = {
  strong: "success",
  moderate: "warning",
  suggestive: "gray",
} as const;

const EVIDENCE_COLORS: Record<string, "brand" | "gray" | "warning" | "success"> = {
  statistic: "brand",
  framework: "success",
  prediction: "warning",
  "case-study": "brand",
  observation: "gray",
  recommendation: "success",
};

function prettify(value: string) {
  return value.replace(/-/g, " ");
}

export function StatusBadge({
  status,
  withTooltip = true,
}: {
  status: Status;
  /** Set false when nested inside a `<button>` (e.g. clickable card) to avoid invalid HTML. */
  withTooltip?: boolean;
}) {
  const badge = (
    <BadgeWithDot type="pill-color" size="sm" color={STATUS_COLORS[status] ?? "gray"}>
      {prettify(status)}
    </BadgeWithDot>
  );

  const legend = STATUS_LEGEND[status];
  if (!withTooltip || !legend) return badge;

  return (
    <Tooltip title={legend.title} description={legend.description} placement="top">
      <TooltipTrigger className="cursor-default rounded-full">{badge}</TooltipTrigger>
    </Tooltip>
  );
}

export function ConfidenceBadge({
  confidence,
  withTooltip = true,
}: {
  confidence: Confidence | undefined;
  /** Set false when nested inside a `<button>` (e.g. clickable card) to avoid invalid HTML. */
  withTooltip?: boolean;
}) {
  if (!confidence) return null;

  const isSharedLabel =
    confidence === "emerging" ||
    confidence === "active" ||
    confidence === "established";

  const badge = isSharedLabel ? (
    <BadgeWithDot type="pill-color" size="sm" color={STATUS_COLORS[confidence]}>
      confidence {confidence}
    </BadgeWithDot>
  ) : (
    <BadgeWithDot type="pill-color" size="sm" color={CONFIDENCE_COLORS[confidence]}>
      {confidence}
    </BadgeWithDot>
  );

  const legend = isSharedLabel ? CONFIDENCE_LEGEND[confidence] : undefined;
  if (!withTooltip || !legend) return badge;

  return (
    <Tooltip title={legend.title} description={legend.description} placement="top">
      <TooltipTrigger className="cursor-default rounded-full">{badge}</TooltipTrigger>
    </Tooltip>
  );
}

export function EvidenceBadge({ type }: { type: string }) {
  return (
    <Badge type="color" size="sm" color={EVIDENCE_COLORS[type] ?? "gray"}>
      {prettify(type)}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  const labels: Record<number, string> = {
    1: "Tier 1",
    2: "Tier 2",
    3: "Tier 3",
  };

  return (
    <Badge type="color" size="sm" color="gray">
      {labels[tier] ?? `Tier ${tier}`}
    </Badge>
  );
}
