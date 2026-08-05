import { ChatForm } from "@/components/ChatForm";

export default function AddChatPage() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/40">
          Add · Chat
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">
          CLara Chatbot
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">
          Solo, reflective conversation with CLara. This is separate from Ask
          CLara — it doesn&apos;t search the Commons, and nothing you say here
          is saved unless you choose to save it.
        </p>
      </div>

      <ChatForm />
    </div>
  );
}
