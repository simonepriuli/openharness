import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { remoteKeys } from "../queries/query-keys";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    const invalidateRemote = () => {
      void queryClient.invalidateQueries({ queryKey: remoteKeys.all });
    };

    const clearRemote = () => {
      queryClient.removeQueries({ queryKey: remoteKeys.all });
    };

    const unsubAuthenticated =
      typeof window.onAuthenticated === "function"
        ? window.onAuthenticated(() => {
            invalidateRemote();
          })
        : () => {};

    const unsubUserUpdated =
      typeof window.onUserUpdated === "function"
        ? window.onUserUpdated((user) => {
            if (user === null) {
              clearRemote();
            } else {
              invalidateRemote();
            }
          })
        : () => {};

    return () => {
      unsubAuthenticated();
      unsubUserUpdated();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export { useQueryClient } from "@tanstack/react-query";
