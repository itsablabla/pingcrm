"use client";

import { useState, useEffect } from "react";
import { MiniNav } from "./preview-shared";
import { DashboardScreen } from "./preview-dashboard";
import { ContactScreen } from "./preview-contact";
import { SuggestionsScreen } from "./preview-suggestions";

const SCREEN_LABELS = ["Dashboard", "Contact detail", "Suggestions"];

export default function DashboardPreview() {
  const [activeScreen, setActiveScreen] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActiveScreen((s) => (s + 1) % 3);
        setFading(false);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
          boxShadow: "0 0 60px rgba(52, 211, 153, 0.06), 0 24px 48px rgba(0,0,0,0.4)",
        }}
      >
        <MiniNav activeScreen={activeScreen} />
        <div
          style={{
            opacity: fading ? 0 : 1,
            transition: "opacity 0.4s ease-in-out",
          }}
        >
          {activeScreen === 0 ? <DashboardScreen /> : activeScreen === 1 ? <ContactScreen /> : <SuggestionsScreen />}
        </div>
      </div>

      {/* Screen indicator dots */}
      <div className="flex justify-center gap-2 mt-4">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show ${SCREEN_LABELS[i]} screen`}
            aria-current={activeScreen === i ? "true" : undefined}
            onClick={() => {
              if (i !== activeScreen) {
                setFading(true);
                setTimeout(() => {
                  setActiveScreen(i);
                  setFading(false);
                }, 400);
              }
            }}
            className="grid place-items-center w-6 h-6 rounded-full"
          >
            <span
              className="block w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: activeScreen === i ? "var(--accent)" : "var(--border-bright)",
                boxShadow: activeScreen === i ? "0 0 8px var(--accent-glow-strong)" : "none",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
