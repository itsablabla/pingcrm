const mono = "'Space Mono', monospace";

export function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
      style={{ background: color, color: "#fff", fontFamily: mono }}
    >
      {initials}
    </div>
  );
}

export function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div
      className="rounded-lg px-4 py-3 flex-1 min-w-0"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-1.5 opacity-60">{icon}</div>
      <div className="text-xl font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
        {value}
      </div>
      <div className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: mono }}>
        {label}
      </div>
    </div>
  );
}

/* Shared mini nav across the preview screens (decorative product mock). */
export function MiniNav({ activeScreen }: { activeScreen: number }) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
    >
      <div className="flex items-center gap-1.5">
        <div className="glow-dot" style={{ width: "5px", height: "5px" }} />
        <span className="text-xs font-bold" style={{ fontFamily: mono, color: "var(--accent)" }}>
          Ping
        </span>
      </div>
      <div className="flex gap-3">
        {["Dashboard", "Suggestions", "Contacts", "Orgs"].map((item, i) => {
          const isActive = (activeScreen === 0 && i === 0) || (activeScreen === 1 && i === 2) || (activeScreen === 2 && i === 1);
          return (
            <span
              key={item}
              className="text-[10px]"
              style={{
                fontFamily: mono,
                color: isActive ? "var(--accent)" : "var(--text-dim)",
                paddingBottom: isActive ? "1px" : undefined,
                borderBottom: isActive ? "1px solid var(--accent)" : undefined,
              }}
            >
              {item}
            </span>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          </svg>
          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
        </div>
        <span className="text-[10px]" style={{ fontFamily: mono, color: "var(--text-dim)" }}>
          Nick S.
        </span>
      </div>
    </div>
  );
}
