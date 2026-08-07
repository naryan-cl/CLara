"""
Split theme sprite sheets into individual transparent PNGs.

Sheets live under:
  Plant Theme/   Ocean Theme/   Desert theme/

Output:
  extracted/{plant|ocean|desert}/{sheet_slug}/icon_NN.png

Fix vs naive contours: nearby disconnected pieces (bare branches, spaced
coral) are clustered into one icon via morphological close + bbox proximity
merge before cropping.

Alpha: only near-white pixels connected to the crop edge become transparent,
so enclosed white highlights inside the art stay opaque.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import cv2
import numpy as np

# Near-white cutoff for background flood-fill (and box finding).
# Higher (e.g. 248) = only pure white counts as background candidate.
# Lower (e.g. 230) = also treats off-white / light shadows as background.
# Only candidates connected to the crop edge become transparent — see background_alpha().
WHITE_THRESHOLD = 240

# Skip noise / tiny fragments
MIN_BOX = 30

# Padding around each final crop (px)
PADDING = 10

# Morphological close kernel — bridges small gaps inside one icon
CLOSE_KERNEL = 5
CLOSE_ITERATIONS = 1

# Merge contours whose padded boxes are within this gap (px)
MERGE_GAP = 14

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

THEME_FOLDERS: dict[str, str] = {
    "plant": "Plant Theme",
    "ocean": "Ocean Theme",
    "desert": "Desert theme",
}


def sheet_slug(filename: str) -> str:
    """Normalize 'ocean - coral.png' → 'ocean-coral'."""
    base = os.path.splitext(os.path.basename(filename))[0]
    base = base.strip().lower()
    base = re.sub(r"[\s_]+", "-", base)
    base = re.sub(r"-+", "-", base)
    return base


def boxes_near(a: tuple[int, int, int, int], b: tuple[int, int, int, int], gap: int) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ax2, ay2 = ax + aw, ay + ah
    bx2, by2 = bx + bw, by + bh
    # Expand each box by gap, then test overlap
    return not (
        ax2 + gap < bx
        or bx2 + gap < ax
        or ay2 + gap < by
        or by2 + gap < ay
    )


def union_box(
    a: tuple[int, int, int, int], b: tuple[int, int, int, int]
) -> tuple[int, int, int, int]:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1 = min(ax, bx)
    y1 = min(ay, by)
    x2 = max(ax + aw, bx + bw)
    y2 = max(ay + ah, by + bh)
    return (x1, y1, x2 - x1, y2 - y1)


def merge_nearby_boxes(
    boxes: list[tuple[int, int, int, int]], gap: int
) -> list[tuple[int, int, int, int]]:
    """Union-find style merge of boxes that are within `gap` of each other."""
    if not boxes:
        return []
    if gap <= 0:
        return list(boxes)
    n = len(boxes)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    for i in range(n):
        for j in range(i + 1, n):
            if boxes_near(boxes[i], boxes[j], gap):
                union(i, j)

    groups: dict[int, tuple[int, int, int, int]] = {}
    for i, box in enumerate(boxes):
        root = find(i)
        if root not in groups:
            groups[root] = box
        else:
            groups[root] = union_box(groups[root], box)

    return list(groups.values())


def find_icon_boxes(
    gray: np.ndarray,
    white_threshold: int,
    use_morph: bool,
    merge_gap: int,
) -> list[tuple[int, int, int, int]]:
    _, thresh = cv2.threshold(
        gray, white_threshold, 255, cv2.THRESH_BINARY_INV
    )
    work = thresh
    if use_morph:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (CLOSE_KERNEL, CLOSE_KERNEL)
        )
        work = cv2.morphologyEx(
            thresh, cv2.MORPH_CLOSE, kernel, iterations=CLOSE_ITERATIONS
        )

    contours, _ = cv2.findContours(
        work, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    raw_boxes: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        if w > MIN_BOX and h > MIN_BOX:
            raw_boxes.append((x, y, w, h))
    return merge_nearby_boxes(raw_boxes, merge_gap)


def sheet_swallowed(
    boxes: list[tuple[int, int, int, int]], w_img: int, h_img: int
) -> bool:
    """True when we effectively got one full-sheet crop (bad merge)."""
    if len(boxes) != 1:
        return False
    _, _, w, h = boxes[0]
    return (w * h) >= 0.7 * (w_img * h_img)


def background_alpha(gray_icon: np.ndarray, threshold: int) -> np.ndarray:
    """
    Make near-white background transparent without punching interior white.

    Flood-fills from crop-edge near-white pixels; only that connected
    background gets alpha 0. Enclosed white (highlights, eyes) stays opaque.
    """
    h, w = gray_icon.shape[:2]
    # 1 = candidate background (near-white); flood will mark reachable cells
    near_white = (gray_icon >= threshold).astype(np.uint8)
    # OpenCV floodFill mask is 2px larger than the image on each side
    mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    seeds: list[tuple[int, int]] = []
    for x in range(w):
        if near_white[0, x]:
            seeds.append((x, 0))
        if near_white[h - 1, x]:
            seeds.append((x, h - 1))
    for y in range(h):
        if near_white[y, 0]:
            seeds.append((0, y))
        if near_white[y, w - 1]:
            seeds.append((w - 1, y))

    # Flood only through near-white (value 1); mark background as 2
    work = near_white.copy()
    for sx, sy in seeds:
        if mask[sy + 1, sx + 1] != 0:
            continue
        if work[sy, sx] == 0:
            continue
        cv2.floodFill(
            work,
            mask,
            (sx, sy),
            2,
            loDiff=0,
            upDiff=0,
            flags=cv2.FLOODFILL_FIXED_RANGE,
        )

    background = work == 2
    return np.where(background, 0, 255).astype(np.uint8)


def process_sprite_sheet(image_path: str, theme_id: str) -> int:
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        return 0

    slug = sheet_slug(image_path)
    output_dir = os.path.join(SCRIPT_DIR, "extracted", theme_id, slug)
    if os.path.isdir(output_dir):
        for name in os.listdir(output_dir):
            if name.lower().endswith(".png"):
                os.remove(os.path.join(output_dir, name))
    os.makedirs(output_dir, exist_ok=True)

    image = cv2.imread(image_path)
    if image is None:
        print(f"Could not open image: {image_path}")
        return 0

    h_img, w_img, _ = image.shape
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    alpha_threshold = WHITE_THRESHOLD
    merged = find_icon_boxes(gray, WHITE_THRESHOLD, True, MERGE_GAP)

    # Soft / light icons can glue into one sheet — retry without morph/merge
    if sheet_swallowed(merged, w_img, h_img):
        for t in (220, 210, 200):
            retry = find_icon_boxes(gray, t, False, 0)
            if not sheet_swallowed(retry, w_img, h_img) and len(retry) >= 2:
                merged = retry
                alpha_threshold = t
                print(
                    f"  note: {os.path.basename(image_path)} "
                    f"used fallback threshold={t} (no proximity merge)"
                )
                break

    # Largest-first then top-left for more stable ordering across runs
    merged.sort(key=lambda b: (-b[2] * b[3], b[1], b[0]))

    count = 0
    for x, y, w, h in merged:
        if w <= MIN_BOX or h <= MIN_BOX:
            continue
        x1 = max(0, x - PADDING)
        y1 = max(0, y - PADDING)
        x2 = min(w_img, x + w + PADDING)
        y2 = min(h_img, y + h + PADDING)

        icon = image[y1:y2, x1:x2]
        icon_bgra = cv2.cvtColor(icon, cv2.COLOR_BGR2BGRA)
        gray_icon = cv2.cvtColor(icon, cv2.COLOR_BGR2GRAY)
        alpha = background_alpha(gray_icon, alpha_threshold)
        icon_bgra[:, :, 3] = alpha

        out_path = os.path.join(output_dir, f"icon_{count:02d}.png")
        cv2.imwrite(out_path, icon_bgra)
        count += 1

    print(
        f"[{theme_id}] {os.path.basename(image_path)} -> "
        f"{count} icons in extracted/{theme_id}/{slug}/"
    )
    return count


def discover_sheets(theme_id: str) -> list[str]:
    folder = THEME_FOLDERS.get(theme_id)
    if not folder:
        return []
    theme_dir = os.path.join(SCRIPT_DIR, folder)
    if not os.path.isdir(theme_dir):
        print(f"Missing theme folder: {theme_dir}")
        return []
    sheets = [
        os.path.join(theme_dir, name)
        for name in sorted(os.listdir(theme_dir))
        if name.lower().endswith(".png")
    ]
    return sheets


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract transparent icons from theme sprite sheets."
    )
    parser.add_argument(
        "--theme",
        choices=["plant", "ocean", "desert", "all"],
        default="all",
        help="Which theme pack to process (default: all)",
    )
    args = parser.parse_args(argv)

    themes = (
        list(THEME_FOLDERS.keys())
        if args.theme == "all"
        else [args.theme]
    )

    total = 0
    for theme_id in themes:
        sheets = discover_sheets(theme_id)
        if not sheets:
            print(f"No sheets for theme '{theme_id}'")
            continue
        for path in sheets:
            total += process_sprite_sheet(path, theme_id)

    print(f"Done. Extracted {total} icons total.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
