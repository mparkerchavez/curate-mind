import { useEffect, type RefObject, type SyntheticEvent } from "react";
import { ArrowRight } from "@untitledui/icons";
import { cn } from "@/lib/cn";

/**
 * HeroAskInput — the prominent Ask composite in the home page hero.
 *
 * Owns the textarea styling, auto-resize (up to ~3 lines, then internal scroll),
 * and the submit button. State lives in the parent (LandingPage), which also
 * decides what happens on submit (kick off handleAskQuestion + navigate to /ask).
 *
 * The textarea ref is passed in from the parent so chip clicks can focus it.
 */

type HeroAskInputProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: RefObject<HTMLTextAreaElement>;
};

const MAX_HEIGHT_PX = 140; // ~3 lines at 20px line-height + padding

export function HeroAskInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  inputRef,
}: HeroAskInputProps) {
  const canSubmit = !disabled && value.trim().length > 0;

  // Auto-resize the textarea as content grows, capped at MAX_HEIGHT_PX.
  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT_PX) + "px";
  }, [value, inputRef]);

  function handleSubmit(e?: SyntheticEvent) {
    e?.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mx-auto w-full max-w-2xl"
      // Shared-element target for the View Transitions morph into
      // AskPage. Must match AskPage's form view-transition-name.
      style={{ viewTransitionName: "curate-ask-input" }}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits. Shift+Enter adds a newline (standard chat behavior).
          if (e.key === "Enter" && !e.shiftKey) {
            handleSubmit(e);
          }
        }}
        rows={2}
        disabled={disabled}
        placeholder={placeholder ?? "What's your question about AI strategy?"}
        className="block w-full resize-none overflow-y-auto rounded-2xl border border-secondary bg-primary px-5 py-4 pr-16 text-lg leading-8 text-primary shadow-[0_2px_4px_rgba(16,24,40,0.04)] outline-none transition placeholder:text-placeholder focus:border-brand focus:ring-2 focus:ring-brand disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label="Ask"
        className={cn(
          "absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full transition",
          canSubmit
            ? "bg-brand-solid text-primary_on-brand shadow-sm hover:bg-brand-solid_hover"
            : "bg-tertiary text-quaternary",
        )}
      >
        <ArrowRight className="size-5" />
      </button>
    </form>
  );
}
