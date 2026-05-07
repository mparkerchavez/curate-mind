import { Link } from "react-router-dom";
import { GITHUB_URL } from "@/config/homepage";
import { cn } from "@/lib/cn";

type FooterLink =
  | {
      label: string;
      to: string;
      href?: never;
    }
  | {
      label: string;
      href: string;
      to?: never;
    };

type SiteFooterProps = {
  className?: string;
  links?: FooterLink[];
};

const DEFAULT_LINKS: FooterLink[] = [
  { label: "Home", to: "/" },
  { label: "Methodology", to: "/methodology" },
  { label: "GitHub", href: GITHUB_URL },
];

export function SiteFooter({ className, links = DEFAULT_LINKS }: SiteFooterProps) {
  return (
    <footer className={cn("border-t border-secondary bg-brand-section", className)}>
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-tertiary_on-section sm:flex-row sm:justify-between sm:text-left">
        <p>
          Curate Mind &middot; built by Maicol Parker-Chavez &middot;{" "}
          {new Date().getFullYear()}
        </p>
        <div className="flex items-center gap-5">
          {links.map((link) =>
            "to" in link ? (
              <Link
                key={link.label}
                to={link.to}
                className="transition hover:text-primary_on-section"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="transition hover:text-primary_on-section"
              >
                {link.label}
              </a>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
