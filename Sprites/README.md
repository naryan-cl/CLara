# Map theme sprites

Pipeline for dashboard Knowledge Map node icons (Plant / Ocean / Desert).

## Layout

| Path | Role |
|------|------|
| `Plant Theme/`, `Ocean Theme/`, `Desert theme/` | Source sprite sheets (white background PNGs) |
| `extracted/{theme}/{sheet_slug}/icon_NN.png` | Split + transparent crops (curate here) |
| `public/map-sprites/{theme}/{atom\|concept\|framework\|theme}/` | App packs + `manifest.json` (generated) |

Do **not** edit files under `public/map-sprites/` by hand — they are wiped and rebuilt by prepare.

## Reprocess (overwrite extracts)

From the repo root (needs Python + OpenCV: `pip install opencv-python numpy`):

```bash
python Sprites/split_sprites2.py
# or one theme: python Sprites/split_sprites2.py --theme ocean
```

Then publish:

```bash
npm run sprites:prepare
```

`split_sprites2.py` clears each `extracted/{theme}/{slug}/` PNG set before writing, so a re-run overwrites previous extracts.

## Alpha: keep interior white

Background removal is **edge flood-fill**, not “make every near-white pixel transparent.”

- Near-white pixels (`gray >= WHITE_THRESHOLD`, default 240) that are **connected to the crop edge** → transparent.
- Enclosed white inside the art (highlights, underbellies, eyes) → stays opaque.

**Limitation:** if white paint connects to the outside through a gap in the outline, flood-fill can leak into that region.

Do **not** revert to a global `gray >= threshold → alpha 0` mask — that punches holes in the art.

## Cull bad splits

After extract, delete bad icons under `extracted/` (wrong crop, junk fragment, etc.), then re-run `npm run sprites:prepare`.

Known culls (re-apply after every full re-extract):

- `desert/desert-rocks` — `icon_02.png`, `icon_03.png`
- `desert/desert-reptiles2` — `icon_00.png`
- `ocean/ocean-jellyturtleshark` — `icon_07.png`
- `plant/plants2` — `icon_22.png`

Pool → sheet mapping lives in `scripts/prepare-map-sprites.mjs` (`POOLS`).

## Legacy

`split_sprites.py` is the older single-folder splitter; prefer `split_sprites2.py` for theme packs.
