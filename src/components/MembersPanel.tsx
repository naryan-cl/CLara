"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMember,
  removeMember,
  changeMemberRole,
} from "@/app/(app)/admin/actions";
import type { StreamMember } from "@/lib/streams/list-members";

export function MembersPanel({
  members,
  currentUserId,
}: {
  members: StreamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAddSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await addMember(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  function onRemove(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onToggleRole(userId: string, currentRole: "admin" | "member") {
    setError(null);
    const nextRole = currentRole === "admin" ? "member" : "admin";
    startTransition(async () => {
      const result = await changeMemberRole(userId, nextRole);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onAddSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Add member by email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="name@cultivatingleadership.com"
            className="w-72 rounded-md border border-cloud bg-sand px-3 py-2 text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-forest px-4 py-2 text-sm font-medium text-paper disabled:opacity-60"
        >
          Add
        </button>
      </form>
      <p className="text-xs text-ink/40">
        Only works for people who&apos;ve already signed in to CLara at least
        once — this doesn&apos;t send an invite email.
      </p>

      {error ? <p className="font-mono text-sm text-danger">{error}</p> : null}

      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex items-center justify-between gap-4 border-b border-cloud pb-3 last:border-0 last:pb-0"
          >
            <div>
              <p className="text-sm text-ink">{member.email}</p>
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
                {member.role}
                {member.user_id === currentUserId ? " · you" : ""}
              </p>
            </div>
            {member.user_id === currentUserId ? null : (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onToggleRole(member.user_id, member.role)}
                  className="rounded-md border border-cloud px-3 py-1.5 text-xs text-ink/70 hover:text-ink disabled:opacity-60"
                >
                  Make {member.role === "admin" ? "member" : "admin"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onRemove(member.user_id)}
                  className="rounded-md border border-cloud px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
