/** User-facing hint when 0035 has not been applied yet. */
export const TRASH_MIGRATION_HINT =
  "Trash needs migration 0035_soft_delete_trash.sql in the Supabase SQL editor.";

export function isMissingTrashSchemaError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("deleted_at") ||
    lower.includes("deleted_by") ||
    (lower.includes("schema cache") && lower.includes("deleted"))
  );
}

export function trashSchemaError(message: string | undefined): string {
  if (isMissingTrashSchemaError(message)) {
    return TRASH_MIGRATION_HINT;
  }
  return message?.trim() || "Something went wrong.";
}
