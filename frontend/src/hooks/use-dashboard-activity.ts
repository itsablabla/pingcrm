import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/api-errors";
import type { ActivityEvent } from "@/hooks/use-dashboard";

const DASHBOARD_REFETCH_MS = 5 * 60 * 1000; // 5 minutes

export function useDashboardActivity() {
  const activityQuery = useQuery({
    queryKey: ["activity", "recent"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/v1/activity/recent", {
        params: { query: { limit: 5 } },
      });
      if (error) throw new Error(extractErrorMessage(error) ?? "Failed to load recent activity");
      return data ?? { data: [], error: null };
    },
    refetchInterval: DASHBOARD_REFETCH_MS,
  });

  return {
    recentActivity: (activityQuery.data?.data ?? []) as ActivityEvent[],
    isLoading: activityQuery.isLoading,
    isError: activityQuery.isError,
    error: activityQuery.error,
    refetch: () => {
      void activityQuery.refetch();
    },
  };
}
