/** Max segments for a single Listens take (12 min × 20 ≈ 4 hours headroom). */
export const MAX_LISTENS_SEGMENTS = 20;

/** Soft MediaRecorder restart interval (must match ListensRecorder). */
export const LISTENS_SEGMENT_SECONDS = 12 * 60;

/** Match Record’s capture bitrate when compressing a large uploaded file. */
export const LISTENS_BITRATE = 32_000;

/**
 * Don’t try to decode multi-GB video dumps in the browser. A 3-hour
 * compressed Voice Memo / Zoom file is well under this.
 */
export const LISTENS_MAX_SOURCE_BYTES = 512 * 1024 * 1024;
