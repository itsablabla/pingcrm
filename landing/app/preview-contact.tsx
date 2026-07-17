const mono = "'Space Mono', monospace";

export function ContactScreen() {
  return (
    <div className="px-4 py-3">
      {/* Contact header */}
      <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontFamily: mono }}
        >
          NR
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
              Nic RH
            </span>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontFamily: mono }}
            >
              Cold
            </span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
            Founder, CEO // X: @nic_builds
          </div>
        </div>
        <div className="flex gap-1">
          {["🔥", "⚡", "🔗"].map((icon, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded flex items-center justify-center text-[10px]"
              style={{ border: "1px solid var(--border)", background: i === 1 ? "var(--accent-glow)" : "var(--bg-surface)" }}
              aria-hidden="true"
            >
              {icon}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        {/* Left: Contact Details */}
        <div className="w-[160px] shrink-0">
          <span className="text-[10px] font-bold block mb-2" style={{ fontFamily: mono, color: "var(--text)" }}>
            Contact Details
          </span>
          {[
            { label: "Company", value: "Concrete", accent: true },
            { label: "Telegram", value: "nic_rh", accent: true },
            { label: "Twitter", value: "nic_builds", accent: true },
            { label: "Email", value: "—", accent: false },
            { label: "LinkedIn", value: "—", accent: false },
          ].map((field) => (
            <div key={field.label} className="flex justify-between py-1" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-[9px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>{field.label}</span>
              <span
                className="text-[9px]"
                style={{ color: field.accent ? "var(--accent)" : "var(--text-dim)", fontFamily: mono }}
              >
                {field.value}
              </span>
            </div>
          ))}
        </div>

        {/* Right: Timeline */}
        <div className="flex-1 min-w-0">
          {/* Message composer hint */}
          <div
            className="rounded-lg px-3 py-2 mb-2 flex items-center gap-2"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
              Write a message...
            </span>
          </div>

          {/* Timeline messages */}
          <div className="space-y-2">
            <div className="text-center">
              <span className="text-[8px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>TODAY</span>
            </div>

            {/* Outbound message */}
            <div className="flex justify-end">
              <div className="max-w-[85%]">
                <div
                  className="rounded-lg px-3 py-2 text-[10px] leading-relaxed"
                  style={{
                    background: "linear-gradient(135deg, var(--accent-dim), var(--accent))",
                    color: "var(--bg)",
                    fontFamily: mono,
                  }}
                >
                  Hey Nic! Saw Concrete just crossed $1B TVL — that&apos;s incredible growth. How&apos;s everything going?
                </div>
                <div className="flex justify-end items-center gap-1 mt-0.5">
                  <span className="text-[8px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
                    4:33 PM · Telegram
                  </span>
                  <span className="text-[8px]" style={{ color: "var(--accent)", fontFamily: mono }}>You</span>
                </div>
              </div>
            </div>

            <div className="text-center">
              <span className="text-[8px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>SEP 22, 2025</span>
            </div>

            {/* Older outbound */}
            <div className="flex justify-end">
              <div className="max-w-[85%]">
                <div
                  className="rounded-lg px-3 py-2 text-[10px] leading-relaxed"
                  style={{
                    background: "linear-gradient(135deg, var(--accent-dim), var(--accent))",
                    color: "var(--bg)",
                    fontFamily: mono,
                  }}
                >
                  Are you going to Token2049 in Singapore? Would be awesome to catch up in person if you&apos;re around.
                </div>
                <div className="flex justify-end items-center gap-1 mt-0.5">
                  <span className="text-[8px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
                    9:39 AM · Telegram
                  </span>
                  <span className="text-[8px]" style={{ color: "var(--accent)", fontFamily: mono }}>You</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
