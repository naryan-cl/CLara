import Link from "next/link";

const linkClass = "text-horizon underline-offset-2 hover:underline";

type Props = {
  /** Include a comma before “or” (Reflect, Record, or Upload). */
  oxfordComma?: boolean;
};

/**
 * Inline links to the three single-input Add paths (Reflect / Record / Upload).
 */
export function AddModeLinks({ oxfordComma = true }: Props) {
  return (
    <>
      <Link href="/add/chat" className={linkClass}>
        Reflect
      </Link>
      ,{" "}
      <Link href="/add/record" className={linkClass}>
        Record
      </Link>
      {oxfordComma ? ", or " : " or "}
      <Link href="/add/upload" className={linkClass}>
        Upload
      </Link>
    </>
  );
}
