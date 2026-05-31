import { ListPods, type PodInfo } from "./lib/k8s";

function phaseStyles(phase: string): string {
  switch (phase) {
    case "Running":
      return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
    case "Succeeded":
      return "bg-sky-500/10 text-sky-400 ring-sky-500/30";
    case "Pending":
      return "bg-amber-500/10 text-amber-400 ring-amber-500/30";
    case "Failed":
      return "bg-rose-500/10 text-rose-400 ring-rose-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
  }
}

function relativeAge(startTime: string | null): string {
  if (!startTime) return "—";
  const start = new Date(startTime).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export default async function Home() {
  let pods: PodInfo[] = [];
  let error: string | null = null;

  try {
    pods = await ListPods();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const runningCount = pods.filter((p) => p.phase === "Running").length;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-lg shadow-lg shadow-indigo-500/20">
              ⎈
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Kubernetes Pods
            </h1>
          </div>
          <p className="text-sm text-zinc-400">
            {error
              ? "Could not reach the cluster."
              : `${pods.length} pod${pods.length === 1 ? "" : "s"} across all namespaces · ${runningCount} running`}
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
            <p className="font-medium text-rose-200">Failed to list pods</p>
            <p className="mt-1 font-mono text-xs text-rose-300/80">{error}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/40 backdrop-blur">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Namespace</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Ready</th>
                  <th className="px-5 py-3 font-medium">Restarts</th>
                  <th className="px-5 py-3 font-medium">Node</th>
                  <th className="px-5 py-3 font-medium">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {pods.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-zinc-500"
                    >
                      No pods found.
                    </td>
                  </tr>
                ) : (
                  pods.map((pod) => (
                    <tr
                      key={`${pod.namespace}/${pod.name}`}
                      className="transition-colors hover:bg-zinc-800/40"
                    >
                      <td className="px-5 py-3 font-mono text-zinc-100">
                        {pod.name}
                      </td>
                      <td className="px-5 py-3 text-zinc-400">
                        {pod.namespace}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${phaseStyles(
                            pod.phase
                          )}`}
                        >
                          {pod.phase}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-zinc-300">
                        {pod.ready}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            pod.restarts > 0
                              ? "font-mono text-amber-400"
                              : "font-mono text-zinc-500"
                          }
                        >
                          {pod.restarts}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400">{pod.node}</td>
                      <td className="px-5 py-3 text-zinc-400">
                        {relativeAge(pod.startTime)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
