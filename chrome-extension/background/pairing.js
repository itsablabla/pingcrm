/**
 * Pairing code generation and polling for PingCRM LinkedIn Companion.
 *
 * Flow:
 *   1. User opens popup and sets their PingCRM instance URL.
 *   2. startPairing() generates a PING-XXXXXX code and starts polling the backend.
 *   3. Backend marks the code as redeemed when the user visits Settings → Extensions.
 *   4. On 200, the token and apiUrl are persisted; polling stops automatically.
 *
 * Code format: "PING-" + 6 chars from an unambiguous alphanumeric charset.
 * Expiry: 10 minutes (backend enforces this; extension auto-regenerates on 410).
 *
 * Storage keys written:
 *   apiUrl   - PingCRM instance URL (set before pairing begins)
 *   token    - Bearer token received on successful pairing
 */

const PAIRING_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars, no O/0/I/1/L
const PAIRING_CODE_LENGTH = 6;
const PAIRING_PREFIX = "PING-";
const PAIRING_POLL_INTERVAL_MS = 3000;   // Poll every 3 seconds
const PAIRING_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
// Cap how long a single poll may hold a connection. Without this a stalled
// request never settles, and since Chrome allows only ~6 concurrent connections
// per host, a handful of hung polls starve every other request to the same
// origin — including the PingCRM tab's own API calls.
const PAIRING_POLL_TIMEOUT_MS = 10 * 1000;
// Give up after ~1 minute of consecutive failures rather than polling forever.
const PAIRING_MAX_CONSECUTIVE_ERRORS = 20;

// Module-level state (survives within the service worker's lifetime)
let _pollIntervalId = null;
let _currentCode = null;
let _codeGeneratedAt = null;
let _pollInFlight = false;
let _consecutiveErrors = 0;

// ── Code generation ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random pairing code.
 * Uses crypto.getRandomValues() with rejection sampling to eliminate modulo bias.
 * The charset has 31 characters; we accept only values in [0, 31*8) = [0, 248)
 * so that each character maps to exactly 8 raw byte values.
 *
 * @returns {string} e.g. "PING-K7R2MQ"
 */
function generatePairingCode() {
  const charsetLen = PAIRING_CHARSET.length; // 31
  const maxUnbiased = 256 - (256 % charsetLen); // 248 — highest multiple of 31 within [0,256)
  let code = PAIRING_PREFIX;
  let collected = 0;
  while (collected < PAIRING_CODE_LENGTH) {
    // Generate a fresh batch each time to allow rejection without complex indexing
    const batch = new Uint8Array(PAIRING_CODE_LENGTH * 2);
    crypto.getRandomValues(batch);
    for (let i = 0; i < batch.length && collected < PAIRING_CODE_LENGTH; i++) {
      if (batch[i] < maxUnbiased) {
        code += PAIRING_CHARSET[batch[i] % charsetLen];
        collected++;
      }
      // Values >= maxUnbiased are rejected (bias elimination)
    }
  }
  return code;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Read the stored PingCRM instance URL.
 * Returns null if not yet configured (user must enter URL in popup first).
 *
 * @returns {Promise<string|null>}
 */
async function getStoredApiUrl() {
  const { apiUrl } = await chrome.storage.local.get(["apiUrl"]);
  return apiUrl ? apiUrl.replace(/\/+$/, "") : null;
}

// ── Polling ───────────────────────────────────────────────────────────────────

/**
 * Check a single poll cycle against the backend pairing endpoint.
 * Handles 200 (paired), 404 (pending), 410 (expired), 429 (skip cycle).
 *
 * @param {string} apiUrl - PingCRM backend base URL
 * @param {string} code   - Current pairing code, e.g. "PING-K7R2MQ"
 * @returns {Promise<"paired"|"pending"|"expired"|"rate_limited"|"error">}
 */
async function _pollOnce(apiUrl, code) {
  try {
    const resp = await fetch(
      `${apiUrl}/api/v1/extension/pair?code=${encodeURIComponent(code)}`,
      { method: "GET", signal: AbortSignal.timeout(PAIRING_POLL_TIMEOUT_MS) }
    );

    if (resp.status === 200) {
      const body = await resp.json();
      const token = body?.data?.token ?? body?.token ?? null;
      const returnedApiUrl = body?.data?.api_url ?? apiUrl;

      if (token) {
        await chrome.storage.local.set({
          token,
          apiUrl: returnedApiUrl.replace(/\/+$/, ""),
        });
      }
      return "paired";
    }

    if (resp.status === 404) return "pending";
    if (resp.status === 410) return "expired";
    if (resp.status === 429) return "rate_limited";

    // Any other non-2xx — log but keep polling
    console.warn("[PingCRM Pairing] Unexpected poll status:", resp.status);
    return "error";
  } catch (e) {
    console.warn("[PingCRM Pairing] Poll network error:", e.message);
    return "error";
  }
}

/**
 * Start the pairing process.
 *
 * Generates a new code, begins polling every 3 seconds.
 * Automatically regenerates the code on expiry (410) or after PAIRING_EXPIRY_MS.
 * Stops and resolves when the backend confirms pairing (200).
 *
 * If no apiUrl is stored yet, throws synchronously — the popup must save the
 * instance URL via chrome.storage.local before calling startPairing().
 *
 * @returns {{code: string, done: Promise<void>}}
 *   code - The initial pairing code to display in the popup.
 *   done - Resolves when pairing completes (token stored).
 */
/**
 * Run one poll cycle: regenerate the code if expired, poll the backend once,
 * and act on the outcome.
 *
 * Extracted from the interval callback so it can be driven directly in tests
 * without a live timer.
 *
 * @param {() => void} [onPaired] - invoked once pairing succeeds
 * @returns {Promise<"paired"|"pending"|"expired"|"rate_limited"|"error"|"no_url"|"gave_up">}
 */
async function _runPollCycle(onPaired) {
  // Auto-regenerate if code has exceeded local expiry window
  if (Date.now() - _codeGeneratedAt >= PAIRING_EXPIRY_MS) {
    _currentCode = generatePairingCode();
    _codeGeneratedAt = Date.now();
    // Notify any listeners (popup may be listening for storage changes)
    await chrome.storage.local.set({ _pairingCode: _currentCode });
    console.log("[PingCRM Pairing] Code regenerated (expiry):", _currentCode);
  }

  const apiUrl = await getStoredApiUrl();
  if (!apiUrl) {
    // No URL yet — wait for the user to enter it
    return "no_url";
  }

  const outcome = await _pollOnce(apiUrl, _currentCode);

  if (outcome === "paired") {
    console.log("[PingCRM Pairing] Paired successfully");
    stopPolling();
    await chrome.storage.local.remove(["_pairingCode"]);
    if (onPaired) onPaired();
    return outcome;
  }

  if (outcome === "expired") {
    // Backend says code is expired — generate a new one immediately
    _consecutiveErrors = 0;
    _currentCode = generatePairingCode();
    _codeGeneratedAt = Date.now();
    await chrome.storage.local.set({ _pairingCode: _currentCode });
    console.log("[PingCRM Pairing] Code regenerated (server 410):", _currentCode);
    return outcome;
  }

  if (outcome === "error") {
    _consecutiveErrors++;
    if (_consecutiveErrors >= PAIRING_MAX_CONSECUTIVE_ERRORS) {
      // The backend is unreachable or misbehaving. Polling forever keeps the
      // service worker alive and keeps burning connections to the host, so stop
      // and let the popup surface the failure.
      console.error(
        "[PingCRM Pairing] Giving up after",
        _consecutiveErrors,
        "consecutive poll failures"
      );
      stopPolling();
      await chrome.storage.local.set({ _pairingError: "POLL_FAILED" });
      return "gave_up";
    }
    return outcome;
  }

  // "pending" / "rate_limited" — backend answered, so the connection is healthy
  _consecutiveErrors = 0;
  return outcome;
}

function startPairing() {
  // Stop any existing poll loop
  stopPolling();

  _currentCode = generatePairingCode();
  _codeGeneratedAt = Date.now();

  // done resolves when pairing succeeds; reject is intentionally not exposed
  // (errors are surfaced via chrome.storage changes the popup can observe).
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });

  _pollIntervalId = setInterval(() => {
    // setInterval does not await an async callback, so without this guard a poll
    // that outlives the 3s interval overlaps with the next one and connections
    // pile up without bound. Skip the tick instead of stacking requests.
    if (_pollInFlight) {
      console.warn("[PingCRM Pairing] Previous poll still in flight, skipping tick");
      return;
    }
    _pollInFlight = true;
    void _runPollCycle(resolveDone).finally(() => {
      _pollInFlight = false;
    });
  }, PAIRING_POLL_INTERVAL_MS);

  // Persist initial code so the popup can read it even after a service worker restart
  chrome.storage.local.set({ _pairingCode: _currentCode });

  return { code: _currentCode, done };
}

/**
 * Stop the pairing poll interval and clear state.
 * Safe to call multiple times or when no poll is active.
 */
function stopPolling() {
  if (_pollIntervalId !== null) {
    clearInterval(_pollIntervalId);
    _pollIntervalId = null;
  }
  _currentCode = null;
  _codeGeneratedAt = null;
  _consecutiveErrors = 0;
  _pollInFlight = false;
}
