#!/usr/bin/env python3
"""
Copy the Live2D characters from the fi005 project (Supabase project
glzsmmijnywamdlinvlr) into TrueMate's own storage.

Every file a model3.json references (moc3, textures, physics, pose, motions,
expressions, sounds, user data) is copied under the same relative path, so the
model3.json itself needs no rewriting. Thumbnails go to thumbs/<slug>.png.

Destination is the public `live2d` bucket on TrueMate's Supabase project, not
R2. The Live2D viewer runs on an https origin, not file://, so it needs CORS,
which Supabase storage sends and the R2 buckets do not.

Needs:
  LIVE2D_PAT            Management API token for glzsmmijnywamdlinvlr
  TRUEMATE_SERVICE_KEY  service_role key of kwqqmjfsrgoczbutuisx (storage write)

Run:  python3 tools/live2d/clone_characters.py [--only hiyori]
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

SRC_REF = "glzsmmijnywamdlinvlr"
SRC_BASE = f"https://{SRC_REF}.supabase.co/storage/v1/object/public/live2d/"
DST = "https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object"
DST_PUBLIC = DST + "/public/live2d/"

CT = {
    ".json": "application/json",
    ".moc3": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
}


def http(url, data=None, headers=None, method=None, timeout=120):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.read()


def source_characters(pat):
    body = json.dumps({"query": "select slug, model_path, thumb_path from characters where is_active order by sort_order"}).encode()
    raw = http(f"https://api.supabase.com/v1/projects/{SRC_REF}/database/query", data=body,
               headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"}, method="POST")
    return json.loads(raw)


def referenced_files(model3: dict) -> list:
    """Every file a model3.json points at, relative to its own folder."""
    refs = model3.get("FileReferences", {})
    out = []
    for key in ("Moc", "Physics", "Pose", "DisplayInfo", "UserData"):
        if refs.get(key):
            out.append(refs[key])
    out += refs.get("Textures", [])
    for e in refs.get("Expressions", []) or []:
        if e.get("File"):
            out.append(e["File"])
    for group in (refs.get("Motions") or {}).values():
        for m in group:
            if m.get("File"):
                out.append(m["File"])
            if m.get("Sound"):
                out.append(m["Sound"])
    return sorted(set(out))


def upload(key, path, data):
    ext = os.path.splitext(path)[1].lower()
    http(f"{DST}/live2d/{urllib.parse.quote(path)}", data=data, method="POST", headers={
        "Authorization": f"Bearer {key}", "apikey": key,
        "Content-Type": CT.get(ext, "application/octet-stream"), "x-upsert": "true",
        # Models never change in place, and without this Supabase serves
        # `no-cache`: every launch revalidated every file of a 5 MB model.
        "cache-control": "max-age=2592000",
    })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append")
    args = ap.parse_args()
    pat, key = os.environ.get("LIVE2D_PAT"), os.environ.get("TRUEMATE_SERVICE_KEY")
    if not pat or not key:
        sys.exit("set LIVE2D_PAT and TRUEMATE_SERVICE_KEY")

    chars = [c for c in source_characters(pat) if not args.only or c["slug"] in args.only]
    total = 0
    for c in chars:
        model_path = c["model_path"]
        folder = model_path.rsplit("/", 1)[0] + "/"
        model_raw = http(SRC_BASE + urllib.parse.quote(model_path))
        model3 = json.loads(model_raw)
        files = referenced_files(model3)
        upload(key, model_path, model_raw)
        size = len(model_raw)
        for rel in files:
            data = http(SRC_BASE + urllib.parse.quote(folder + rel))
            upload(key, folder + rel, data)
            size += len(data)
        if c.get("thumb_path"):
            upload(key, f"thumbs/{c['slug']}.png", http(SRC_BASE + urllib.parse.quote(c["thumb_path"])))
        # The copy is only done when the model3.json answers from its new home.
        http(DST_PUBLIC + urllib.parse.quote(model_path), method="HEAD")
        total += size
        print(f"✅ {c['slug']:8} {len(files) + 1:3} files  {size / 1e6:6.1f} MB  → {DST_PUBLIC}{model_path}")
    print(f"done: {len(chars)} characters, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
