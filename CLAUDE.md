@AGENTS.md

# k8s-log-view

A Next.js 16 (App Router) + React 19 web app that lists Kubernetes pods across all
namespaces and shows per-pod **logs** and **events**. The cluster connection is read
from the local kubeconfig (`~/.kube/config` or `$KUBECONFIG`) via
`@kubernetes/client-node`. Styling is Tailwind v4 with a dark zinc theme.

> See `AGENTS.md` (imported above): this is a **modified Next.js** — read the relevant
> guide in `node_modules/next/dist/docs/` before relying on framework behavior or
> conventions from memory.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (`next dev`) |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Serve the production build (`next start`) |
| `npm run lint` | Lint (`eslint`, flat config in `eslint.config.mjs`) |

There is currently **no test setup**.

The app needs a reachable cluster: it calls `kc.loadFromDefault()`, so a valid kubeconfig
(or in-cluster service account) must be present. With no cluster, `page.tsx` catches the
error and renders a "Could not reach the cluster" state instead of crashing.

## Architecture

Three layers, strictly separated:

1. **Data access — `app/lib/k8s.ts`** (server-only). The only place that talks to
   `@kubernetes/client-node`. Exports the domain types `PodInfo` and `EventInfo`, plus:
   - `ListPods()` — lists pods across all namespaces and, in parallel
     (`Promise.all`), all events; derives ready count, total restarts, age, container
     names, and a per-pod event count keyed by `"namespace/name"`.
   - `ListNamespaces()` — sorted namespace names.
   - `GetPodEvents(namespace, name)` — events for one pod, sorted oldest→newest.
   - `GetPodLogs(namespace, name, opts)` — pod logs; supports `container`, `previous`
     (last terminated instance), and `tailLines`.
2. **Server Actions — `app/lib/actions.ts`** (`'use server'`). Thin wrappers the client
   component invokes: `fetchPodLogs` (tails 1000 lines) and `fetchPodEvents`. This is the
   bridge from the client component to the data-access layer.
3. **UI — `app/`**
   - `page.tsx` — **Server Component** (default, async). Fetches `ListPods()` +
     `ListNamespaces()` in parallel at render time, computes the running count, and renders
     the header plus `<PodTable>` (or an error panel).
   - `components/PodTable.tsx` — **Client Component** (`"use client"`, ~430 lines). Holds
     all interactive state with `useState`: namespace filter, selected pod, logs (with
     container selector + "previous" toggle, loading/error states), and an events dialog.
     A `useEffect` wires Escape-to-close for the dialogs. Calls the server actions directly.
   - `layout.tsx` — root layout: Geist / Geist Mono fonts, `globals.css`, html/body shell.

### Data flow

- **Initial load:** `page.tsx` (RSC) → `ListPods()` / `ListNamespaces()` → props to
  `PodTable`. No client-side fetch on first paint.
- **Open logs:** row click → `fetchPodLogs(ns, name, container?, previous?)` server action →
  `GetPodLogs`.
- **Open events:** event-badge click → `fetchPodEvents(ns, name)` → `GetPodEvents`.

Each function in `k8s.ts` constructs its own `KubeConfig` + `CoreV1Api` client per call.

## Conventions

- **App Router**, Server Components by default; add `"use client"` only for genuinely
  interactive UI (currently just `PodTable`).
- Client code never imports `@kubernetes/client-node` directly — it goes through the
  server actions in `app/lib/actions.ts`, which call `app/lib/k8s.ts`.
- TypeScript `strict` is on. Path alias `@/*` → `./*` is configured in `tsconfig.json`,
  though existing imports use relative paths.
- Styling: Tailwind v4 utility classes (imported via `@import "tailwindcss"` in
  `app/globals.css`); dark zinc palette, status colors keyed off pod phase.

## File map

```
app/
  page.tsx                Server Component — home page (fetch + render)
  layout.tsx              Root layout (fonts, metadata, globals.css)
  globals.css             Tailwind v4 + theme tokens
  affinity/page.tsx       Server Component shell — hosts the Affinity Builder
  components/PodTable.tsx  Client Component — table, logs dialog, events dialog
  components/AffinityBuilder.tsx  Client Component — graphical affinity/anti-
                          affinity editor; serializes rules to YAML (no cluster
                          access, no server actions)
  lib/
    k8s.ts                Data-access layer (@kubernetes/client-node)
    actions.ts            Server Actions (fetchPodLogs, fetchPodEvents)
    definitions.ts        Shared types (currently empty)
next.config.ts            Next config (no custom options yet)
eslint.config.mjs         Flat ESLint config (core-web-vitals + typescript)
```

## Current state / gotchas

- `app/lib/definitions.ts` is **empty** — a placeholder; shared types currently live in
  `k8s.ts` (`PodInfo`, `EventInfo`).
- `app/lib/k8s.ts` still contains **leftover demo/scaffold functions** not used by the
  app: `InitK8sClient`, `GetFirstPodLogs`, `GetFirstPodPreviousLogs` (these `console.log`
  and hard-code `pods.items[1]`). Only `ListPods`, `ListNamespaces`, `GetPodEvents`, and
  `GetPodLogs` are wired into the UI.
- `app/layout.tsx` metadata is still the default `create-next-app` title/description.
- A fresh `KubeConfig` + API client is created on every `k8s.ts` call rather than reused.
