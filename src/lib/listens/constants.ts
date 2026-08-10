/** Max segments for a single Listens take (12 min × 20 ≈ 4 hours headroom). */
export const MAX_LISTENS_SEGMENTS = 20;

/** Soft MediaRecorder restart interval (must match ListensRecorder). */
export const LISTENS_SEGMENT_SECONDS = 12 * 60;
