import { useEffect, type RefObject } from "react";
import {
  scrollClaimAnchorIntoView,
  scrollEvidenceCardIntoView,
} from "@/lib/linked-evidence";

type ClaimScrollOptions = {
  highlightedEvidenceId: string | null;
  enabled?: boolean;
  triggerKey?: number;
  rootRef?: RefObject<ParentNode>;
  rootSelector?: string;
};

type EvidenceScrollOptions = {
  highlightedEvidenceId: string | null;
  enabled?: boolean;
  triggerKey?: number;
};

export function useScrollHighlightedClaim({
  highlightedEvidenceId,
  enabled = true,
  triggerKey,
  rootRef,
  rootSelector,
}: ClaimScrollOptions) {
  useEffect(() => {
    if (!enabled || !highlightedEvidenceId) return;

    const root =
      rootRef?.current ??
      (rootSelector ? document.querySelector(rootSelector) : document);

    scrollClaimAnchorIntoView(highlightedEvidenceId, root);
  }, [enabled, highlightedEvidenceId, rootRef, rootSelector, triggerKey]);
}

export function useScrollHighlightedEvidence({
  highlightedEvidenceId,
  enabled = true,
  triggerKey,
}: EvidenceScrollOptions) {
  useEffect(() => {
    if (!enabled || !highlightedEvidenceId) return;

    // Wait one frame so the newly highlighted card has rendered before scroll.
    const frame = requestAnimationFrame(() => {
      scrollEvidenceCardIntoView(highlightedEvidenceId);
    });

    return () => cancelAnimationFrame(frame);
  }, [enabled, highlightedEvidenceId, triggerKey]);
}
