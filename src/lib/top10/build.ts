import { loadTop10Inputs } from "./load";
import { rankTop10 } from "./rank";
import type { Top10Board } from "./types";

/**
 * Build the Top 10 board for one stream (load + rank).
 * UI stays thin: this is the only function the page needs to call.
 */
export async function buildStreamTop10(streamId: string): Promise<{
  board: Top10Board | null;
  error: string | null;
}> {
  const loaded = await loadTop10Inputs(streamId);
  if (loaded.error) {
    return { board: null, error: loaded.error };
  }

  return {
    board: rankTop10({
      documents: loaded.documents,
      sessions: loaded.sessions,
      graph: loaded.graph,
    }),
    error: null,
  };
}
