/** Parse sessionIds from FormData (comma-separated or repeated keys). */
export function parseSessionIdsFromFormData(formData: FormData): string[] {
  return parseIdListFromFormData(formData, "sessionIds", 3);
}

/** Parse a comma-separated / repeated FormData id list. */
export function parseIdListFromFormData(
  formData: FormData,
  key: string,
  max = 8,
): string[] {
  const raw = formData.getAll(key);
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    for (const part of value.split(",")) {
      const id = part.trim();
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)].slice(0, max);
}
