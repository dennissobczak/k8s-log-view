"use client";

import { useState } from "react";
import type { NodeInfo } from "../lib/k8s";
import AutoRefreshToggle from "./AutoRefreshToggle";

function statusStyles(status: string): string {
  switch (status) {
    case "Ready":
      return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
    case "NotReady":
      return "bg-rose-500/10 text-rose-400 ring-rose-500/30";
    default:
      return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
  }
}

function relativeAge(createdAt: string | null): string {
  if (!createdAt) return "—";
  const start = new Date(createdAt).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export default function NodeTable({ nodes }: { nodes: NodeInfo[] }) {
  const [nodeFilter, setNodeFilter] = useState<string>("");
  const query = nodeFilter.trim().toLowerCase();
  const visibleNodes = nodes.filter(
    (n) => !query || n.name.toLowerCase().includes(query)
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Node
          <input
            type="text"
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            placeholder="Filter by name…"
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-600 focus:border-sky-500"
          />
        </label>
        <span className="text-xs text-zinc-500">
          {visibleNodes.length} node{visibleNodes.length === 1 ? "" : "s"}
        </span>
        <AutoRefreshToggle className="ml-auto" />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-2xl shadow-black/40 backdrop-blur">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Roles</th>
              <th className="px-5 py-3 font-medium">Version</th>
              <th className="px-5 py-3 font-medium">Internal IP</th>
              <th className="px-5 py-3 font-medium">CPU</th>
              <th className="px-5 py-3 font-medium">Memory</th>
              <th className="px-5 py-3 font-medium">OS</th>
              <th className="px-5 py-3 font-medium">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {visibleNodes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-12 text-center text-zinc-500">
                  No nodes found.
                </td>
              </tr>
            ) : (
              visibleNodes.map((node) => (
                <tr key={node.name} className="transition-colors hover:bg-zinc-800/40">
                  <td className="px-5 py-3 font-mono text-zinc-100">
                    {node.name}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusStyles(
                        node.status
                      )}`}
                    >
                      {node.status}
                    </span>
                    {!node.schedulable && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30">
                        SchedulingDisabled
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-zinc-400">
                    {node.roles.join(", ")}
                  </td>
                  <td className="px-5 py-3 font-mono text-zinc-300">
                    {node.version}
                  </td>
                  <td className="px-5 py-3 font-mono text-zinc-400">
                    {node.internalIP}
                  </td>
                  <td className="px-5 py-3 font-mono text-zinc-300">
                    {node.cpu}
                  </td>
                  <td className="px-5 py-3 font-mono text-zinc-300">
                    {node.memory}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">{node.osImage}</td>
                  <td className="px-5 py-3 text-zinc-400">
                    {relativeAge(node.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
