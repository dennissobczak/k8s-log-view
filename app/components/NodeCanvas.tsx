"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeInfo, PodInfo } from "../lib/k8s";
import AutoRefreshToggle from "./AutoRefreshToggle";

// Node-card geometry (CSS pixels). Cards have a fixed width and a height that
// grows with the number of pods scheduled on the node.
const CARD_W = 300;
const HEADER_H = 52;
const CARD_PAD = 14;
const GAP = 20; // gap between node cards
const OUTER_PAD = 4; // canvas padding so highlight rings aren't clipped

// Pod-object geometry, laid out in a grid inside each node card.
const POD = 22;
const POD_GAP = 7;

const COLORS = {
  card: "#18181b", // zinc-900
  border: "#27272a", // zinc-800
  text: "#f4f4f5", // zinc-100
  subtle: "#a1a1aa", // zinc-400
  faint: "#71717a", // zinc-500
};

function nodeAccent(node: NodeInfo): string {
  if (node.status === "Ready") return "#10b981"; // emerald-500
  if (node.status === "NotReady") return "#f43f5e"; // rose-500
  return "#a1a1aa"; // zinc-400 (Unknown)
}

// A pod's color reflects its health: green when Running and fully ready, blue
// when it has completed, amber while it's coming up, red when it has failed.
function podColor(pod: PodInfo): string {
  if (pod.phase === "Succeeded") return "#38bdf8"; // sky-400
  if (pod.phase === "Running") {
    const [ready, total] = pod.ready.split("/").map(Number);
    return total > 0 && ready === total ? "#10b981" : "#f59e0b"; // emerald / amber
  }
  if (pod.phase === "Pending") return "#f59e0b"; // amber-500
  return "#f43f5e"; // Failed / Unknown → rose-500
}

// Pods reachable through a node grid: how many fit per row inside a card.
const POD_COLS = Math.max(
  1,
  Math.floor((CARD_W - CARD_PAD * 2 + POD_GAP) / (POD + POD_GAP))
);

function cardHeight(podCount: number): number {
  const rows = Math.max(1, Math.ceil(podCount / POD_COLS));
  const body = rows * POD + (rows - 1) * POD_GAP;
  return HEADER_H + CARD_PAD + body + CARD_PAD;
}

type PodHit = { x: number; y: number; pod: PodInfo };

export default function NodeCanvas({
  nodes,
  pods,
}: {
  nodes: NodeInfo[];
  pods: PodInfo[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<PodInfo | null>(null);
  const hitsRef = useRef<PodHit[]>([]);

  // Track container width so the node cards reflow responsively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Group pods by their scheduling node. Pods with no node (unscheduled) are
    // omitted — they don't belong to any node object on the canvas.
    const podsByNode = new Map<string, PodInfo[]>();
    for (const pod of pods) {
      if (!pod.node) continue;
      const list = podsByNode.get(pod.node);
      if (list) list.push(pod);
      else podsByNode.set(pod.node, [pod]);
    }

    const cols = Math.max(
      1,
      Math.floor((width - OUTER_PAD * 2 + GAP) / (CARD_W + GAP))
    );

    // Place cards row by row; each row is as tall as its tallest card.
    type Placed = { node: NodeInfo; nodePods: PodInfo[]; x: number; top: number; h: number };
    const placed: Placed[] = [];
    let y = OUTER_PAD;
    let rowMaxH = 0;
    nodes.forEach((node, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) {
        y += rowMaxH + GAP;
        rowMaxH = 0;
      }
      const nodePods = (podsByNode.get(node.name) ?? []).slice().sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      const h = cardHeight(nodePods.length);
      rowMaxH = Math.max(rowMaxH, h);
      placed.push({
        node,
        nodePods,
        x: OUTER_PAD + col * (CARD_W + GAP),
        top: y,
        h,
      });
    });
    const cssHeight = y + rowMaxH + OUTER_PAD;

    // Scale the backing store for crisp rendering on HiDPI displays.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, cssHeight);

    const hits: PodHit[] = [];

    for (const { node, nodePods, x, top: cardY, h } of placed) {
      const accent = nodeAccent(node);

      // Card body.
      ctx.beginPath();
      ctx.roundRect(x, cardY, CARD_W, h, 12);
      ctx.fillStyle = COLORS.card;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.border;
      ctx.stroke();

      // Status accent bar down the left edge.
      ctx.beginPath();
      ctx.roundRect(x, cardY, 5, h, 12);
      ctx.fillStyle = accent;
      ctx.fill();

      // Header: node name + status dot + pod count.
      const left = x + 18;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.beginPath();
      ctx.arc(left + 4, cardY + 22, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.fillStyle = COLORS.text;
      ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
      ctx.fillText(fit(ctx, node.name, CARD_W - 90), left + 16, cardY + 22);

      ctx.fillStyle = COLORS.faint;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(
        `${nodePods.length} pod${nodePods.length === 1 ? "" : "s"}`,
        x + CARD_W - 14,
        cardY + 22
      );
      ctx.textAlign = "left";

      // Divider under the header.
      ctx.beginPath();
      ctx.moveTo(x + 14, cardY + HEADER_H - 8);
      ctx.lineTo(x + CARD_W - 14, cardY + HEADER_H - 8);
      ctx.strokeStyle = COLORS.border;
      ctx.stroke();

      // Pods as objects in a grid.
      if (nodePods.length === 0) {
        ctx.fillStyle = COLORS.faint;
        ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText("No pods scheduled", left, cardY + HEADER_H + 12);
      } else {
        const gridX = x + CARD_PAD;
        const gridY = cardY + HEADER_H;
        nodePods.forEach((pod, i) => {
          const pc = i % POD_COLS;
          const pr = Math.floor(i / POD_COLS);
          const px = gridX + pc * (POD + POD_GAP);
          const py = gridY + pr * (POD + POD_GAP);
          const color = podColor(pod);
          const isHover = hovered === pod;

          ctx.beginPath();
          ctx.roundRect(px, py, POD, POD, 5);
          ctx.fillStyle = isHover ? color : color + "33"; // translucent unless hovered
          ctx.fill();
          ctx.lineWidth = isHover ? 2 : 1;
          ctx.strokeStyle = color;
          ctx.stroke();

          hits.push({ x: px, y: py, pod });
        });
      }
    }

    hitsRef.current = hits;
  }, [nodes, pods, width, hovered]);

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitsRef.current.find(
      (h) => mx >= h.x && mx <= h.x + POD && my >= h.y && my <= h.y + POD
    );
    setHovered(hit ? hit.pod : null);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · pods grouped by node
        </span>
        <AutoRefreshToggle className="ml-auto" />
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 shadow-2xl shadow-black/40 backdrop-blur"
      >
        {nodes.length === 0 ? (
          <p className="px-2 py-12 text-center text-sm text-zinc-500">
            No nodes to display.
          </p>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMove}
            onMouseLeave={() => setHovered(null)}
            className="block w-full"
            style={{ cursor: hovered ? "pointer" : "default" }}
          />
        )}
      </div>

      {hovered && (
        <p className="mt-3 font-mono text-xs text-zinc-400">
          {hovered.namespace}/{hovered.name} · {hovered.phase} · {hovered.ready}{" "}
          ready · {hovered.restarts} restart{hovered.restarts === 1 ? "" : "s"}
        </p>
      )}
    </>
  );
}

// Truncate text with an ellipsis so it never overflows the given width.
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let str = text;
  while (str.length > 1 && ctx.measureText(str + "…").width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + "…";
}
