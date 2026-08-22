"use client";

import { useState, useCallback } from "react";
import { client } from "@/lib/api-client";
import type { SyncState } from "./use-settings-controller";

export type BeeperStep = "idle" | "connecting" | "connected" | "error";

export type UseBeeperConnectFlowProps = {
  beeperConnect: SyncState;
  setBeeperConnect: (s: SyncState) => void;
  onSuccess: () => Promise<void>;
}

export type UseBeeperConnectFlowReturn = {
  step: BeeperStep;
  error: string | null;
  startConnect: () => Promise<void>;
  reset: () => void;
}

/**
 * Beeper uses a deployment-level token (no per-user OAuth/QR), so
 * connecting is a single validated API call that flips the user's
 * enablement flag — closest analog is the WhatsApp token flow minus QR.
 */
export function useBeeperConnectFlow({
  beeperConnect,
  setBeeperConnect,
  onSuccess,
}: UseBeeperConnectFlowProps): UseBeeperConnectFlowReturn {
  const [step, setStep] = useState<BeeperStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const startConnect = useCallback(async () => {
    setStep("connecting");
    setError(null);
    setBeeperConnect({ status: "loading", message: "Connecting Beeper..." });

    const { error: err } = await client.POST("/api/v1/beeper/connect", {
      body: { enabled: true },
    });
    if (err) {
      setStep("error");
      const detail = (err as { detail?: string })?.detail;
      setError(detail || "Failed to connect Beeper. The deployment may not have a token configured.");
      setBeeperConnect({ status: "error", message: "Connection failed" });
      return;
    }

    setStep("connected");
    setBeeperConnect({ status: "success", message: "Beeper connected!" });
    await onSuccess();
  }, [setBeeperConnect, onSuccess]);

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setBeeperConnect({ status: "idle", message: "" });
  }, [setBeeperConnect]);

  // suppress unused variable warning — beeperConnect is a prop kept for API symmetry
  void beeperConnect;

  return { step, error, startConnect, reset };
}
