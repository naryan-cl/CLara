/**
 * Tiny seeded 2D value noise for generative topo wallpapers.
 * Deterministic: same seed → same field (SSR-safe if called with same args).
 */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(ix: number, iy: number, seed: number): number {
  let n = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Value noise in [0, 1]. `x`/`y` are in "cell" space (frequency applied by caller).
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);

  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/** Fractal Brownian motion — layered noise for rolling hills. */
export function fbm2D(
  x: number,
  y: number,
  seed: number,
  octaves = 4,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function seedFromString(seed: string): number {
  return hashString(seed) || 1;
}
