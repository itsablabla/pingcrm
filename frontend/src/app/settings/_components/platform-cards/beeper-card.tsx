"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check, Link2, Unplug, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { client } from "@/lib/api-client";
import {
  ConnectionBadge,
  SyncButtonWrapper,
  KebabMenu,
} from "../shared";
import { SyncHistoryModal } from "../sync-history-modal";
import type { ConnectedAccounts, SyncState } from "../../_hooks/use-settings-controller";
import type { UseBeeperConnectFlowReturn } from "../../_hooks/use-beeper-connect-flow";

function BeeperIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="#6366f1" strokeWidth="2" />
      <circle cx="8.5" cy="12" r="1.6" fill="#6366f1" />
      <circle cx="13" cy="12" r="1.6" fill="#6366f1" />
      <circle cx="17.5" cy="12" r="1.6" fill="#6366f1" />
    </svg>
  );
}

type BeeperNetworkInfo = {
  accountID: string | null;
  network: string | null;
  status: string | null;
  username: string | null;
}

export type BeeperCardProps = {
  connected: ConnectedAccounts;
  beeperConnect: SyncState;
  beeperSync: SyncState;
  beeperFlow: UseBeeperConnectFlowReturn;
  handleBeeperSync: () => Promise<void>;
  fetchConnectionStatus: () => Promise<void>;
}

export function BeeperCard({
  connected,
  beeperConnect,
  beeperSync,
  beeperFlow,
  handleBeeperSync,
  fetchConnectionStatus,
}: BeeperCardProps) {
  const isConnected = connected.beeper;
  const { step, error, startConnect } = beeperFlow;
  const [showSyncHistory, setShowSyncHistory] = useState(false);
  const [networks, setNetworks] = useState<string[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Fetch bridged networks for the connected subtitle.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await client.GET("/api/v1/beeper/status", {});
        if (cancelled) return;
        const accounts = (data?.data?.accounts ?? []) as BeeperNetworkInfo[];
        const names = Array.from(
          new Set(accounts.map((a) => a.network).filter((n): n is string => !!n))
        );
        setNetworks(names);
        setStatusError(data?.data?.error ?? null);
      } catch (err) {
        console.error("load beeper status failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const handleDisconnect = async () => {
    // eslint-disable-next-line no-alert -- native confirm before destructive disconnect
    if (confirm("Disconnect Beeper? Your synced messages will be kept but no new data will sync.")) {
      await client.POST("/api/v1/beeper/disconnect", {});
      setNetworks([]);
      await fetchConnectionStatus();
    }
  };

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "w-11 h-11 rounded-lg flex items-center justify-center shrink-0",
              isConnected ? "bg-indigo-50 dark:bg-indigo-950" : "bg-stone-100 dark:bg-stone-800"
            )}
          >
            <BeeperIcon />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Beeper</h3>
              <ConnectionBadge connected={isConnected} />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Sync chats across WhatsApp, Telegram, Signal and more via Beeper
            </p>
            {isConnected && networks.length > 0 && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                Connected · <strong>{networks.join(", ")}</strong>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <SyncButtonWrapper phase={beeperSync.status}>
                <button
                  onClick={() => void handleBeeperSync()}
                  disabled={beeperSync.status === "loading"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  {beeperSync.status === "loading" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : beeperSync.status === "success" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {beeperSync.status === "loading"
                    ? "Syncing..."
                    : beeperSync.status === "success"
                    ? "Done"
                    : "Sync now"}
                </button>
              </SyncButtonWrapper>
              <KebabMenu
                items={[
                  { icon: History, label: "Sync history", onClick: () => setShowSyncHistory(true) },
                  { icon: Unplug, label: "Disconnect Beeper", danger: true, onClick: () => { void handleDisconnect(); } },
                ]}
              />
            </>
          ) : (
            <button
              onClick={() => { void startConnect(); }}
              disabled={step === "connecting"}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <Link2 className="w-3.5 h-3.5" />
              Connect
            </button>
          )}
        </div>
      </div>

      {(error || beeperConnect.status === "error" || statusError) && (
        <p className="text-xs mt-3 text-red-500">
          {statusError || error || beeperConnect.message}
        </p>
      )}

      {showSyncHistory && (
        <SyncHistoryModal platform="beeper" onClose={() => setShowSyncHistory(false)} />
      )}
    </div>
  );
}
