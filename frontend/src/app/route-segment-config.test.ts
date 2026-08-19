import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * Next.js only honours route segment config (`export const dynamic`,
 * `revalidate`, `fetchCache`, `runtime`, `dynamicParams`) in *server*
 * components. Exporting it from a "use client" module is silently ignored —
 * no error, no warning, the route just stays statically prerendered.
 *
 * That silent no-op caused a real bug: /contacts and /organizations declared
 * `export const dynamic = "force-dynamic"` inside "use client" pages, so they
 * were prerendered as static. On a statically prerendered route, a
 * client-side router.replace() that only changes search params is dropped —
 * every toolbar filter silently stopped working once the page had been loaded
 * with any query string.
 *
 * The fix is to declare the config in a server-component layout.tsx instead.
 * This test fails if the dead pattern ever comes back.
 */

const APP_DIR = path.resolve(__dirname);

const SEGMENT_CONFIG_KEYS = [
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isClientModule(source: string): boolean {
  // "use client" must be the first statement in the module.
  const firstCode = source
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
  return firstCode === '"use client";' || firstCode === "'use client';";
}

function exportedSegmentConfig(source: string): string[] {
  // Plain string scanning — a dynamic RegExp here trips security/detect-non-literal-regexp.
  const declared = new Set<string>();
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("export const ")) continue;
    const name = line.slice("export const ".length).split(/[\s=:]/)[0];
    if (SEGMENT_CONFIG_KEYS.includes(name)) declared.add(name);
  }
  return SEGMENT_CONFIG_KEYS.filter((k) => declared.has(k));
}

describe("Next.js route segment config", () => {
  it("is never exported from a \"use client\" module (Next silently ignores it)", () => {
    const offenders: string[] = [];

    for (const file of walk(APP_DIR)) {
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;
      const keys = exportedSegmentConfig(source);
      if (keys.length > 0) {
        offenders.push(`${path.relative(APP_DIR, file)} exports ${keys.join(", ")}`);
      }
    }

    expect(
      offenders,
      `Route segment config in a client component is a silent no-op. ` +
        `Move it to a server-component layout.tsx:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("keeps the search-param-driven routes dynamic via a server layout", () => {
    for (const route of ["contacts", "organizations"]) {
      const layout = path.join(APP_DIR, route, "layout.tsx");
      const source = readFileSync(layout, "utf8");
      expect(isClientModule(source), `${route}/layout.tsx must stay a server component`).toBe(false);
      expect(exportedSegmentConfig(source)).toContain("dynamic");
      expect(source).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
    }
  });
});
