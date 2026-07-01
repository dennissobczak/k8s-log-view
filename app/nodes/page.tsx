import { connection } from "next/server";
import Link from "next/link";
import { ListNodes, type NodeInfo } from "../lib/k8s";
import NodeTable from "../components/NodeTable";

export default async function Nodes() {
  // See app/page.tsx: force per-request rendering so ListNodes() runs inside the
  // pod (with in-cluster auth) instead of being prerendered at build time.
  await connection();

  let nodes: NodeInfo[] = [];
  let error: string | null = null;

  try {
    nodes = await ListNodes();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const readyCount = nodes.filter((n) => n.status === "Ready").length;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-lg shadow-lg shadow-indigo-500/20">
              ⎈
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Kubernetes Nodes
            </h1>
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
              : `${nodes.length} node${nodes.length === 1 ? "" : "s"} provisioned · ${readyCount} ready`}
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-300">
            <p className="font-medium text-rose-200">Failed to list nodes</p>
            <p className="mt-1 font-mono text-xs text-rose-300/80">{error}</p>
          </div>
        ) : (
          <NodeTable nodes={nodes} />
        )}
      </div>
    </div>
  );
}
