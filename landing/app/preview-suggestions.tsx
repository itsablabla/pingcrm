import { Avatar } from "./preview-shared";

const mono = "'Space Mono', monospace";

export function SuggestionsScreen() {
  return (
    <div className="px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
              Suggestions
            </div>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: "var(--accent-glow)", color: "var(--accent)", fontFamily: mono }}
            >
              3 pending
            </span>
          </div>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)", fontFamily: mono }}>
            AI-suggested follow-ups for your network
          </p>
        </div>
        <div
          className="px-2 py-1 rounded text-[9px]"
          style={{ background: "var(--accent-glow)", border: "1px solid var(--accent-dim)", color: "var(--accent)", fontFamily: mono }}
        >
          Generate new
        </div>
      </div>

      {/* Expanded suggestion card with message editor */}
      <div
        className="rounded-lg p-3 mb-2"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-dim)" }}
      >
        {/* Card header */}
        <div className="flex items-center gap-2 mb-2">
          <Avatar initials="AR" color="#6366f1" />
          <span className="text-[11px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
            Alex Rivera
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--warm-glow)", color: "var(--warm)", fontFamily: mono }}
          >
            Warm (5)
          </span>
          <span className="text-[9px] ml-auto" style={{ color: "var(--text-dim)", fontFamily: mono }}>
            45 days ago
          </span>
        </div>

        {/* Trigger pill */}
        <div className="flex items-center gap-1 mb-2">
          <span
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontFamily: mono }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
            </svg>
            Job change detected
          </span>
        </div>

        {/* Divider */}
        <div className="mb-2" style={{ borderTop: "1px solid var(--border)" }} />

        {/* Channel selector */}
        <div className="flex gap-1.5 mb-2">
          {[
            { label: "Email", active: false, color: "#3b82f6" },
            { label: "Telegram", active: true, color: "#0ea5e9" },
            { label: "Twitter", active: false, color: "#64748b" },
          ].map((ch) => (
            <div
              key={ch.label}
              className="px-2 py-0.5 rounded text-[9px]"
              style={{
                fontFamily: mono,
                background: ch.active ? `${ch.color}20` : "transparent",
                border: `1px solid ${ch.active ? ch.color : "var(--border)"}`,
                color: ch.active ? ch.color : "var(--text-dim)",
              }}
            >
              {ch.label}
            </div>
          ))}
        </div>

        {/* Message textarea */}
        <div
          className="rounded-lg p-2.5 mb-2"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          <p className="text-[10px] leading-[1.6]" style={{ color: "var(--text)", fontFamily: mono }}>
            Hey Alex! Just saw you moved to Stripe — congrats on the new role! VP Engineering is a huge step. Would love to catch up and hear how the transition&apos;s going. Free for a quick call this week?
          </p>
          <div className="flex justify-end mt-1.5">
            <span className="text-[8px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
              186/4096
            </span>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {/* Snooze */}
            <div
              className="px-2 py-0.5 rounded text-[9px] flex items-center gap-1"
              style={{ border: "1px solid color-mix(in srgb, var(--warm) 30%, transparent)", color: "var(--warm)", fontFamily: mono }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Snooze
            </div>
            {/* Dismiss */}
            <div
              className="px-2 py-0.5 rounded text-[9px] flex items-center gap-1"
              style={{ border: "1px solid var(--border)", color: "var(--text-dim)", fontFamily: mono }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Dismiss
            </div>
            {/* Regenerate */}
            <div
              className="px-2 py-0.5 rounded text-[9px] flex items-center gap-1"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: mono }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Regenerate
            </div>
          </div>
          {/* Send */}
          <div
            className="px-3 py-1 rounded text-[9px] font-bold flex items-center gap-1"
            style={{
              background: "linear-gradient(135deg, var(--accent-dim), var(--accent))",
              color: "var(--bg)",
              fontFamily: mono,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </div>
        </div>
      </div>

      {/* Collapsed suggestion cards */}
      {[
        { initials: "SC", color: "#ec4899", name: "Sarah Chen", badge: "Strong (8)", badgeColor: "#10b981", trigger: "Replied to your tweet, no DM in 90d", days: "92 days ago", msg: "Hey Sarah! I noticed your reply about the API design patterns thread — great insights..." },
        { initials: "MJ", color: "#f97316", name: "Marcus Johnson", badge: "Warm (4)", badgeColor: "#f59e0b", trigger: "Fundraising signal detected", days: "60 days ago", msg: "Marcus, congrats on the seed round! Saw the announcement and wanted to reach out..." },
      ].map((s) => (
        <div
          key={s.initials}
          className="rounded-lg p-2.5 mb-2"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Avatar initials={s.initials} color={s.color} />
            <span className="text-[11px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>{s.name}</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: `${s.badgeColor}20`, color: s.badgeColor, fontFamily: mono }}
            >
              {s.badge}
            </span>
            <span className="text-[9px] ml-auto" style={{ color: "var(--text-dim)", fontFamily: mono }}>{s.days}</span>
          </div>
          <p className="text-[9px] truncate" style={{ color: "var(--text-dim)", fontFamily: mono }}>{s.msg}</p>
        </div>
      ))}
    </div>
  );
}
