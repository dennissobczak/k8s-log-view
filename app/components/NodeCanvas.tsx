"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeInfo } from "../lib/k8s";
import AutoRefreshToggle from "./AutoRefreshToggle";

// Card geometry (CSS pixels). Nodes are laid out in a responsive grid whose
// column count is derived from the available canvas width.
const CARD_W = 240;
const CARD_H = 132;
const GAP = 20;
const PAD = 4; // inner padding so highlight rings aren't clipped at the edges

// Theme colors (kept in sync with the Tailwind zinc/status palette used elsewhere).
const COLORS = {
  bg: "#09090b", // zinc-950
  card: "#18181b", // zinc-900
  cardHover: "#1f1f23",
  text: "#f4f4f5", // zinc-100
  subtle: "#a1a1aa", // zinc-400
  faint: "#71717a", // zinc-500
  amber: "#f59e0b",
};

function statusColor(node: NodeInfo): string {
  if (node.status === "Ready") return "#10b981"; // emerald-500
  if (node.status === "NotReady") return "#f43f5e"; // rose-500
  return "#a1a1aa"; // zinc-400 (Unknown)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export default function NodeCanvas({ nodes }: { nodes: NodeInfo[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  // Card hit-boxes in CSS pixels, recomputed on every draw for hover testing.
  const rectsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);

  // Track the container width so the grid reflows responsively.
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

  // Draw whenever the data, size, or hover target changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = Math.max(1, Math.floor((width - PAD * 2 + GAP) / (CARD_W + GAP)));
    const rows = Math.max(1, Math.ceil(nodes.length / cols));
    const cssHeight = rows * CARD_H + (rows - 1) * GAP + PAD * 2;

    // Scale the backing store for crisp text on HiDPI displays.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, cssHeight);

    const rects: { x: number; y: number; w: number; h: number }[] = [];

    nodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (CARD_W + GAP);
      const y = PAD + row * (CARD_H + GAP);
      rects.push({ x, y, w: CARD_W, h: CARD_H });

      const accent = statusColor(node);
      const isHover = hovered === i;

      // Card body.
      roundRect(ctx, x, y, CARD_W, CARD_H, 12);
      ctx.fillStyle = isHover ? COLORS.cardHover : COLORS.card;
      ctx.fill();
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.strokeStyle = isHover ? accent : "#27272a"; // zinc-800
      ctx.stroke();

      // Accent bar down the left edge, colored by status.
      roundRect(ctx, x, y, 5, CARD_H, 12);
      ctx.fillStyle = accent;
      ctx.fill();

      const left = x + 18;
      let cy = y + 26;

      // Node name.
      ctx.fillStyle = COLORS.text;
      ctx.font =
        "600 14px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
      ctx.textBaseline = "middle";
      ctx.fillText(fit(ctx, node.name, CARD_W - 36), left, cy);

      // Status dot + label (and cordon note).
      cy += 26;
      ctx.beginPath();
      ctx.arc(left + 4, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = COLORS.subtle;
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      const statusText = node.schedulable
        ? node.status
        : `${node.status} · SchedulingDisabled`;
      ctx.fillStyle = node.schedulable ? COLORS.subtle : COLORS.amber;
      ctx.fillText(fit(ctx, statusText, CARD_W - 52), left + 16, cy);

      // Roles.
      cy += 24;
      ctx.fillStyle = COLORS.faint;
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
      ctx.fillText(fit(ctx, node.roles.join(", "), CARD_W - 36), left, cy);

      // Resources: cpu / memory.
      cy += 22;
      ctx.fillStyle = COLORS.subtle;
      ctx.fillText(
        fit(ctx, `${node.cpu} vCPU · ${node.memory}`, CARD_W - 36),
        left,
        cy
      );

      // Version (right-aligned in the header row).
      ctx.fillStyle = COLORS.faint;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
      ctx.textAlign = "right";
      ctx.fillText(node.version, x + CARD_W - 14, y + 26);
      ctx.textAlign = "left";
    });

    rectsRef.current = rects;
  }, [nodes, width, hovered]);

  function handleMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const idx = rectsRef.current.findIndex(
      (r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
    );
    setHovered(idx === -1 ? null : idx);
  }

  const active = hovered !== null ? nodes[hovered] : null;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} on canvas
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
            style={{ cursor: active ? "pointer" : "default" }}
          />
        )}
      </div>

      {active && (
        <p className="mt-3 font-mono text-xs text-zinc-500">
          {active.name} — {active.internalIP} · {active.osImage}
        </p>
      )}
    </>
  );
}

// Truncate text with an ellipsis so it never overflows the card width.
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let str = text;
  while (str.length > 1 && ctx.measureText(str + "…").width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + "…";
}
