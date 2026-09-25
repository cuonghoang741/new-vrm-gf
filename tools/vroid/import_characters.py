#!/usr/bin/env python3
"""
Turn shortlisted VRoid Hub characters into TrueMate `characters` rows.

    python3 import_characters.py --limit 20            # dry run, changes nothing
    python3 import_characters.py --limit 20 --commit   # uploads and inserts

Everything except the VRM download works without credentials, because VRoid Hub
serves portrait and full-body images publicly — those become the avatar and the
thumbnail. The model file is the one piece that needs a signed-in session:

    VROID_COOKIE='...'  python3 import_characters.py --limit 20 --commit

Without it the script still reports exactly which characters it *would* import
and what each row would contain, so the work can be reviewed before any
credential is handed over.

A row is only written when it is complete. A character with no usable model is
skipped rather than inserted half-formed — the app hides anything whose
`base_model_url` is not a VRM, so a partial row is invisible clutter that
still has to be cleaned up later.

Environment:
    SUPABASE_URL, SUPABASE_SERVICE_KEY   to insert
    R2_PRESIGN_TOKEN                     to upload (see pushbuild.sh)
    VROID_COOKIE                         to download models
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HUB = {"X-Api-Version": "11", "Accept": "application/json",
       "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://kwqqmjfsrgoczbutuisx.supabase.co")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
PRESIGN_TOKEN = os.environ.get("R2_PRESIGN_TOKEN", "")
YUUKI_REF = os.environ.get("YUUKI_REF", "hpjhqezgfqztcafaknzk")
VROID_COOKIE = os.environ.get("VROID_COOKIE", "")


def http(url, data=None, headers=None, method=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    return urllib.request.urlopen(req, timeout=timeout)


# ── naming ──────────────────────────────────────────────────────────────────
# VRoid names are often Japanese, decorated, or a handle rather than a name.
# The app shows this under her portrait, so it has to read like a person.
LATIN = re.compile(r"[A-Za-z][A-Za-z\'\- ]{1,20}")

# Words that mean the author titled the upload, not the character. Importing
# these verbatim ships a girlfriend called "Free Model" or "Vroid847813".
JUNK = re.compile(
    r"(free|sample|test|model|mesh|avatar|vroid|download|配布|サンプル|"
    r"無料|テスト|モデル|^v?\d+$)", re.I)

# Used when the source has no usable name. Deliberately ordinary given names:
# she is a person in the app, and the editor renames her in the CMS anyway.
NAME_POOL = [
    "Aiko", "Mira", "Yuna", "Sena", "Nari", "Kaori", "Elin", "Rika", "Sora",
    "Mei", "Nadia", "Yumi", "Cleo", "Riya", "Suzu", "Talia", "Hana", "Vera",
    "Noa", "Kira", "Lumi", "Saki", "Ayla", "Rina", "Emi", "Zara", "Yui",
    "Nova", "Ines", "Maya", "Reia", "Soli", "Tara", "Umi", "Wren", "Yara",
]


def looks_like_a_name(s: str) -> bool:
    s = (s or "").strip()
    if not (2 <= len(s) <= 20):
        return False
    if JUNK.search(s):
        return False
    return bool(LATIN.fullmatch(s))


def display_name(raw: str, taken: set) -> tuple:
    """Returns (name, invented) — `invented` when the source had nothing usable."""
    raw = (raw or "").strip()

    # Many authors write "日本語名(Latin)"; the parenthesised half is the one an
    # English-speaking user can read and remember.
    paren = re.search(r"[（(]\s*([A-Za-z][^）)]{1,24})[）)]", raw)
    for cand in ([paren.group(1)] if paren else []) + [raw]:
        c = cand.strip()
        if looks_like_a_name(c):
            t = c.title()
            if t.lower() not in taken:
                return t, False

    for n in NAME_POOL:
        if n.lower() not in taken:
            return n, True
    return f"Mira{len(taken)}", True


# ── R2 ──────────────────────────────────────────────────────────────────────
def r2_put(path: str, blob: bytes, content_type: str) -> str:
    """Presigned PUT straight to Cloudflare; the R2 keys stay server-side."""
    if not PRESIGN_TOKEN:
        raise SystemExit("R2_PRESIGN_TOKEN is not set")
    body = json.dumps({"path": path, "contentType": content_type}).encode()
    r = http(f"https://{YUUKI_REF}.supabase.co/functions/v1/r2-presign", data=body,
             headers={"Content-Type": "application/json", "x-presign-token": PRESIGN_TOKEN},
             method="POST")
    d = json.load(r)
    http(d["url"], data=blob, headers={"Content-Type": content_type}, method="PUT")
    return d["publicUrl"]


# ── VRoid Hub ───────────────────────────────────────────────────────────────
def fetch_image(url: str) -> bytes:
    return http(url, headers={"User-Agent": HUB["User-Agent"]}).read()


def fetch_vrm(model_id: str) -> bytes:
    """
    The one authenticated step.

    `is_downloadable: true` only means the author permits downloads;
    `POST /api/download_licenses` answers 401 COMMON_SIGNED_IN_REQUIRED without
    a session. Anonymous download is not possible — every URL in the model
    payload is an image.
    """
    if not VROID_COOKIE:
        raise RuntimeError("VROID_COOKIE not set — cannot download the model")
    h = dict(HUB)
    h["Cookie"] = VROID_COOKIE
    h["Content-Type"] = "application/json"
    lic = json.load(http("https://hub.vroid.com/api/download_licenses",
                         data=json.dumps({"character_model_id": model_id}).encode(),
                         headers=h, method="POST"))
    dl = (lic.get("data") or {}).get("download_url")
    if not dl:
        raise RuntimeError(f"no download_url in licence response: {str(lic)[:200]}")
    return http(dl, headers=h).read()


# ── Supabase ────────────────────────────────────────────────────────────────
def existing_names() -> set:
    r = http(f"{SUPABASE_URL}/rest/v1/characters?select=name",
             headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"})
    return {(c.get("name") or "").strip().lower() for c in json.load(r)}


def insert_character(row: dict) -> dict:
    r = http(f"{SUPABASE_URL}/rest/v1/characters",
             data=json.dumps(row).encode(),
             headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
                      "Content-Type": "application/json", "Prefer": "return=representation"},
             method="POST")
    return json.load(r)[0]


def persona(name: str) -> str:
    """
    A starting system prompt.

    Deliberately plain and short: a generated personality that tries to be
    clever reads the same across fifty characters, which is worse than a
    neutral one an editor can rewrite in the CMS. Left obviously unfinished so
    nobody mistakes it for authored work.
    """
    return (
        f"You are {name}, talking to someone you like. Keep replies short and "
        f"warm, one or two sentences, the way a real person texts. React with "
        f"feeling, tease, ask about them. Never describe yourself in the third "
        f"person and never mention being an AI.\n\n"
        f"[TODO: replace with a written personality — this is a placeholder.]"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shortlist", default="vh_bikini_shortlist.json")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--min-outfits", type=int, default=2)
    ap.add_argument("--commit", action="store_true", help="actually upload and insert")
    args = ap.parse_args()

    chars = json.load(open(args.shortlist))
    chars = [c for c in chars if c["outfits"] >= args.min_outfits]

    skip = existing_names() if (args.commit or SERVICE_KEY) else set()
    picked, done = [], 0
    for c in chars:
        name, invented = display_name(c.get("name"), skip)
        skip.add(name.lower())
        picked.append((name, invented, c.get("name"), c))
        done += 1
        if done >= args.limit:
            break

    print(f"{len(chars)} candidates with {args.min_outfits}+ outfits; "
          f"importing {len(picked)}\n")

    ok = failed = 0
    for i, (name, invented, raw, c) in enumerate(picked, 1):
        model = c["models"][0]
        note = f"  ← named by us (source: {raw!r})" if invented else ""
        print(f"[{i:>2}/{len(picked)}] {name}  ({c['outfits']} outfits, "
              f"{c['hearts']} hearts, {(model.get('size') or 0)/1048576:.1f} MB){note}")

        if not args.commit:
            print(f"        portrait: {model.get('portrait')}")
            continue

        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        try:
            vrm = fetch_vrm(model["id"])            # the gated step
            vrm_url = r2_put(f"characters/{slug}/model.vrm", vrm, "application/octet-stream")

            avatar_url = thumb_url = None
            if model.get("full"):
                avatar_url = r2_put(f"characters/{slug}/avatar.jpg",
                                    fetch_image(model["full"]), "image/jpeg")
            if model.get("portrait"):
                thumb_url = r2_put(f"characters/{slug}/thumb.jpg",
                                   fetch_image(model["portrait"]), "image/jpeg")

            row = insert_character({
                "name": name,
                "description": f"Imported from VRoid Hub · {c.get('author') or 'unknown author'}",
                "instruction": persona(name),
                "base_model_url": vrm_url,
                "avatar": avatar_url,
                "thumbnail_url": thumb_url,
                "tier": "pro",
                "price_ruby": 0,
                # Not public yet: an editor gives her a personality and a
                # description in the CMS first, then ticks these.
                "is_public": False,
                "available": False,
            })
            print(f"        ✓ {row['id']}")
            ok += 1
        except Exception as e:
            print(f"        ✗ {e}")
            failed += 1
        time.sleep(0.5)

    if args.commit:
        print(f"\nimported {ok}, failed {failed}")
        print("All rows are is_public=false / available=false — give each one a "
              "personality in the CMS before publishing.")
    else:
        print("\nDry run. Re-run with --commit (and VROID_COOKIE) to import.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
