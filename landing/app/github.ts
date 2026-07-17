const REPO = "sneg55/pingcrm";

/**
 * Fetches the repo's stargazer count at build time (this is a static `output: export`
 * site, so the value is baked into the HTML and refreshes on each rebuild).
 * Returns null on any failure so callers fall back to a plain "Star" label.
 */
export async function getStarCount(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "pingcrm-landing",
      },
      // force-cache keeps the fetch static so it doesn't opt the route into dynamic
      // rendering (which would break `output: export`).
      cache: "force-cache",
    });
    if (!res.ok) {
      console.error(`[github] star count fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch (err) {
    console.error("[github] star count fetch error:", err);
    return null;
  }
}

/** 28 → "28", 1234 → "1.2k", 12345 → "12k". */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return (k >= 10 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, "")) + "k";
}
