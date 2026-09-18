"use client";

type InquiryMode = "simple" | "guided";

type Props = {
  mode: InquiryMode;
  onModeChange: (mode: InquiryMode) => void;
  inquiry: string;
  onInquiryChange: (value: string) => void;
  welcome: string;
  onWelcomeChange: (value: string) => void;
  questions: string[];
  onQuestionsChange: (questions: string[]) => void;
  /** When true, render hidden inputs for form posts (SessionEditor). */
  formFields?: boolean;
};

/**
 * Simple inquiry textarea vs guided welcome + ordered questions.
 */
export function GuidedInquiryFields({
  mode,
  onModeChange,
  inquiry,
  onInquiryChange,
  welcome,
  onWelcomeChange,
  questions,
  onQuestionsChange,
  formFields = false,
}: Props) {
  function updateQuestion(index: number, value: string) {
    onQuestionsChange(
      questions.map((q, i) => (i === index ? value : q)),
    );
  }

  function addQuestion() {
    onQuestionsChange([...questions, ""]);
  }

  function removeQuestion(index: number) {
    if (questions.length <= 1) {
      onQuestionsChange([""]);
      return;
    }
    onQuestionsChange(questions.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {formFields ? (
        <>
          <input type="hidden" name="inquiryMode" value={mode} />
          <input type="hidden" name="reflectWelcome" value={welcome} />
          <input
            type="hidden"
            name="reflectQuestions"
            value={questions.join("\n")}
          />
          {mode === "simple" ? (
            <input type="hidden" name="seedQuestion" value={inquiry} />
          ) : null}
        </>
      ) : null}

      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="sr-only">Inquiry mode</legend>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="inquiryModeRadio"
            checked={mode === "simple"}
            onChange={() => onModeChange("simple")}
          />
          <span className="font-medium text-ink">Simple inquiry</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="inquiryModeRadio"
            checked={mode === "guided"}
            onChange={() => {
              onModeChange("guided");
              if (questions.length === 0) {
                onQuestionsChange([inquiry.trim() || ""]);
              }
            }}
          />
          <span className="font-medium text-ink">Guided reflection</span>
        </label>
      </fieldset>

      {mode === "simple" ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Inquiry (optional)</span>
          <textarea
            value={inquiry}
            onChange={(e) => onInquiryChange(e.target.value)}
            rows={3}
            className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
            placeholder="What felt most alive today?"
          />
        </label>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Welcome (optional)</span>
            <textarea
              value={welcome}
              onChange={(e) => onWelcomeChange(e.target.value)}
              rows={3}
              className="rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
              placeholder="A short intro before the first question…"
            />
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <span className="font-medium text-ink">Questions</span>
            <p className="text-xs text-ink/50">
              Explored one at a time in Reflect. At least one is required.
            </p>
            {questions.map((question, index) => (
              <div key={index} className="flex gap-2">
                <span className="mt-2 w-6 shrink-0 font-mono text-xs text-ink/40">
                  {index + 1}.
                </span>
                <textarea
                  value={question}
                  onChange={(e) => updateQuestion(index, e.target.value)}
                  rows={2}
                  required={index === 0}
                  className="min-w-0 flex-1 rounded-md border border-cloud bg-sand px-3 py-2 text-ink outline-none focus:border-horizon"
                  placeholder="Question for participants…"
                />
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="mt-1 self-start rounded-md px-2 py-1 text-xs text-ink/50 hover:bg-cloud/60 hover:text-ink"
                  aria-label={`Remove question ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addQuestion}
              className="self-start rounded-md border border-cloud px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-horizon hover:text-ink"
            >
              Add question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export type { InquiryMode };
