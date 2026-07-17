import { FAQS } from "./landing-content";

export default function FaqSection() {
  return (
    <section className="scroll-reveal py-24 px-6" style={{ background: "var(--bg-elevated)" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight"
            style={{ fontFamily: "'Space Mono', monospace" }}
          >
            Common{" "}
            <span style={{ color: "var(--accent)" }}>questions</span>
          </h2>
        </div>

        <div className="flex flex-col gap-4">
          {FAQS.map((faq) => (
            <div key={faq.q} className="feature-card rounded-xl p-6">
              <h3
                className="text-base font-bold mb-2 tracking-tight"
                style={{ fontFamily: "'Space Mono', monospace" }}
              >
                {faq.q}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {faq.a}
              </p>
              {faq.doc && (
                <a
                  href={faq.doc.href}
                  className="inline-flex items-center gap-1 mt-3 min-h-[36px] text-xs tracking-wide transition-colors hover:opacity-80"
                  style={{ fontFamily: "'Space Mono', monospace", color: "var(--accent)" }}
                >
                  {faq.doc.label}
                  <span aria-hidden="true">→</span>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
