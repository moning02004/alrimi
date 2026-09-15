"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { clearOnLogout } from "@/lib/session";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  // 로그아웃하면 캐시를 비운다. 안 비우면 다음에 로그인한 사람에게 앞사람 이름이 보인다
  useEffect(() => clearOnLogout(client), [client]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-center" toastOptions={{ duration: 2200 }} />
    </QueryClientProvider>
  );
}
