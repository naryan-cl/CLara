/** Parse sessionIds from FormData (comma-separated or repeated keys). */
export function parseSessionIdsFromFormData(formData: FormData): string[] {
  const raw = formData.getAll("sessionIds");
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    for (const part of value.split(",")) {
      const id = part.trim();
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)].slice(0, 3);
}
