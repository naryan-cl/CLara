import { redirect } from "next/navigation";

/**
 * `/sessions` used to be the contribution hub (Receives + Listens).
 * That lives under Add now; Commons is the repository. Keep nested
 * archive / harvest / document routes as deep links.
 */
export default function SessionsRedirectPage() {
  redirect("/commons");
}
