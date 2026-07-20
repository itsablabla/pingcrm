/**
 * Pairing poll loop resilience.
 *
 * The loop used to poll every 3s forever on failure, with an async setInterval
 * callback that could overlap itself and fetches that had no timeout. Chrome
 * allows ~6 concurrent connections per host, so hung polls starve every other
 * request to the same origin — including the PingCRM tab's own API calls.
 *
 * Run: `node --test` from chrome-extension/test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeChrome } from "./helpers/chrome-stub.mjs";
import { loadModules, EXT_DIR } from "./helpers/loader.mjs";

const PAIRING_FILES = [
  path.join(EXT_DIR, "lib", "storage.js"),
  path.join(EXT_DIR, "background", "pairing.js"),
];

/** Load pairing.js with a scripted fetch. `responses` is consumed per call. */
function harness({ seed = {}, respond } = {}) {
  const { chrome, store } = makeChrome();
  for (const [k, v] of Object.entries(seed)) store.set(k, v);

  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, signal: opts.signal });
    return respond(calls.length, url, opts);
  };

  const sandbox = loadModules({
    chrome,
    fetchImpl,
    files: PAIRING_FILES,
    exports: ["_runPollCycle", "stopPolling", "startPairing", "_pollOnce"],
  });

  return { api: sandbox.__exports, chrome, store, calls };
}

const ok = () => ({
  status: 200,
  json: async () => ({ data: { token: "tok", api_url: "http://x" } }),
  text: async () => "",
});
const status = (code) => ({ status: code, json: async () => ({}), text: async () => "" });

test("poll passes an abort signal so a hung request cannot hold a connection open", async () => {
  const h = harness({ seed: { apiUrl: "http://x" }, respond: () => status(404) });

  await h.api._pollOnce("http://x", "PING-AAAAAA");

  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].signal, "fetch was given an AbortSignal");
  assert.equal(typeof h.calls[0].signal.aborted, "boolean");
});

test("gives up after a sustained run of failures instead of polling forever", async () => {
  const h = harness({
    seed: { apiUrl: "http://x" },
    respond: () => {
      throw new Error("network down");
    },
  });

  h.api.startPairing();

  let outcome;
  // 20 consecutive failures is the cap; drive well past it.
  for (let i = 0; i < 25; i++) {
    outcome = await h.api._runPollCycle();
    if (outcome === "gave_up") break;
  }

  assert.equal(outcome, "gave_up");
  assert.equal(h.store.get("_pairingError"), "POLL_FAILED");
});

test("a successful poll resets the failure counter so transient blips never accumulate", async () => {
  let mode = "fail";
  const h = harness({
    seed: { apiUrl: "http://x" },
    respond: () => {
      if (mode === "fail") throw new Error("blip");
      return status(404); // pending
    },
  });

  h.api.startPairing();

  // 19 failures — one short of the cap.
  for (let i = 0; i < 19; i++) {
    assert.equal(await h.api._runPollCycle(), "error");
  }

  // One good poll clears the streak.
  mode = "ok";
  assert.equal(await h.api._runPollCycle(), "pending");

  // A further 19 failures must therefore still not trip the cap.
  mode = "fail";
  for (let i = 0; i < 19; i++) {
    assert.equal(await h.api._runPollCycle(), "error");
  }
});

test("stops polling and resolves once the backend confirms pairing", async () => {
  const h = harness({ seed: { apiUrl: "http://x" }, respond: () => ok() });

  h.api.startPairing();
  const outcome = await h.api._runPollCycle();

  assert.equal(outcome, "paired");
  assert.equal(h.store.get("token"), "tok");
  assert.equal(h.store.get("_pairingCode"), undefined, "pairing code cleared on success");
});

test("does not poll before the instance URL is configured", async () => {
  const h = harness({ respond: () => ok() });

  h.api.startPairing();
  const outcome = await h.api._runPollCycle();

  assert.equal(outcome, "no_url");
  assert.equal(h.calls.length, 0, "no request without an apiUrl");
});

test("starting a new attempt clears a previous give-up marker", async () => {
  const h = harness({
    seed: { apiUrl: "http://x", _pairingError: "POLL_FAILED" },
    respond: () => status(404),
  });

  h.api.startPairing();

  assert.equal(
    h.store.get("_pairingError"),
    undefined,
    "stale failure cleared so the popup does not show it over a fresh code"
  );
});
