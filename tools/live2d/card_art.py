#!/usr/bin/env python3
"""
Card art for the Live2D girls: her transparent cut-out (thumbs/<slug>.png)
centred over one of our backgrounds, saved as thumbs/<slug>_card.jpg.

The picker, the hero and the welcome-back screen show `avatar`/`thumbnail_url`,
and a bare cut-out there sat on a flat tile. The scene keeps using the cut-out
(`avatar_nobg`). See supabase/migrations/20260930100000_live2d_card_art.sql.

Run:  TRUEMATE_SERVICE_KEY=... python3 tools/live2d/card_art.py
"""
import io
import os
import sys
import urllib.request

from PIL import Image, ImageEnhance, ImageFilter

BUCKET = "https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object"
R2 = "https://pub-6671ed00c8d945b28ff7d8ec392f60b8.r2.dev/BACKGROUNDS/"
R2B = "https://pub-14a49f54cd754145a7362876730a1a52.r2.dev/bg/image/"
# A scene that fits each one's story.
SCENES = {
    "hiyori": R2 + "Cherry%20Blossom%20Street%20Tunnel.png",
    "mao": R2 + "Fantasy%20City%20Magical%20Towers.png",
    "haru": R2B + "ff6a1d9d3a2676c49cb0c2522cd52480.jpg",  # Harbor Walk
    "rice": R2 + "Crystal%20Cave%20Fantasy%20Environment%20Giant%20Glowi.png",
}
W, H = 900, 1200


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))


def compose(cutout: Image.Image, scene: Image.Image) -> Image.Image:
    ch = cutout.convert("RGBA")
    ch = ch.crop(ch.getbbox())
    s = min(W * 0.86 / ch.width, H * 0.9 / ch.height)
    ch = ch.resize((round(ch.width * s), round(ch.height * s)), Image.LANCZOS)

    bg = scene.convert("RGB")
    k = max(W / bg.width, H / bg.height)
    bg = bg.resize((round(bg.width * k), round(bg.height * k)), Image.LANCZOS)
    x, y = (bg.width - W) // 2, max(0, (bg.height - H) // 2)
    bg = bg.crop((x, y, x + W, y + H))
    # A little depth, so she reads in front of it.
    bg = ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(3))).enhance(0.85)

    out = bg.convert("RGBA")
    cx, cy = (W - ch.width) // 2, H - ch.height
    glow_a = Image.new("L", (W, H), 0)
    glow_a.paste(ch.split()[-1].filter(ImageFilter.GaussianBlur(28)), (cx, cy))
    glow = Image.new("RGBA", (W, H), (255, 230, 245, 0))
    glow.putalpha(glow_a.point(lambda v: int(v * 0.45)))
    out = Image.alpha_composite(out, glow)
    out.alpha_composite(ch, (cx, cy))
    return out.convert("RGB")


def main():
    key = os.environ.get("TRUEMATE_SERVICE_KEY") or sys.exit("set TRUEMATE_SERVICE_KEY")
    for slug, scene in SCENES.items():
        card = compose(fetch(f"{BUCKET}/public/live2d/thumbs/{slug}.png"), fetch(scene))
        buf = io.BytesIO()
        card.save(buf, "JPEG", quality=90)
        urllib.request.urlopen(urllib.request.Request(
            f"{BUCKET}/live2d/thumbs/{slug}_card.jpg", data=buf.getvalue(), method="POST",
            headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "image/jpeg",
                     "x-upsert": "true", "cache-control": "max-age=2592000"}))
        print(f"✅ {slug}_card.jpg")


if __name__ == "__main__":
    main()
