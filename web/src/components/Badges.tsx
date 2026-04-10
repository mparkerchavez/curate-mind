import { Badge, BadgeWithDot } from "@/components/base/badges/badges";

type Status = "emerging" | "active" | "established" | "evolved" | "retired";
type Confidence = "emerging" | "active" | "established" | "strong" | "moderate" | "suggestive";

const STATUS_COLORS = {
  emerging: "warning",
  active: "brand",
  established: "success",
  evolved: "gray",
  retired: "gray",
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

export function StatusBadge({ status }: { status: Status }) {
  return (
    <BadgeWithDot type="pill-color" size="sm" color={STATUS_COLORS[status] ?? "gray"}>
      {prettify(status)}
    </BadgeWithDot>
  );
}

export function ConfidenceBadge({
  confidence,
}: {
  confidence: Confidence | undefined;
}) {
  if (!confidence) return null;

  if (
    confidence === "emerging" ||
    confidence === "active" ||
    confidence === "established"
  ) {
    return (
      <BadgeWithDot type="pill-color" size="sm" color={STATUS_COLORS[confidence]}>
        confidence {confidence}
      </BadgeWithDot>
    );
  }

  return (
    <BadgeWithDot type="pill-color" size="sm" color={CONFIDENCE_COLORS[confidence]}>
      {confidence}
    </BadgeWithDot>
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
