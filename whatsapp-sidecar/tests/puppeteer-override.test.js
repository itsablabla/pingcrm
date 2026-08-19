const { test, describe } = require("node:test");
const assert = require("node:assert");
const { createRequire } = require("node:module");
const { readdirSync, statSync } = require("node:fs");
const path = require("node:path");

// @puppeteer/browsers is a transitive dep, so resolve it the way puppeteer-core
// does rather than from this file.
const puppeteerCoreRequire = createRequire(require.resolve("puppeteer-core/package.json"));

/** Every directory named `name` anywhere under node_modules. */
function findInstalled(name, dir = path.join(__dirname, "..", "node_modules"), depth = 0) {
  if (depth > 6) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const hits = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (entry === name) hits.push(full);
    else hits.push(...findInstalled(name, full, depth + 1));
  }
  return hits;
}

/**
 * We pin `@puppeteer/browsers` to ^3.x via an `overrides` entry in package.json.
 *
 * Why: every 2.x release depends on `extract-zip`, which has an unpatched
 * symlink path-traversal advisory (GHSA-jmr9-qjv8-65gv) and no fixed version on
 * that line. v3 replaced it with `modern-tar`, so the override is what keeps the
 * dependency tree clean.
 *
 * The risk: puppeteer 24 declares `@puppeteer/browsers@2.x`, so we are forcing a
 * major bump underneath it, and puppeteer-core calls into this package on the
 * browser-launch path. These tests fail loudly if that contract ever breaks —
 * at CI time rather than when a WhatsApp session tries to start in production.
 */

// Exactly the bindings puppeteer-core@24 and puppeteer@24 import from
// @puppeteer/browsers (grepped from their compiled CJS output).
const REQUIRED_API = [
  "Browser",
  "CDP_WEBSOCKET_ENDPOINT_REGEX",
  "ChromeReleaseChannel",
  "CLI",
  "computeExecutablePath",
  "computeSystemExecutablePath",
  "createProfile",
  "detectBrowserPlatform",
  "getInstalledBrowsers",
  "install",
  "launch",
  "resolveBuildId",
  "TimeoutError",
  "uninstall",
  "WEBDRIVER_BIDI_WEBSOCKET_ENDPOINT_REGEX",
];

describe("@puppeteer/browsers override", () => {
  test("still supplies every API puppeteer calls into", () => {
    const browsers = puppeteerCoreRequire("@puppeteer/browsers");
    const missing = REQUIRED_API.filter((name) => browsers[name] === undefined);
    assert.deepStrictEqual(
      missing,
      [],
      `@puppeteer/browsers is missing ${missing.join(", ")}. The overrides pin in ` +
        `package.json forced a version incompatible with the installed puppeteer. ` +
        `Browser launch would fail at runtime.`
    );
  });

  test("does not pull extract-zip back into the tree", () => {
    const found = findInstalled("extract-zip");
    assert.deepStrictEqual(
      found,
      [],
      "extract-zip is installed again — the @puppeteer/browsers override is no longer " +
        "keeping GHSA-jmr9-qjv8-65gv out of the dependency tree."
    );
  });

  test("is still required — remove it once puppeteer ships @puppeteer/browsers 3.x itself", () => {
    const declared =
      puppeteerCoreRequire("puppeteer-core/package.json").dependencies["@puppeteer/browsers"];
    const installed = puppeteerCoreRequire("@puppeteer/browsers/package.json").version;
    const declaredMajor = declared.replace(/^[^\d]*/, "").split(".")[0];
    const installedMajor = installed.split(".")[0];

    // When these converge, puppeteer depends on 3.x natively and the override in
    // package.json is dead weight that should be deleted.
    assert.notStrictEqual(
      declaredMajor,
      installedMajor,
      `puppeteer-core now declares @puppeteer/browsers@${declared} and ${installed} is ` +
        `installed. The "overrides" entry in package.json is redundant — remove it.`
    );
  });
});
