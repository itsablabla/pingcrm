"use client";

import { useEffect } from "react";

export default function ScrollRevealInit() {
  useEffect(() => {
    const els = document.querySelectorAll(".scroll-reveal");
    if (!els.length) return;

    // Fallback: if IntersectionObserver is unavailable, reveal everything so no
    // section is ever gated invisible.
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
