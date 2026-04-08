type Status = "emerging" | "active" | "established" | "evolved" | "retired";
type Confidence = "emerging" | "active" | "established" | "strong" | "moderate" | "suggestive";

const STATUS_STYLES: Record<string, string> = {
  emerging: "border-sage/50 text-sage bg-sage/5",
  active: "border-ochre/60 text-ochreDeep bg-ochre/5",
  established: "border-ink/40 text-ink bg-ink/5",
  evolved: "border-slateInk/40 text-slateInk bg-slateInk/5",
  retired: "border-inkMute/40 text-inkMute bg-inkMute/5",
};

const CONF_DOTS: Record<string, string> = {
  strong: "bg-ochreDeep",
  moderate: "bg-ochre/70",
  suggestive: "bg-ochre/40",
};

export function StatusBadge({ status }: { status: Status }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.active;
  return (
    <span
      className={`label inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${cls}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function ConfidenceBadge({
  confidence,
}: {
  confidence: Confidence | undefined;
}) {
  if (!confidence) return null;
  // Position confidence values reuse the status vocabulary;
  // data-point confidence uses strong/moderate/suggestive.
  if (
    confidence === "emerging" ||
    confidence === "active" ||
    confidence === "established"
  ) {
    return (
      <span className="label inline-flex items-center gap-1.5 text-inkMute">
        <span className="h-1 w-1 rounded-full bg-inkMute" />
        confidence: {confidence}
      </span>
    );
  }
  return (
    <span className="label inline-flex items-center gap-1.5 text-inkMute">
      <span
        className={`h-1.5 w-1.5 rounded-full ${CONF_DOTS[confidence] ?? "bg-inkMute"}`}
      />
      {confidence}
    </span>
  );
}

const EVIDENCE_STYLES: Record<string, string> = {
  statistic: "border-ochre/60 text-ochreDeep",
  framework: "border-slateInk/40 text-slateInk",
  prediction: "border-sage/50 text-sage",
  "case-study": "border-ink/40 text-ink",
  observation: "border-inkMute/50 text-inkMute",
  recommendation: "border-ochreDeep/50 text-ochreDeep",
};

export function EvidenceBadge({ type }: { type: string }) {
  const cls = EVIDENCE_STYLES[type] ?? "border-inkMute/40 text-inkMute";
  return (
    <span
      className={`label inline-flex rounded-sm border px-2 py-0.5 ${cls}`}
    >
      {type}
    </span>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  const labels: Record<number, string> = {
    1: "Tier 1 · Primary",
    2: "Tier 2 · Practitioner",
    3: "Tier 3 · Commentary",
  };
  return (
    <span className="label text-inkMute">
      {labels[tier] ?? `Tier ${tier}`}
    </span>
  );
}
