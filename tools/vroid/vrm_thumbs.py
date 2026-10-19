#!/usr/bin/env python3
"""Extract the thumbnail embedded in each character's VRM, once, and persist it.

    SUPABASE_ACCESS_TOKEN=... R2_PRESIGN_TOKEN=... python3 tools/vroid/vrm_thumbs.py [--force] [--dry-run]

A VRM is a GLB. Its author-set thumbnail lives in the file itself:
  VRM 0.x  extensions.VRM.meta.texture          -> textures[i].source -> images[j]
  VRM 1.0  extensions.VRMC_vrm.meta.thumbnailImage -> images[j]
The image is a bufferView in the BIN chunk, so only three small HTTP Range
reads are needed per model (GLB header, JSON chunk, image bytes) instead of
downloading ~19MB each.

Each image is downscaled to fit 300x400 (JPEG, or PNG if it has alpha), uploaded to R2 at app-art/vrm-full/<character_id>.<png|jpg>
through the `r2-presign` edge function on the Yuuki project (same as
pushbuild.sh), and its public URL written to characters.vrm_thumbnail_url.
Nothing else on the row is touched. Characters that already have a URL are
skipped unless --force.

The embedded thumbnails are VRoid head shots. The CMS uses full-body renders
instead: vrm_thumbs_render.mjs OUT_DIR, then `vrm_thumbs.py --rendered OUT_DIR`
uploads every <character_id>.png found there the same way.

Secrets come from the environment only; nothing is printed.
"""
import json
import os
import struct
import sys
import io
import urllib.request

from PIL import Image  # pip install pillow

THUMB_PX = (300, 400)  # the CMS corner shows ~64x86 px; this keeps it sharp on 3x screens

PROJECT = "kwqqmjfsrgoczbutuisx"
PRESIGN_REF = os.environ.get("YUUKI_REF", "hpjhqezgfqztcafaknzk")
UA = {"User-Agent": "truemate-vrm-thumbs/1"}


def sql(query: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
            "Content-Type": "application/json",
            **UA,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def get_range(url: str, start: int, length: int) -> bytes:
    req = urllib.request.Request(
        url, headers={"Range": f"bytes={start}-{start + length - 1}", **UA}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if r.status == 200 and len(data) > length:  # server ignored Range
        data = data[start : start + length]
    if len(data) != length:
        raise IOError(f"short read {len(data)}/{length}")
    return data


def embedded_thumbnail(url: str):
    """Return (bytes, mime) or None if the VRM has no thumbnail."""
    head = get_range(url, 0, 20)
    magic, _ver, _total, json_len, json_type = struct.unpack("<4sIIII", head)
    if magic != b"glTF" or json_type != 0x4E4F534A:
        raise ValueError("not a GLB")
    gltf = json.loads(get_range(url, 20, json_len))
    ext = gltf.get("extensions", {})
    img_idx = None
    if "VRMC_vrm" in ext:
        img_idx = ext["VRMC_vrm"].get("meta", {}).get("thumbnailImage")
    elif "VRM" in ext:
        tex = ext["VRM"].get("meta", {}).get("texture")
        if isinstance(tex, int) and 0 <= tex < len(gltf.get("textures", [])):
            img_idx = gltf["textures"][tex].get("source")
    if not isinstance(img_idx, int) or img_idx < 0 or img_idx >= len(gltf.get("images", [])):
        return None
    img = gltf["images"][img_idx]
    mime = img.get("mimeType", "image/png")
    if "bufferView" not in img:
        return None  # external/data URIs do not occur in our VRMs
    bv = gltf["bufferViews"][img["bufferView"]]
    if bv.get("buffer", 0) != 0:
        return None
    bin_start = 20 + json_len + 8  # skip BIN chunk header
    data = get_range(url, bin_start + bv.get("byteOffset", 0), bv["byteLength"])
    return data, mime


def shrink(data: bytes, mime: str):
    """Renders and VRoid thumbnails are large PNGs; a card corner needs ~20KB."""
    im = Image.open(io.BytesIO(data))
    im.thumbnail(THUMB_PX, Image.LANCZOS)
    out = io.BytesIO()
    if im.mode in ("RGBA", "LA", "P") and im.convert("RGBA").getextrema()[3][0] < 255:
        im.convert("RGBA").save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png"
    im.convert("RGB").save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue(), "image/jpeg"


def upload(char_id: str, data: bytes, mime: str) -> str:
    ext = "jpg" if "jpeg" in mime or "jpg" in mime else "png"
    req = urllib.request.Request(
        f"https://{PRESIGN_REF}.supabase.co/functions/v1/r2-presign",
        data=json.dumps({"path": f"app-art/vrm-full/{char_id}.{ext}", "contentType": mime}).encode(),
        headers={"Content-Type": "application/json", "x-presign-token": os.environ["R2_PRESIGN_TOKEN"], **UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    put = urllib.request.Request(resp["url"], data=data, headers={"Content-Type": mime}, method="PUT")
    with urllib.request.urlopen(put, timeout=120):
        pass
    return resp["publicUrl"]


def push(cid: str, name: str, data: bytes, mime: str):
    data, mime = shrink(data, mime)
    pub = upload(cid, data, mime)
    safe = pub.replace("'", "''")
    sql(f"update characters set vrm_thumbnail_url = '{safe}' where id = '{cid}'")
    print(f"  ok    {name} ({mime}, {len(data)} B)")


def main_rendered(folder: str):
    """Upload <character_id>.png files made by vrm_thumbs_render.mjs."""
    where = "base_model_url ilike '%.vrm%'"
    if "--force" not in sys.argv:  # resume: skip rows already pointing at a render
        where += " and coalesce(vrm_thumbnail_url, '') not like '%/vrm-full/%'"
    rows = sql(f"select id, name from characters where {where}")
    for row in rows:
        path = os.path.join(folder, f"{row['id']}.png")
        if not os.path.exists(path):
            print(f"  none  {row['name']}")
            continue
        try:
            with open(path, "rb") as f:
                push(row["id"], row["name"], f.read(), "image/png")
        except Exception as e:  # noqa: BLE001 - rerun picks it up
            print(f"  FAIL  {row['name']}: {e}")


def main():
    if "--rendered" in sys.argv:
        return main_rendered(sys.argv[sys.argv.index("--rendered") + 1])
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv
    where = "base_model_url ilike '%.vrm%'"
    if not force:
        where += " and vrm_thumbnail_url is null"
    rows = sql(f"select id, name, base_model_url from characters where {where} order by \"order\", name")
    print(f"{len(rows)} characters to process")
    done, missing, failed = [], [], []
    for row in rows:
        cid, name, url = row["id"], row["name"], row["base_model_url"]
        try:
            got = embedded_thumbnail(url)
        except Exception as e:  # noqa: BLE001
            failed.append((name, str(e)))
            print(f"  FAIL  {name}: {e}")
            continue
        if not got:
            missing.append(name)
            print(f"  none  {name}")
            continue
        if dry:
            print(f"  ok    {name} ({got[1]}, {len(got[0])} B) [dry-run]")
        else:
            push(cid, name, *got)
        done.append(name)
    print(f"\nembedded: {len(done)}  no thumbnail: {len(missing)}  failed: {len(failed)}")
    for n in missing:
        print(f"  no thumbnail: {n}")
    for n, e in failed:
        print(f"  failed: {n}: {e}")


if __name__ == "__main__":
    main()
