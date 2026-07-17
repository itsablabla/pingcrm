import WaitlistForm from "./waitlist-form";
import DashboardPreview from "./dashboard-preview";
import { Nav, Footer } from "./nav";
import ScrollRevealInit from "./scroll-reveal-init";
import FeaturesSection from "./features-section";
import FaqSection from "./faq-section";
import { GitHubIcon, StarIcon } from "./icons";
import { STEPS } from "./landing-content";
import { GITHUB_URL, DOCS_HOME } from "./constants";
import { getStarCount, formatStars } from "./github";

export default async function LandingPage() {
  const stars = await getStarCount();

  return (
    <div className="relative overflow-hidden">
      <ScrollRevealInit />
      <Nav stars={stars} />

      {/* ──── Hero ──── */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 grid-bg grid-bg-fade opacity-40" />
        <div
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(ellipse, var(--accent-glow) 0%, transparent 70%)" }}
        />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="animate-fade-up delay-1 inline-flex items-center gap-2 px-3 py-1 rounded-full mb-8"
            style={{ border: "1px solid var(--border-bright)", background: "var(--bg-elevated)" }}>
            <div className="glow-dot" style={{ width: "4px", height: "4px" }} />
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "12px", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
              OPEN SOURCE &middot; SELF-HOSTABLE
            </span>
          </div>

          <h1
            className="animate-fade-up delay-2 text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            Your network is{" "}
            <span className="relative inline-block" style={{ color: "var(--accent)" }}>
              decaying
            </span>
            <br />
            <span className="text-4xl sm:text-5xl md:text-6xl" style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              Ping fixes that.
            </span>
          </h1>

          <p
            className="animate-fade-up delay-3 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ color: "var(--text-muted)", fontFamily: "'Newsreader', Georgia, serif" }}
          >
            Ping watches your relationships across Gmail, Telegram, Twitter, and LinkedIn — tells you{" "}
            <em style={{ color: "var(--text)", fontStyle: "italic" }}>who&apos;s slipping away</em>, and{" "}
            <em style={{ color: "var(--text)", fontStyle: "italic" }}>writes the message</em> to bring them back.
          </p>

          <div className="animate-fade-up delay-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-bold tracking-wide transition-all duration-200 hover:shadow-[0_0_24px_var(--accent-glow-strong)] hover:-translate-y-0.5"
              style={{
                fontFamily: "'Space Mono', monospace",
                background: "linear-gradient(135deg, var(--accent-dim), var(--accent))",
                color: "var(--bg)",
                fontSize: "14px",
              }}
            >
              <GitHubIcon size={18} />
              Self-Host Now
            </a>
            <a
              href={DOCS_HOME}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm tracking-wide transition-all duration-200 hover:border-[var(--border-bright)] hover:-translate-y-0.5"
              style={{
                fontFamily: "'Space Mono', monospace",
                border: "1px solid var(--border-bright)",
                background: "var(--bg-elevated)",
                color: "var(--text)",
                fontSize: "14px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
              Setup Guide
            </a>
          </div>

          {/* Dashboard preview */}
          <div className="animate-fade-up delay-5 mt-16 max-w-2xl mx-auto">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <div className="glow-line mx-auto max-w-4xl" />

      <FeaturesSection />

      {/* ──── How It Works ──── */}
      <section className="scroll-reveal py-24 px-6" style={{ background: "var(--bg-elevated)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-3xl sm:text-4xl font-bold tracking-tight"
              style={{ fontFamily: "'Space Mono', monospace" }}
            >
              Three steps to{" "}
              <span style={{ color: "var(--accent)" }}>effortless follow-up</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative text-center">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-5"
                  style={{
                    border: "1px solid var(--accent-dim)",
                    background: "var(--accent-glow)",
                    fontFamily: "'Space Mono', monospace",
                    fontSize: "14px",
                    color: "var(--accent)",
                    fontWeight: 700,
                  }}
                >
                  {step.number}
                </div>

                {i < STEPS.length - 1 && (
                  <div
                    className="hidden md:block absolute top-6 left-[60%] w-[80%] h-px"
                    style={{
                      background: "linear-gradient(90deg, var(--accent-dim), transparent)",
                      opacity: 0.3,
                    }}
                  />
                )}

                <h3
                  className="text-xl font-bold mb-2 tracking-tight"
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {step.label}
                </h3>
                <p className="text-sm leading-relaxed mb-5 max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>
                  {step.description}
                </p>
                <div>{step.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──── Open Source ──── */}
      <section className="scroll-reveal py-24 px-6 relative">
        <div className="absolute inset-0 grid-bg grid-bg-fade opacity-20" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex mb-6">
            <GitHubIcon size={48} />
          </div>
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            Open source.{" "}
            <span style={{ color: "var(--accent)" }}>Your data, your server.</span>
          </h2>
          <p className="text-lg leading-relaxed mb-3 max-w-xl mx-auto" style={{ color: "var(--text-muted)" }}>
            PingCRM is fully open source. Self-host on your own infrastructure, audit every line of code, and own your relationship data completely.
            No vendor lock-in, no data harvesting.
          </p>
          <p className="text-sm mb-8" style={{ color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>
            Deploy in under 10 minutes with Docker Compose.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {["Python", "FastAPI", "Next.js", "PostgreSQL", "Redis", "Claude AI"].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 rounded text-xs"
                style={{
                  fontFamily: "'Space Mono', monospace",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {tech}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm font-bold tracking-wide transition-all duration-200 hover:border-[var(--text-muted)] hover:-translate-y-0.5"
              style={{
                fontFamily: "'Space Mono', monospace",
                border: "1px solid var(--border-bright)",
                background: "var(--bg-elevated)",
                color: "var(--text)",
                fontSize: "14px",
              }}
            >
              <GitHubIcon size={18} />
              Star on GitHub
              {stars != null && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                  style={{ background: "var(--accent-glow)", color: "var(--accent)", fontSize: "12px" }}
                >
                  <StarIcon size={11} />
                  {formatStars(stars)}
                </span>
              )}
            </a>
            <a
              href={DOCS_HOME}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg text-sm tracking-wide transition-all duration-200 hover:border-[var(--text-muted)] hover:-translate-y-0.5"
              style={{
                fontFamily: "'Space Mono', monospace",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontSize: "14px",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
              </svg>
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      <FaqSection />

      {/* ──── Hosted Waitlist Banner ──── */}
      <div className="py-6 px-6" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4">
          <p className="text-sm shrink-0" style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)" }}>
            Prefer not to self-host? We&apos;re building a managed version.
          </p>
          <WaitlistForm compact />
        </div>
      </div>

      <Footer />
    </div>
  );
}
