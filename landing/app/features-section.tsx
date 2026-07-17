import { FEATURES } from "./landing-content";

const PLATFORMS = ["Gmail", "Telegram", "Twitter/X", "LinkedIn"];

export default function FeaturesSection() {
  return (
    <section className="scroll-reveal py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            Six ways Ping keeps your{" "}
            <span style={{ color: "var(--accent)" }}>network alive</span>
          </h2>
        </div>

        {/* Asymmetric grid: the first feature is a 2×2 anchor, the rest backfill. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:grid-flow-dense">
          {FEATURES.map((feature, i) => {
            const featured = i === 0;
            return (
              <div
                key={feature.title}
                className={`feature-card rounded-xl p-6 flex flex-col ${
                  featured ? "lg:col-span-2 lg:row-span-2" : ""
                }`}
              >
                <div className={`opacity-80 ${featured ? "mb-5 [&_svg]:w-9 [&_svg]:h-9" : "mb-4"}`}>
                  {feature.icon}
                </div>
                <h3
                  className={`font-bold mb-2 tracking-tight ${featured ? "text-xl sm:text-2xl" : "text-base"}`}
                  style={{ fontFamily: "'Space Mono', monospace" }}
                >
                  {feature.title}
                </h3>
                <p
                  className={`leading-relaxed ${featured ? "text-base max-w-md" : "text-sm"}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {feature.description}
                </p>

                {featured && (
                  <div
                    className="mt-auto pt-8 flex flex-wrap gap-x-2 gap-y-1 text-xs"
                    style={{ fontFamily: "'Space Mono', monospace", color: "var(--text-muted)" }}
                  >
                    {PLATFORMS.map((p, idx) => (
                      <span key={p} className="inline-flex items-center gap-2">
                        <span style={{ color: "var(--text)" }}>{p}</span>
                        {idx < PLATFORMS.length - 1 && <span aria-hidden="true">·</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
