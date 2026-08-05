import { ListensRecorder } from "@/components/ListensRecorder";

export default function AddRecordPage() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
          Add · Record
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          Record
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Capture a short reflection with your mic. CLara transcribes it into
          a Commons transcript (Listens v1 — about 15 minutes max).
        </p>
      </div>

      <ListensRecorder />
    </div>
  );
}
