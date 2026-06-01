"use client";

import { useEffect, useState } from "react";
import { fetchPodLogs, fetchPodEvents } from "../lib/actions";
import type { PodInfo, EventInfo } from "../lib/k8s";

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

export default function PodTable({
  pods,
  namespaces,
}: {
  pods: PodInfo[];
  namespaces: string[];
}) {
  const [namespace, setNamespace] = useState<string>("");
  const visiblePods = namespace
    ? pods.filter((p) => p.namespace === namespace)
    : pods;

  const [selected, setSelected] = useState<PodInfo | null>(null);
  const [container, setContainer] = useState<string | undefined>(undefined);
  const [previous, setPrevious] = useState(false);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadLogs(pod: PodInfo, containerName?: string, usePrevious = false) {
    setLogs("");
    setError(null);
    setLoading(true);

    fetchPodLogs(pod.namespace, pod.name, containerName, usePrevious)
      .then((text) => setLogs(text))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  function openLogs(pod: PodInfo) {
    // Default to the first container, current instance; toggles let the user switch.
    const first = pod.containers[0];
    setSelected(pod);
    setContainer(first);
    setPrevious(false);
    loadLogs(pod, first, false);
  }

  function selectContainer(pod: PodInfo, containerName: string) {
    setContainer(containerName);
    loadLogs(pod, containerName, previous);
  }

  function togglePrevious(pod: PodInfo, usePrevious: boolean) {
    setPrevious(usePrevious);
    loadLogs(pod, container, usePrevious);
  }

  function close() {
    setSelected(null);
  }

  // Events dialog state.
  const [eventsPod, setEventsPod] = useState<PodInfo | null>(null);
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  function openEvents(pod: PodInfo) {
    setEventsPod(pod);
    setEvents([]);
    setEventsError(null);
    setEventsLoading(true);

    fetchPodEvents(pod.namespace, pod.name)
      .then((list) => setEvents(list))
      .catch((e) => setEventsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setEventsLoading(false));
  }

  function closeEvents() {
    setEventsPod(null);
  }

  // Close whichever dialog is open on Escape.
  useEffect(() => {
    if (!selected && !eventsPod) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      closeEvents();
      close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, eventsPod]);

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Namespace
          <select
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-100 outline-none transition-colors hover:border-zinc-600 focus:border-sky-500"
          >
            <option value="">All namespaces</option>
            {namespaces.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-zinc-500">
          {visiblePods.length} pod{visiblePods.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/40 backdrop-blur">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Namespace</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Ready</th>
              <th className="px-5 py-3 font-medium">Restarts</th>
              <th className="px-5 py-3 font-medium">Events</th>
              <th className="px-5 py-3 font-medium">Node</th>
              <th className="px-5 py-3 font-medium">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {visiblePods.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-zinc-500">
                  No pods found.
                </td>
              </tr>
            ) : (
              visiblePods.map((pod) => (
                <tr
                  key={`${pod.namespace}/${pod.name}`}
                  onClick={() => openLogs(pod)}
                  className="cursor-pointer transition-colors hover:bg-zinc-800/40"
                >
                  <td className="px-5 py-3 font-mono text-zinc-100">
                    {pod.name}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">{pod.namespace}</td>
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
                  <td className="px-5 py-3">
                    {pod.eventCount > 0 ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEvents(pod);
                        }}
                        title="View events"
                        className="inline-flex min-w-6 items-center justify-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 transition-colors hover:bg-indigo-500/20 hover:text-indigo-200"
                      >
                        {pod.eventCount}
                      </button>
                    ) : (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-700/30 px-2 py-0.5 text-xs font-medium text-zinc-500 ring-1 ring-inset ring-zinc-600/30">
                        {pod.eventCount}
                      </span>
                    )}
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

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Logs for ${selected.name}`}
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-mono text-sm font-semibold text-zinc-100">
                  {selected.name}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {selected.namespace} ·{" "}
                  {previous ? "previous instance logs" : "current instance logs"}
                </p>
              </div>
              <button
                onClick={() => togglePrevious(selected, !previous)}
                aria-pressed={previous}
                className={`ml-auto rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  previous
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                Previous
              </button>
              {selected.containers.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  Container
                  <select
                    value={container}
                    onChange={(e) => selectContainer(selected, e.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-100 outline-none transition-colors hover:border-zinc-600 focus:border-sky-500"
                  >
                    {selected.containers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-zinc-950">
              {loading ? (
                <div className="flex h-40 items-center justify-center gap-3 text-sm text-zinc-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                  Loading logs…
                </div>
              ) : error ? (
                <div className="p-5 text-sm text-rose-400">
                  <p className="font-medium text-rose-300">
                    Could not load logs
                  </p>
                  <p className="mt-1 font-mono text-xs text-rose-400/80">
                    {error}
                  </p>
                </div>
              ) : logs.trim() === "" ? (
                <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
                  No log output.
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-zinc-300">
                  {logs}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {eventsPod && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={closeEvents}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Events for ${eventsPod.name}`}
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-mono text-sm font-semibold text-zinc-100">
                  {eventsPod.name}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {eventsPod.namespace} · events
                </p>
              </div>
              <button
                onClick={closeEvents}
                aria-label="Close"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {eventsLoading ? (
                <div className="flex h-40 items-center justify-center gap-3 text-sm text-zinc-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                  Loading events…
                </div>
              ) : eventsError ? (
                <div className="p-5 text-sm text-rose-400">
                  <p className="font-medium text-rose-300">
                    Could not load events
                  </p>
                  <p className="mt-1 font-mono text-xs text-rose-400/80">
                    {eventsError}
                  </p>
                </div>
              ) : events.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
                  No events.
                </div>
              ) : (
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-5 py-2.5 font-medium">Type</th>
                      <th className="px-5 py-2.5 font-medium">Reason</th>
                      <th className="px-5 py-2.5 font-medium">Message</th>
                      <th className="px-5 py-2.5 font-medium">Count</th>
                      <th className="px-5 py-2.5 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70">
                    {events.map((ev, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-5 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              ev.type === "Warning"
                                ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                                : "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30"
                            }`}
                          >
                            {ev.type}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-zinc-300">
                          {ev.reason}
                        </td>
                        <td className="px-5 py-2.5 text-zinc-400">
                          {ev.message}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-zinc-400">
                          {ev.count}
                        </td>
                        <td className="px-5 py-2.5 whitespace-nowrap text-zinc-500">
                          {relativeAge(ev.lastSeen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
