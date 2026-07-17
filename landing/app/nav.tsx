import WaitlistForm from "./waitlist-form";
import { GitHubIcon } from "./icons";
import { GITHUB_URL, DOCS_HOME } from "./constants";
import { formatStars } from "./github";

function PingLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="glow-dot" />
        <div
          className="absolute inset-0 rounded-full animate-pulse-glow"
          style={{
            width: "18px",
            height: "18px",
            top: "-6px",
            left: "-6px",
            border: "1px solid var(--accent)",
            opacity: 0.3,
          }}
        />
      </div>
      <span
        className="text-lg font-bold tracking-tight"
        style={{ fontFamily: "'Space Mono', monospace", color: "var(--text)" }}
      >
        Ping<span style={{ color: "var(--accent)" }}>CRM</span>
      </span>
    </div>
  );
}

export function Nav({ stars }: { stars?: number | null }) {
  return (
    <nav
      className="fixed top-0 left-0 right-0 backdrop-blur-md"
      style={{ zIndex: "var(--z-nav)", background: "var(--nav-bg)", borderBottom: "1px solid var(--border)" }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <PingLogo />
        <div className="flex items-center gap-4 sm:gap-6">
          <a
            href={DOCS_HOME}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[44px] px-1 text-sm transition-colors duration-200 hover:!text-[var(--text)]"
            style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)", fontSize: "13px" }}
          >
            Docs
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={stars != null ? `Star PingCRM on GitHub — ${stars} stars` : "Star PingCRM on GitHub"}
            className="inline-flex items-center min-h-[44px] px-1 gap-2 text-sm transition-colors duration-200 hover:!text-[var(--text)]"
            style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)", fontSize: "13px" }}
          >
            <GitHubIcon size={16} />
            {stars != null ? formatStars(stars) : "Star"}
          </a>
          <a
            href={DOCS_HOME}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-[40px] px-4 rounded text-sm transition-all duration-200 hover:shadow-[0_0_16px_var(--accent-glow)]"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "13px",
              border: "1px solid var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="py-12 px-6" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <PingLogo />
          <div className="flex items-center gap-6">
            {[
              { label: "GitHub", href: GITHUB_URL, external: true },
              { label: "Docs", href: DOCS_HOME, external: true },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] px-1 text-xs transition-colors duration-200 hover:!text-[var(--text)]"
                style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)" }}
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="text-xs" style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)" }}>
            Built by{" "}
            <a
              href="https://sawinyh.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-200 hover:!text-[var(--text)]"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Sawinyh.com
            </a>
          </p>
        </div>
        <div className="mt-8 pt-6 flex flex-col sm:flex-row items-center justify-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-xs shrink-0" style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)" }}>
            Hosted version coming soon
          </span>
          <WaitlistForm compact />
        </div>
      </div>
    </footer>
  );
}
