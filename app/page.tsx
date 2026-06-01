import { ListPods, ListNamespaces, type PodInfo } from "./lib/k8s";
import PodTable from "./components/PodTable";

export default async function Home() {
  let pods: PodInfo[] = [];
  let namespaces: string[] = [];
  let error: string | null = null;

  try {
    [pods, namespaces] = await Promise.all([ListPods(), ListNamespaces()]);
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
              : `${pods.length} pod${pods.length === 1 ? "" : "s"} across all namespaces · ${runningCount} running · click a row to view logs`}
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
            <p className="font-medium text-rose-200">Failed to list pods</p>
            <p className="mt-1 font-mono text-xs text-rose-300/80">{error}</p>
          </div>
        ) : (
          <PodTable pods={pods} namespaces={namespaces} />
        )}
      </div>
    </div>
  );
}
