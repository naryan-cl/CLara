"use client";

import type { TimeseriesPoint } from "@/lib/analytics/types";

/** Solid hex — SVG charts don't resolve CSS vars reliably in all browsers. */
export const ANALYTICS_COLORS = {
  chat: "#5B8A72",
  record: "#C46B4A",
  upload: "#2F4F3E",
  session: "#4A7C9B",
  other: "#8A8578",
  line: "#2F4F3E",
  axis: "#6B6560",
  grid: "#E5DFD3",
} as const;

function formatTick(dateKey: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-cloud bg-paper p-4 shadow-soft">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/45">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-medium text-ink">
        {typeof value === "number"
          ? new Intl.NumberFormat("en-CA").format(value)
          : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

export function TimeseriesChart({
  title,
  data,
  color = ANALYTICS_COLORS.line,
  emptyLabel = "No activity in this period",
}: {
  title: string;
  data: TimeseriesPoint[];
  color?: string;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...data.map((p) => p.value));
  const hasValues = max > 0;
  const width = 560;
  const height = 180;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const points = data.map((point, index) => {
    const x =
      data.length <= 1
        ? padL + plotW / 2
        : padL + (index / (data.length - 1)) * plotW;
    const y =
      padT + plotH - (max > 0 ? (point.value / max) * plotH : 0);
    return { ...point, x, y };
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const tickIndexes =
    data.length <= 6
      ? data.map((_, i) => i)
      : [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <div className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <div className="mt-3 w-full" role="img" aria-label={title}>
        {!hasValues ? (
          <div className="flex h-44 items-center justify-center text-sm text-ink/50">
            {emptyLabel}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-44 w-full"
            preserveAspectRatio="none"
          >
            {[0, 0.5, 1].map((t) => {
              const y = padT + plotH * (1 - t);
              return (
                <line
                  key={t}
                  x1={padL}
                  x2={width - padR}
                  y1={y}
                  y2={y}
                  stroke={ANALYTICS_COLORS.grid}
                  strokeDasharray="4 4"
                />
              );
            })}
            <path d={path} fill="none" stroke={color} strokeWidth={2.5} />
            {data.length <= 45
              ? points.map((p) => (
                  <circle
                    key={p.date}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill={color}
                  />
                ))
              : null}
            {tickIndexes.map((i) => {
              const p = points[i];
              if (!p) return null;
              return (
                <text
                  key={p.date}
                  x={p.x}
                  y={height - 8}
                  textAnchor="middle"
                  fill={ANALYTICS_COLORS.axis}
                  fontSize={10}
                >
                  {formatTick(p.date)}
                </text>
              );
            })}
            <text
              x={8}
              y={padT + 4}
              fill={ANALYTICS_COLORS.axis}
              fontSize={10}
            >
              {max}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}

type StackedRow = {
  date: string;
  chat: number;
  record: number;
  upload: number;
  session: number;
  other: number;
};

const STACK_KEYS = [
  "chat",
  "record",
  "upload",
  "session",
  "other",
] as const;

export function CreationsStackedChart({
  title,
  data,
}: {
  title: string;
  data: StackedRow[];
}) {
  const totals = data.map(
    (row) =>
      row.chat + row.record + row.upload + row.session + row.other,
  );
  const max = Math.max(0, ...totals);
  const hasValues = max > 0;
  const width = 560;
  const height = 200;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barGap = data.length > 40 ? 1 : 2;
  const barW =
    data.length === 0
      ? 0
      : Math.max(2, plotW / data.length - barGap);

  return (
    <div className="rounded-lg border border-cloud bg-paper p-4 shadow-soft sm:p-5">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink/60">
        {STACK_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: ANALYTICS_COLORS[key] }}
            />
            {key === "chat"
              ? "Reflect"
              : key === "record"
                ? "Record"
                : key === "upload"
                  ? "Upload"
                  : key === "session"
                    ? "Session"
                    : "Other"}
          </span>
        ))}
      </div>
      <div className="mt-3 w-full" role="img" aria-label={title}>
        {!hasValues ? (
          <div className="flex h-48 items-center justify-center text-sm text-ink/50">
            No creations in this period
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-48 w-full"
            preserveAspectRatio="none"
          >
            {data.map((row, index) => {
              const x = padL + index * (barW + barGap);
              let y = padT + plotH;
              return (
                <g key={row.date}>
                  {STACK_KEYS.map((key) => {
                    const value = row[key];
                    if (value <= 0) return null;
                    const h = (value / max) * plotH;
                    y -= h;
                    return (
                      <rect
                        key={key}
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        fill={ANALYTICS_COLORS[key]}
                      />
                    );
                  })}
                </g>
              );
            })}
            {data.length > 0 ? (
              <>
                <text
                  x={padL}
                  y={height - 10}
                  fill={ANALYTICS_COLORS.axis}
                  fontSize={10}
                >
                  {formatTick(data[0]!.date)}
                </text>
                <text
                  x={width - padR}
                  y={height - 10}
                  textAnchor="end"
                  fill={ANALYTICS_COLORS.axis}
                  fontSize={10}
                >
                  {formatTick(data[data.length - 1]!.date)}
                </text>
              </>
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}

export function BreakdownList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="rounded-lg border border-cloud bg-paper p-4 shadow-soft">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink/50">Nothing yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-ink/80">{item.label}</span>
                <span className="font-mono text-ink/55">{item.value}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
                <div
                  className="h-full rounded-full bg-sage"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
