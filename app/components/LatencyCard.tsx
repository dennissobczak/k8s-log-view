// Pure-display card for the API-server network latency. No interactivity, so it
// stays a Server Component (no "use client").

import type { ClusterLatency } from "../lib/k8s";

// Quality bands for the average round-trip, in milliseconds. These are rough,
// human-friendly thresholds for an API-server probe — tune to taste.
function quality(avgMs: number): { label: string; color: string } {
  if (avgMs < 50) return { label: "Excellent", color: "#10b981" }; // emerald
  if (avgMs < 150) return { label: "Good", color: "#84cc16" }; // lime
  if (avgMs < 400) return { label: "Fair", color: "#f59e0b" }; // amber
  return { label: "Slow", color: "#f43f5e" }; // rose
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-sm tabular-nums text-zinc-200">
        {value}
      </span>
    </div>
  );
}

export default function LatencyCard({ latency }: { latency: ClusterLatency }) {
  const q = quality(latency.avgMs);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-5xl font-semibold tabular-nums"
          style={{ color: q.color }}
        >
          {latency.avgMs}
        </span>
        <span className="text-lg text-zinc-400">ms</span>
        <span
          className="ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: `${q.color}1a`, color: q.color }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: q.color }}
          />
          {q.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Min" value={`${latency.minMs} ms`} />
        <Stat label="Avg" value={`${latency.avgMs} ms`} />
        <Stat label="Max" value={`${latency.maxMs} ms`} />
      </div>

      <p className="text-xs text-zinc-500">
        Round-trip to{" "}
        <span className="font-mono text-zinc-400">
          {latency.service || "API server"}
        </span>{" "}
        <code className="text-zinc-400">/version</code> · {latency.samples}{" "}
        probe{latency.samples === 1 ? "" : "s"}
      </p>
    </div>
  );
}
