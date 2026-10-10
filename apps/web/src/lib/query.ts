import { QueryClient } from "@tanstack/react-query";

import { HubError } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => error instanceof HubError && error.status >= 500 && count < 1,
      refetchOnWindowFocus: false,
    },
  },
});
