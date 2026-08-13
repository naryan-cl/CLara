/**
 * Who may edit a Session (name, inquiry, description, date).
 * Matches PRD: host (created_by), attendees, stream admins — plus authors of
 * nested documents so OKF-created gatherings (often `created_by` null) are
 * still fixable by the person who uploaded into them.
 */
export function canEditSession(input: {
  userId: string;
  createdBy: string | null;
  isAdmin: boolean;
  attending: boolean;
  nestedAuthorIds?: (string | null)[];
}): boolean {
  if (input.isAdmin) return true;
  if (input.createdBy && input.createdBy === input.userId) return true;
  if (input.attending) return true;
  if (input.nestedAuthorIds?.some((id) => id === input.userId)) return true;
  return false;
}
