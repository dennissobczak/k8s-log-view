"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// How often auto-refresh re-runs the server component to refetch data.
const REFRESH_INTERVAL_MS = 10_000;

// Toggle button that periodically calls router.refresh() while enabled, re-running
// the current route's Server Components (e.g. page.tsx / dashboard/page.tsx) to
// refetch data. router.refresh() merges the new server payload without dropping
// client state, so filters and open dialogs stay put across refreshes.
export default function AutoRefreshToggle({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, router]);

  return (
    <button
      onClick={() => setAutoRefresh((on) => !on)}
      aria-pressed={autoRefresh}
      title={`Auto-refresh every ${REFRESH_INTERVAL_MS / 1000}s`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        autoRefresh
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600"
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          autoRefresh ? "animate-pulse bg-emerald-400" : "bg-zinc-500"
        }`}
      />
      Auto-refresh {autoRefresh ? "on" : "off"}
    </button>
  );
}
