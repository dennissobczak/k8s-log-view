// Pure-SVG pie chart for the dashboard. No interactivity, so it stays a
// Server Component (no "use client") and pulls in no charting dependency.

export interface HealthSlice {
  label: string;
  value: number;
  /** Slice fill color. */
  color: string;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  // 0° points straight up; angles increase clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export default function HealthPieChart({ slices }: { slices: HealthSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 220;
  const r = size / 2;
  const cx = r;
  const cy = r;

  // The single non-zero slice (100%) can't be drawn as an arc, so fall back
  // to a full circle in that case.
  const nonZero = slices.filter((s) => s.value > 0);
  const single = nonZero.length === 1 ? nonZero[0] : null;

  let cursor = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Pod health distribution"
      >
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} className="fill-zinc-800" />
        ) : single ? (
          <circle cx={cx} cy={cy} r={r} fill={single.color} />
        ) : (
          slices.map((s) => {
            if (s.value <= 0) return null;
            const start = (cursor / total) * 360;
            cursor += s.value;
            const end = (cursor / total) * 360;
            return (
              <path
                key={s.label}
                d={arcPath(cx, cy, r, start, end)}
                fill={s.color}
                stroke="#09090b"
                strokeWidth={2}
              />
            );
          })
        )}
      </svg>

      <ul className="flex flex-col gap-3">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-zinc-300">{s.label}</span>
              <span className="ml-auto font-mono tabular-nums text-zinc-100">
                {pct}%
              </span>
              <span className="font-mono text-xs tabular-nums text-zinc-500">
                ({s.value})
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
