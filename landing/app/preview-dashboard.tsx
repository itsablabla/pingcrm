import { Avatar, StatCard } from "./preview-shared";

const mono = "'Space Mono', monospace";

export function DashboardScreen() {
  return (
    <div className="px-4 py-3">
      <div className="mb-3">
        <div className="text-sm font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
          Dashboard
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)", fontFamily: mono }}>
          You have <span style={{ color: "var(--accent)" }}>1 pending suggestion</span> and{" "}
          <span style={{ color: "var(--text)" }}>5 contacts</span> need attention.
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        <StatCard
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          value="4,967"
          label="Total contacts"
        />
        <StatCard
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
          value="360"
          label="Active relationships"
        />
        <StatCard
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
          value="722"
          label="Interactions this week"
        />
      </div>

      <div className="flex gap-2">
        {/* Left: Pending Follow-ups + Recent Activity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>
              Pending Follow-ups
            </span>
            <span className="text-[9px]" style={{ fontFamily: mono, color: "var(--accent)" }}>
              View all →
            </span>
          </div>

          <div className="rounded-lg p-2.5 mb-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <Avatar initials="S" color="#2563eb" />
              <span className="text-[11px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>Sehaj</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontFamily: mono }}>
                Cold (0)
              </span>
              <span className="text-[9px] ml-auto" style={{ color: "var(--text-dim)", fontFamily: mono }}>90+ days</span>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: mono }}>
              Hey Sehaj, hope you&apos;ve been well! Just realized it&apos;s been way too long since we connected...
            </p>
          </div>

          <span className="text-[10px] font-bold block mb-1.5" style={{ fontFamily: mono, color: "var(--text)" }}>
            Recent Activity
          </span>
          {[
            { initials: "A", color: "#0ea5e9", name: "Ali", msg: "Hey Ali! It's been a while since we connected about Assemble...", time: "2h ago" },
            { initials: "AK", color: "#8b5cf6", name: "Apurv Kaushal", msg: "Hey Apurv! It's been way too long since we chatted after...", time: "2h ago" },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <Avatar initials={item.initials} color={item.color} />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>{item.name}</div>
                <div className="text-[9px] truncate" style={{ color: "var(--text-dim)", fontFamily: mono }}>{item.msg}</div>
              </div>
              <span className="text-[8px] shrink-0" style={{ color: "var(--text-dim)", fontFamily: mono }}>{item.time}</span>
            </div>
          ))}
        </div>

        {/* Right: Needs Attention */}
        <div className="w-[180px] shrink-0 rounded-lg p-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold" style={{ fontFamily: mono, color: "var(--text)" }}>Needs Attention</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontFamily: mono }}>5</span>
          </div>
          <p className="text-[8px] mb-2" style={{ color: "var(--text-dim)", fontFamily: mono }}>
            High-priority contacts going silent
          </p>
          {[
            { initials: "RF", name: "Roman Frank", days: "3153d" },
            { initials: "HP", name: "Henrik Pedersen", days: "3108d" },
            { initials: "OK", name: "Olha Kozynets", days: "3094d" },
            { initials: "MA", name: "Maxim A.", days: "3090d" },
            { initials: "VB", name: "Vladimir Bugay", days: "3090d" },
          ].map((item) => (
            <div key={item.initials} className="flex items-center gap-1.5 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
              <Avatar initials={item.initials} color="#dc2626" />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] truncate" style={{ fontFamily: mono, color: "var(--text-muted)" }}>{item.name}</div>
              </div>
              <span className="text-[8px] shrink-0 flex items-center gap-0.5" style={{ color: "#ef4444", fontFamily: mono }}>
                <span className="w-1 h-1 rounded-full inline-block" style={{ background: "#ef4444" }} />
                {item.days}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
