/**
 * Shared DOM helpers for linking inline claims to right-panel evidence cards.
 *
 * The Ask page and Position page both render inline claim spans with data-dp-id,
 * while SourceEvidenceGroup renders right-panel cards with evidence-card-{id}.
 * Keeping selectors and scroll behavior here makes the two experiences easier
 * to debug together.
 */

export const CLAIM_ANCHOR_ATTR = "data-dp-id";
export const EVIDENCE_CARD_ID_PREFIX = "evidence-card";

function escapeSelectorValue(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

export function getClaimAnchorSelector(dataPointId: string): string {
  return `[${CLAIM_ANCHOR_ATTR}="${escapeSelectorValue(dataPointId)}"]`;
}

export function getEvidenceCardId(dataPointId: string): string {
  return `${EVIDENCE_CARD_ID_PREFIX}-${dataPointId}`;
}

export function scrollClaimAnchorIntoView(
  dataPointId: string,
  root: ParentNode | null | undefined = document,
  options: ScrollIntoViewOptions = { behavior: "smooth", block: "center" },
): boolean {
  const element = root?.querySelector<HTMLElement>(getClaimAnchorSelector(dataPointId));
  if (!element) return false;
  element.scrollIntoView(options);
  return true;
}

export function scrollEvidenceCardIntoView(
  dataPointId: string,
  options: ScrollIntoViewOptions = { behavior: "smooth", block: "center" },
): boolean {
  const element = document.getElementById(getEvidenceCardId(dataPointId));
  if (!element) return false;
  element.scrollIntoView(options);
  return true;
}
