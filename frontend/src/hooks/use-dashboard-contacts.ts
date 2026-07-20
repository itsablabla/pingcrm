import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/api-errors";
import type { OverdueContact } from "@/hooks/use-dashboard";

type ContactStats = {
  total: number;
  strong: number;
  active: number;
  dormant: number;
  interactions_this_week: number;
  interactions_last_week: number;
  active_last_week: number;
};

const DASHBOARD_REFETCH_MS = 5 * 60 * 1000; // 5 minutes

function mapStats(raw: ContactStats | undefined) {
  return {
    total: raw?.total ?? 0,
    active: raw?.active ?? 0,
    strong: raw?.strong ?? 0,
    dormant: raw?.dormant ?? 0,
    interactionsThisWeek: raw?.interactions_this_week ?? 0,
    interactionsLastWeek: raw?.interactions_last_week ?? 0,
    activeLastWeek: raw?.active_last_week ?? 0,
  };
}

export function useDashboardContacts() {
  const statsQuery = useQuery({
    queryKey: ["contacts", "stats"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/v1/contacts/stats");
      // Falling back to null here would resolve the query successfully and render
      // as "0 contacts" — a failure indistinguishable from an empty account.
      if (error) throw new Error(extractErrorMessage(error) ?? "Failed to load contact stats");
      return data ?? null;
    },
    refetchInterval: DASHBOARD_REFETCH_MS,
  });

  const overdueQuery = useQuery({
    queryKey: ["contacts", "overdue"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/v1/contacts/overdue", {
        params: { query: { limit: 5 } },
      });
      if (error) throw new Error(extractErrorMessage(error) ?? "Failed to load overdue contacts");
      return data ?? { data: [], error: null };
    },
    refetchInterval: DASHBOARD_REFETCH_MS,
  });

  return {
    statsReady: statsQuery.data?.data != null,
    stats: mapStats(statsQuery.data?.data as ContactStats | undefined),
    overdueContacts: (overdueQuery.data?.data ?? []) as OverdueContact[],
    isLoading: statsQuery.isLoading || overdueQuery.isLoading,
    isError: statsQuery.isError || overdueQuery.isError,
    error: statsQuery.error ?? overdueQuery.error,
    refetch: () => {
      void statsQuery.refetch();
      void overdueQuery.refetch();
    },
  };
}
