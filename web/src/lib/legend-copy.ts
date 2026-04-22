/**
 * All user-facing copy for legends (tooltips + help popovers).
 * Centralized here so wording stays consistent across surfaces.
 */

type StatusKey = "emerging" | "active" | "established" | "evolved" | "retired";
type ConfidenceKey = "emerging" | "active" | "established";

export const STATUS_LEGEND: Record<StatusKey, { title: string; description: string }> = {
  emerging: {
    title: "Status · Emerging",
    description: "Just forming — thesis is being shaped from a small number of data points.",
  },
  active: {
    title: "Status · Active",
    description: "Currently being worked — supported by evidence and open to revision.",
  },
  established: {
    title: "Status · Established",
    description: "Settled and mature — held with confidence across multiple sources.",
  },
  evolved: {
    title: "Status · Evolved",
    description: "Superseded by a newer version as the thesis shifted.",
  },
  retired: {
    title: "Status · Retired",
    description: "No longer held — kept for history but not part of the current view.",
  },
};

export const CONFIDENCE_LEGEND: Record<
  ConfidenceKey,
  { title: string; description: string }
> = {
  emerging: {
    title: "Confidence · Emerging",
    description: "Tentative — built on a small or narrow evidence base.",
  },
  active: {
    title: "Confidence · Active",
    description: "Growing support — evidence is mounting but still in motion.",
  },
  established: {
    title: "Confidence · Established",
    description: "Well-supported — stable across multiple independent sources.",
  },
};

export const CITATION_LEGEND = {
  support: {
    title: "Supporting evidence",
    description: "A data point that backs this stance.",
  },
  counter: {
    title: "Counter-evidence",
    description: "A data point that challenges or weakens this stance.",
  },
} as const;

/**
 * Popover content — a glossary shown when the user clicks the HelpCircle icon.
 * Each surface gets a tailored set of rows.
 */
export type LegendRow = {
  label: string;
  description: string;
  tone: "emerald" | "amber" | "brand" | "gray" | "warning" | "blue" | "red";
};

export const THEME_LEGEND_ROWS: LegendRow[] = [
  {
    label: "Emerging",
    description: "Thesis is forming from a small number of data points.",
    tone: "warning",
  },
  {
    label: "Active",
    description: "Currently being worked; supported but still in motion.",
    tone: "brand",
  },
  {
    label: "Established",
    description: "Settled and mature; held with confidence.",
    tone: "emerald",
  },
  {
    label: "Evolved",
    description: "Superseded by a newer version as the thesis shifted.",
    tone: "blue",
  },
  {
    label: "Retired",
    description: "No longer held; kept for history.",
    tone: "red",
  },
];

export const POSITION_LEGEND_ROWS: LegendRow[] = [
  ...THEME_LEGEND_ROWS,
  {
    label: "Confidence",
    description:
      "Separate from status — how certain the curator is in the stance (emerging · active · established).",
    tone: "brand",
  },
];

export const EVIDENCE_LEGEND_ROWS: LegendRow[] = [
  {
    label: "E#",
    description: "Supporting evidence — a data point that backs the stance.",
    tone: "emerald",
  },
  {
    label: "C#",
    description:
      "Counter-evidence — a data point that challenges or weakens the stance.",
    tone: "amber",
  },
];
