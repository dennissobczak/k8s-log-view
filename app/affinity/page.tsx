import Link from "next/link";
import AffinityBuilder from "../components/AffinityBuilder";

// Fully client-side tool — it assembles Kubernetes affinity YAML from user
// input and never touches the cluster, so there is no data fetch here (and no
// need for `connection()`). The page is a thin Server Component shell that
// renders the interactive builder.
export default function Affinity() {
  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-lg shadow-lg shadow-indigo-500/20">
              ⎈
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Affinity Builder
            </h1>
            <Link
              href="/"
              className="ml-auto rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              ← Pods
            </Link>
          </div>
          <p className="text-sm text-zinc-400">
            Graphically build pod scheduling affinity &amp; anti-affinity, then
            copy the generated YAML into your Pod or Deployment spec.
          </p>
        </header>

        <AffinityBuilder />
      </div>
    </div>
  );
}
