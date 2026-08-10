"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import {
  BreakdownList,
  CreationsStackedChart,
  StatCard,
  TimeseriesChart,
  ANALYTICS_COLORS,
} from "@/components/admin/AnalyticsCharts";
import { addDays, rangeDurationDays } from "@/lib/analytics/range";
import type {
  AnalyticsRangePreset,
  StreamAnalyticsData,
} from "@/lib/analytics/types";

const RANGE_OPTIONS: { value: AnalyticsRangePreset; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

function formatRangeLabel(startKey: string | null, endKey: string) {
  if (!startKey) return endKey;
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function AnalyticsDashboard({
  streamName,
  initialData,
}: {
  streamName: string;
  initialData: StreamAnalyticsData;
}) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(
    (range: AnalyticsRangePreset, endKey?: string | null) => {
      startTransition(async () => {
        setError(null);
        try {
          const params = new URLSearchParams({ range });
          if (endKey && range !== "all") {
            params.set("end", endKey);
          }
          const res = await fetch(
            `/api/admin/analytics/timeseries?${params.toString()}`,
          );
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(body?.error ?? `Request failed (${res.status})`);
          }
          const next = (await res.json()) as StreamAnalyticsData;
          setData(next);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to load analytics",
          );
        }
      });
    },
    [],
  );

  const shiftPeriod = useCallback(
    (direction: -1 | 1) => {
      if (data.range === "all") return;
      const duration = rangeDurationDays(data.range);
      if (!duration) return;
      const nextEnd = addDays(data.endKey, direction * duration);
      load(data.range, nextEnd);
    },
    [data.endKey, data.range, load],
  );

  const { summary } = data;
  const showShift = data.range !== "all";

  const nodeItems = Object.entries(summary.nodesByType)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const themeItems = Object.entries(summary.themePicks)
    .map(([label, value]) => ({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      value,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink/55">
            <Link href="/admin" className="text-horizon underline-offset-2 hover:underline">
              Admin
            </Link>
            <span className="mx-1.5 text-ink/30">/</span>
            Analytics
          </p>
          <h1 className="mt-1 font-display text-2xl font-medium text-ink">
            Analytics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/60">
            Stream-scoped Commons, membership, and graph pulse for {streamName}.
            Site-wide pageviews live in the Vercel Analytics dashboard.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={isPending}
                onClick={() => load(option.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  data.range === option.value
                    ? "border-ink bg-ink text-paper"
                    : "border-cloud bg-paper text-ink hover:border-ink/40"
                } disabled:opacity-60`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-ink/55">
            {showShift ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => shiftPeriod(-1)}
                className="rounded border border-cloud px-2 py-0.5 hover:border-ink/40 disabled:opacity-60"
                aria-label="Previous period"
              >
                ‹
              </button>
            ) : null}
            <span>
              {formatRangeLabel(data.startKey, data.endKey)}
              {isPending ? " · loading…" : ""}
            </span>
            {showShift ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => shiftPeriod(1)}
                className="rounded border border-cloud px-2 py-0.5 hover:border-ink/40 disabled:opacity-60"
                aria-label="Next period"
              >
                ›
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <p className="font-mono text-sm text-danger">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={summary.members} hint={`${summary.admins} admins`} />
        <StatCard
          label="Documents"
          value={summary.documents}
          hint={`${summary.submitted} submitted · ${summary.drafts} drafts`}
        />
        <StatCard
          label="Public / Private"
          value={`${summary.publicDocs} / ${summary.privateDocs}`}
        />
        <StatCard
          label="Needs review"
          value={summary.needsReview}
        />
        <StatCard label="Sessions" value={summary.sessions} />
        <StatCard label="Attendance marks" value={summary.attendanceMarks} />
        <StatCard label="Comments" value={summary.comments} />
        <StatCard
          label="Graph"
          value={`${summary.nodes} / ${summary.edges}`}
          hint="nodes / edges"
        />
      </div>

      <CreationsStackedChart
        title="Creations over time by type"
        data={data.creationsByType}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <TimeseriesChart
          title="Documents created"
          data={data.documentsOverTime}
          color={ANALYTICS_COLORS.upload}
        />
        <TimeseriesChart
          title="Sessions created"
          data={data.sessionsOverTime}
          color={ANALYTICS_COLORS.session}
        />
        <TimeseriesChart
          title="Members joined"
          data={data.membersOverTime}
          color={ANALYTICS_COLORS.chat}
        />
        <TimeseriesChart
          title="Knowledge Map nodes extracted"
          data={data.nodesOverTime}
          color={ANALYTICS_COLORS.record}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownList title="Nodes by type" items={nodeItems} />
        <BreakdownList title="Active map themes" items={themeItems} />
      </div>
    </div>
  );
}
