import { connection } from "next/server";
import Link from "next/link";
import { ListPods, type PodInfo } from "../lib/k8s";
import HealthPieChart from "../components/HealthPieChart";

// A pod counts as healthy when it is up and all of its containers are ready,
// or when it has run to completion. Anything else — CrashLoopBackOff, not
// ready, Failed, stuck Pending, etc. — counts as unhealthy.
function isHealthy(pod: PodInfo): boolean {
  if (pod.phase === "Succeeded") return true;
  if (pod.phase !== "Running") return false;
  const [ready, total] = pod.ready.split("/").map(Number);
  return total > 0 && ready === total;
}

export default async function Dashboard() {
  // See app/page.tsx: force per-request rendering so ListPods() runs inside the
  // pod (with in-cluster auth) instead of being prerendered at build time.
  await connection();

  let pods: PodInfo[] = [];
  let error: string | null = null;

  try {
    pods = await ListPods();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const healthy = pods.filter(isHealthy).length;
  const unhealthy = pods.length - healthy;
  const healthyPct =
    pods.length > 0 ? Math.round((healthy / pods.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-lg shadow-lg shadow-indigo-500/20">
              ⎈
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <Link
              href="/"
              className="ml-auto rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              ← Pods
            </Link>
          </div>
          <p className="text-sm text-zinc-400">
            {error
              ? "Could not reach the cluster."
              : `Health across ${pods.length} pod${pods.length === 1 ? "" : "s"} · ${healthyPct}% healthy`}
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
            <p className="font-medium text-rose-200">Failed to list pods</p>
            <p className="mt-1 font-mono text-xs text-rose-300/80">{error}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl shadow-black/40 backdrop-blur">
            <h2 className="mb-6 text-sm font-medium uppercase tracking-wider text-zinc-500">
              Pod health
            </h2>
            <HealthPieChart
              slices={[
                { label: "Healthy", value: healthy, color: "#10b981" },
                { label: "Unhealthy", value: unhealthy, color: "#f43f5e" },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
