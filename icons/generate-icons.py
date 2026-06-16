#!/usr/bin/env python3
"""Generate DeckSafe extension icons — Forge the Bear, head-only for small sizes."""

from pathlib import Path

from PIL import Image

# Forge the Bear — light fur on purple tile for toolbar contrast.
RECTS = [
    (0, 0, 16, 16, "6a5acd"),
    (2, 2, 3, 3, "fffef8"),
    (11, 2, 3, 3, "fffef8"),
    (3, 4, 10, 9, "fffef8"),
    (5, 7, 6, 4, "f0dcc0"),
    (5, 6, 1, 2, "2e2444"),
    (10, 6, 1, 2, "2e2444"),
    (7, 8, 2, 1, "e87a90"),
]

SIZE = 16
OUT_DIR = Path(__file__).resolve().parent


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def render_base() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    pixels = img.load()
    for x, y, w, h, color in RECTS:
        rgb = hex_to_rgb(color)
        for py in range(y, y + h):
            for px in range(x, x + w):
                if 0 <= px < SIZE and 0 <= py < SIZE:
                    pixels[px, py] = rgb + (255,)
    return img


def export_scaled(base: Image.Image, target: int, path: Path) -> None:
    scaled = base.resize((target, target), Image.Resampling.NEAREST)
    scaled.save(path, format="PNG", optimize=True)


def main() -> None:
    base = render_base()
    for size in (16, 48, 128):
        export_scaled(base, size, OUT_DIR / f"icon-{size}.png")
    print("Wrote icon-16.png, icon-48.png, icon-128.png")


if __name__ == "__main__":
    main()
