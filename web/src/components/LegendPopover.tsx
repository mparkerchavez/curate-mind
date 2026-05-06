import { HelpCircle } from "@untitledui/icons";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
} from "react-aria-components";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import type { LegendRow } from "@/lib/legend-copy";
import { cx } from "@/utils/cx";

const TONE_DOT: Record<LegendRow["tone"], string> = {
  emerald: "bg-success-solid",
  amber: "bg-warning-solid",
  purple: "bg-accent-purple-solid",
  gray: "bg-fg-quaternary",
  warning: "bg-warning-solid",
  blue: "bg-utility-blue-500",
  red: "bg-error-solid",
};

interface LegendPopoverProps {
  /** Heading shown at the top of the popover card. */
  heading: string;
  /** Rows to render. Each row is one definition. */
  rows: LegendRow[];
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Placement of the popover relative to the trigger. */
  placement?: "bottom start" | "bottom end" | "bottom" | "top start" | "top end" | "top";
}

/**
 * Small "?" help affordance that opens a popover with a short glossary.
 * Use on Theme, Position, and Evidence surfaces to explain status, confidence,
 * and citation labels without adding body copy.
 */
export function LegendPopover({
  heading,
  rows,
  ariaLabel = "What do these labels mean?",
  placement = "bottom start",
}: LegendPopoverProps) {
  return (
    <AriaDialogTrigger>
      <AriaButton
        aria-label={ariaLabel}
        className={({ isHovered, isFocusVisible }) =>
          cx(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-fg-quaternary outline-hidden transition duration-100 ease-linear",
            isHovered && "text-fg-quaternary_hover",
            isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring",
          )
        }
      >
        <HelpCircle className="size-4" aria-hidden="true" />
      </AriaButton>

      <Dropdown.Popover
        placement={placement}
        className="w-80 p-4"
      >
        <AriaDialog className="outline-hidden">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
            {heading}
          </p>
          <dl className="mt-3 space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="flex gap-3">
                <span
                  className={cx(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    TONE_DOT[row.tone],
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <dt className="text-sm font-semibold text-primary">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-sm leading-6 text-tertiary">
                    {row.description}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </AriaDialog>
      </Dropdown.Popover>
    </AriaDialogTrigger>
  );
}
