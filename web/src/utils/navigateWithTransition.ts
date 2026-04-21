import { flushSync } from "react-dom";

/**
 * navigateWithTransition — run a DOM-changing callback (typically a
 * React Router navigate() call) inside the browser's View Transitions
 * API when supported, so shared elements can morph smoothly between
 * the old and new pages.
 *
 * Two pieces to make this work with React:
 *
 *   1. document.startViewTransition(cb) captures a "before" snapshot,
 *      runs cb, captures an "after" snapshot, then animates. If cb
 *      queues React state updates without forcing a flush, React's
 *      async batching means the "after" snapshot can be taken before
 *      the DOM actually updates, producing a broken transition.
 *
 *   2. flushSync(cb) forces React to process any state updates made
 *      inside cb synchronously, so the DOM is current by the time the
 *      browser takes its "after" snapshot.
 *
 * Feature-detects startViewTransition. In browsers without it (older
 * Safari, Firefox at time of writing), this falls back to calling the
 * callback directly — the navigation still works, just without the
 * morph animation.
 */

type Callback = () => void;

export function navigateWithTransition(callback: Callback): void {
  if (
    typeof document !== "undefined" &&
    typeof (document as Document & { startViewTransition?: unknown })
      .startViewTransition === "function"
  ) {
    (
      document as Document & {
        startViewTransition: (cb: () => void) => unknown;
      }
    ).startViewTransition(() => {
      flushSync(callback);
    });
    return;
  }
  callback();
}
