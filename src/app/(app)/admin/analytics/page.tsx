import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { getStreamAnalytics } from "@/lib/analytics/get-stream-analytics";
import { getActiveStream } from "@/lib/streams/get-active-stream";

export default async function AdminAnalyticsPage() {
  const { stream } = await getActiveStream();

  if (!stream) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          No active stream — join a stream to see analytics.
        </p>
      </div>
    );
  }

  if (stream.role !== "admin") {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="text-sm text-ink/70">
          Analytics is only visible to admins of {stream.name}.
        </p>
      </div>
    );
  }

  const { data, error } = await getStreamAnalytics(stream.id, "30d");

  if (error || !data) {
    return (
      <div className="rounded-lg border border-cloud bg-paper p-6 shadow-soft">
        <p className="font-mono text-sm text-danger">
          {error ?? "Could not load analytics."}
        </p>
      </div>
    );
  }

  return (
    <AnalyticsDashboard streamName={stream.name} initialData={data} />
  );
}
