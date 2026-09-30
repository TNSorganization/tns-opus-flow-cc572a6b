import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "@/components/route-pending";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.state.data !== undefined) return;
        const message =
          error instanceof Error ? error.message : "This information could not be loaded.";
        toast.error("A section could not be loaded", {
          id: `query-${query.queryHash}`,
          description: message,
        });
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const code =
            error && typeof error === "object" && "code" in error
              ? String((error as { code?: unknown }).code ?? "")
              : "";
          if (["PGRST205", "401", "403"].includes(code)) return false;
          return failureCount < 1;
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  const basepath =
    import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

  const router = createRouter({
    routeTree,
    context: { queryClient },
    basepath,
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 250,
  });

  return router;
};
