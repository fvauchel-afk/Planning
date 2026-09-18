"""Génère les icônes PWA carrées à partir du logo officiel."""
from pathlib import Path
from PIL import Image

DIR = Path(__file__).resolve().parent.parent / "public"
SRC = DIR / "logo-metallerie-du-sud.jpg"


def is_bg(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r > 248 and g > 248 and b > 248


def trimmed_logo() -> Image.Image:
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    px = src.load()
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if not is_bg(px[x, y]):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    pad = 6
    # Coupe le slogan sous le trait : l’icône garde seulement le lockup.
    lockup_bottom = min(h, 188)
    return src.crop(
        (
            max(0, min_x - pad),
            max(0, min_y - pad),
            min(w, max_x + 1 + pad),
            min(lockup_bottom + pad, max_y + 1 + pad, h),
        )
    )


def make_square(crop: Image.Image, size: int, logo_ratio: float = 0.78) -> Image.Image:
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    cw, ch = crop.size
    max_w = int(size * logo_ratio)
    max_h = int(size * logo_ratio)
    scale = min(max_w / cw, max_h / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    resized = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def main() -> None:
    crop = trimmed_logo()
    make_square(crop, 192).save(DIR / "icon-192.png", optimize=True)
    make_square(crop, 512).save(DIR / "icon-512.png", optimize=True)
    make_square(crop, 180).save(DIR / "apple-touch-icon.png", optimize=True)
    make_square(crop, 32).save(DIR / "favicon.ico")
    print("PWA icons written to public/")


if __name__ == "__main__":
    main()
