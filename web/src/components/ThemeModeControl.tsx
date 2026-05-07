import { Monitor01, Moon01, Sun } from "@untitledui/icons";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { useThemeMode, type ThemeMode } from "@/contexts/ThemeModeContext";
import { cn } from "@/lib/cn";

const THEME_OPTIONS = [
  {
    value: "system",
    label: "System",
    description: "Follow your device setting",
    icon: Monitor01,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the dark research workspace",
    icon: Moon01,
  },
  {
    value: "light",
    label: "Light",
    description: "Use the light research workspace",
    icon: Sun,
  },
] satisfies Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Monitor01;
}>;

export function ThemeModeControl() {
  const { mode, setMode } = useThemeMode();

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-secondary bg-secondary p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = mode === option.value;

        return (
          <Tooltip
            key={option.value}
            title={option.label}
            description={option.description}
            placement="bottom"
          >
            <TooltipTrigger
              aria-label={`Use ${option.label.toLowerCase()} theme`}
              aria-pressed={isSelected}
              onPress={() => setMode(option.value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-quaternary outline-focus-ring transition hover:bg-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2",
                isSelected &&
                  "bg-brand-solid text-primary_on-brand shadow-xs-skeuomorphic hover:bg-brand-solid hover:text-primary_on-brand",
              )}
            >
              <Icon className="size-4" />
            </TooltipTrigger>
          </Tooltip>
        );
      })}
    </div>
  );
}
