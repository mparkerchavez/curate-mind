/**
 * ExamplePromptChips — a row of clickable pill buttons under the hero Ask input.
 *
 * Clicking a chip fills the Ask input with the chip's text and focuses it;
 * the parent (LandingPage) is responsible for wiring up the focus behavior.
 * Chips do NOT auto-submit. The visitor can review or edit before asking.
 */

type ExamplePromptChipsProps = {
  prompts: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
};

export function ExamplePromptChips({ prompts, onSelect, disabled }: ExamplePromptChipsProps) {
  if (prompts.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
        Try one:
      </span>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          disabled={disabled}
          className="rounded-full border border-secondary bg-primary px-3.5 py-1.5 text-sm text-secondary transition hover:border-brand hover:bg-brand-primary disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
