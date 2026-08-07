#!/usr/bin/env python3
"""
Resize curated nature sprites into public/map-sprites/ for the Knowledge Map.

Why: the raw Sprites/extracted_* icons are large contour crops. The map only
needs ~80px transparent PNGs. This script builds those once so the browser
loads small static files instead of the multi‑MB source sheets.

Pools (locked product mapping):
  Atom      ← extracted_mushrooms1
  Framework ← extracted_cacti1
  Concept   ← flowering plants from plants1–3 (non-green chroma ≥ 8%)
  Theme     ← leafy / green plants from plants1–3

Usage (from repo root):
  python3 scripts/prepare-map-sprites.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow is required: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "Sprites"
OUT = ROOT / "public" / "map-sprites"
MAX_SIDE = 80
FLOWER_THRESHOLD = 0.08


def clear_dir(path: Path) -> None:
    if path.exists():
        for child in path.iterdir():
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                for nested in child.rglob("*"):
                    if nested.is_file():
                        nested.unlink()
                for nested in sorted(child.rglob("*"), reverse=True):
                    if nested.is_dir():
                        nested.rmdir()
                child.rmdir()
    path.mkdir(parents=True, exist_ok=True)


def flower_ratio(path: Path) -> float:
    """Share of opaque pixels that look like petals (pink/red/yellow/blue)."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    assert px is not None
    w, h = im.size
    flower = n = 0
    step = max(1, min(w, h) // 80)
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a <= 40:
                continue
            n += 1
            if g >= r - 10 and g >= b - 10 and g > 60:
                continue
            if r > g + 15 and r > b + 10 and r > 80:
                flower += 1
            elif b > r + 15 and b > g + 10 and b > 80:
                flower += 1
            elif r > 140 and g > 120 and b < 100 and r > b + 30:
                flower += 1
            elif r > 90 and b > 90 and g < min(r, b) - 10:
                flower += 1
    return (flower / n) if n else 0.0


def resize_contain(src: Path, dest: Path, max_side: int = MAX_SIDE) -> None:
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    scale = min(max_side / w, max_side / h, 1.0)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (max_side, max_side), (0, 0, 0, 0))
    canvas.paste(im, ((max_side - nw) // 2, (max_side - nh) // 2), im)
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG", optimize=True)


def write_pool(type_name: str, sources: list[Path], folder: str) -> list[str]:
    out_dir = OUT / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i, src in enumerate(sources):
        rel = f"{folder}/icon_{i:02d}.png"
        resize_contain(src, OUT / rel)
        paths.append(rel)
    print(f"{type_name}: {len(paths)} → public/map-sprites/{folder}/")
    return paths


def main() -> None:
    required = [
        SPRITES / "extracted_mushrooms1",
        SPRITES / "extracted_cacti1",
        SPRITES / "extracted_plants1",
        SPRITES / "extracted_plants2",
        SPRITES / "extracted_plants3",
    ]
    missing = [str(p) for p in required if not p.is_dir()]
    if missing:
        print("Missing extracted folders:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        sys.exit(1)

    clear_dir(OUT)

    atom_sources = sorted((SPRITES / "extracted_mushrooms1").glob("icon_*.png"))
    framework_sources = sorted((SPRITES / "extracted_cacti1").glob("icon_*.png"))

    concept_sources: list[Path] = []
    theme_sources: list[Path] = []
    for sheet in ("extracted_plants1", "extracted_plants2", "extracted_plants3"):
        for src in sorted((SPRITES / sheet).glob("icon_*.png")):
            if flower_ratio(src) >= FLOWER_THRESHOLD:
                concept_sources.append(src)
            else:
                theme_sources.append(src)

    manifest = {
        "Atom": write_pool("Atom", atom_sources, "atom"),
        "Concept": write_pool("Concept", concept_sources, "concept"),
        "Framework": write_pool("Framework", framework_sources, "framework"),
        "Theme": write_pool("Theme", theme_sources, "theme"),
    }

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {OUT / 'manifest.json'}")


if __name__ == "__main__":
    main()
