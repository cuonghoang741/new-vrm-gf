#!/usr/bin/env python3
"""
Export the touch-reaction animations from Mixamo and host them on R2.

The 3D viewer (assets/index.html, TOUCH_EXTRA) looks for these files under
  https://pub-2682fd3d83e342588016f364737f5758.r2.dev/app-art/anim/touch/<Name>.fbx
and uses whichever exist, so they can land one at a time.

They are exported the way the existing catalogue was: FBX binary 2019, no skin
(the rig only, `mixamorig` bones), 30 fps, keyframes not reduced. The viewer
retargets mixamorig onto each VRM.

Needs:
  MIXAMO_TOKEN      Sign in at mixamo.com, open the browser console and run
                    `localStorage.access_token`. The token lasts about a day.
  R2_PRESIGN_TOKEN  See docs/CREDENTIALS.md. Writes are limited to app-art/.

Run:  python3 tools/mixamo/fetch_touch_anims.py [--only "Waving"] [--dry-run]

It runs in the account that owns the token, one export at a time with a pause
in between, the way a person clicking Download would.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://www.mixamo.com/api/v1"
PRESIGN = "https://hpjhqezgfqztcafaknzk.supabase.co/functions/v1/r2-presign"
R2_PREFIX = "app-art/anim/touch/"
PUBLIC_BASE = "https://pub-2682fd3d83e342588016f364737f5758.r2.dev/"

# Mixamo product ids, from its public search. Names must match TOUCH_EXTRA in
# assets/index.html — the file name is the name plus ".fbx".
ANIMS = {
    "Head Nod Yes": "c9c90d7b-b96c-11e4-a802-0aaa78deedf9",       # head pat
    "Waving": "c9c5ed32-b96c-11e4-a802-0aaa78deedf9",             # hand
    "Thankful": "c9c9959c-b96c-11e4-a802-0aaa78deedf9",           # hand
    "Laughing": "c9c6ec22-b96c-11e4-a802-0aaa78deedf9",           # belly (ticklish)
    "Reacting": "c9c8214a-b96c-11e4-a802-0aaa78deedf9",           # chest / hips / legs: startled
    "Dismissing Gesture": "c9c8e0d3-b96c-11e4-a802-0aaa78deedf9", # chest: "hey~"
    "Annoyed Head Shake": "c9c90fbc-b96c-11e4-a802-0aaa78deedf9", # hips: playful no
    "Surprised": "c9c70e34-b96c-11e4-a802-0aaa78deedf9",          # legs
}


def req(url, *, method="GET", body=None, headers=None, timeout=60):
    h = {"X-Api-Key": "mixamo2", "Accept": "application/json"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def primary_character(token):
    return req(f"{API}/characters/primary", headers=auth(token))["primary_character_id"]


def export(token, char_id, name, product_id):
    detail = req(f"{API}/products/{product_id}?similar=0&character_id={char_id}", headers=auth(token))
    gms = detail["details"]["gms_hash"]
    # Slider values, e.g. [["Energy", 0.0]]; the export wants "0", or "0.5".
    params = ",".join(
        str(int(v)) if float(v).is_integer() else str(v)
        for _, v in gms.get("params", [])
    )
    body = {
        "character_id": char_id,
        "product_name": name,
        "type": "Motion",
        "preferences": {"format": "fbx7_2019", "skin": "false", "fps": "30", "reducekf": "0"},
        "gms_hash": [{
            "model-id": gms["model-id"],
            "mirror": False,
            "trim": gms.get("trim", [0, 100]),
            "overdrive": 0,
            "params": params,
            "arm-space": gms.get("arm-space", 0),
            "inplace": False,
        }],
    }
    req(f"{API}/animations/export", method="POST", body=body, headers=auth(token))
    for _ in range(90):
        time.sleep(2)
        m = req(f"{API}/characters/{char_id}/monitor", headers=auth(token))
        if m.get("status") == "completed":
            return m["job_result"]
        if m.get("status") == "failed":
            raise RuntimeError(f"export failed: {m}")
    raise TimeoutError("export did not finish in 3 minutes")


def download(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    if not data.startswith(b"Kaydara FBX Binary"):
        raise ValueError("download is not a binary FBX")
    if b"mixamorig" not in data:
        raise ValueError("FBX has no mixamorig bones; the viewer cannot retarget it")
    return data


def upload(presign_token, name, data):
    path = R2_PREFIX + name + ".fbx"
    r = urllib.request.Request(
        PRESIGN,
        data=json.dumps({"path": path, "contentType": "application/octet-stream"}).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "x-presign-token": presign_token},
    )
    with urllib.request.urlopen(r, timeout=60) as resp:
        signed = json.loads(resp.read())
    put = urllib.request.Request(signed["url"], data=data, method="PUT",
                                 headers={"Content-Type": "application/octet-stream"})
    urllib.request.urlopen(put, timeout=300).read()
    public = PUBLIC_BASE + urllib.request.quote(path)
    head = urllib.request.Request(public, method="HEAD")
    with urllib.request.urlopen(head, timeout=60) as h:
        if h.status != 200:
            raise RuntimeError(f"uploaded but {public} answers {h.status}")
    return public


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="export just this animation (repeatable)")
    ap.add_argument("--dry-run", action="store_true", help="export and verify, but do not upload")
    args = ap.parse_args()

    token = os.environ.get("MIXAMO_TOKEN")
    presign = os.environ.get("R2_PRESIGN_TOKEN")
    if not token:
        sys.exit("set MIXAMO_TOKEN (mixamo.com → browser console → localStorage.access_token)")
    if not presign and not args.dry_run:
        sys.exit("set R2_PRESIGN_TOKEN (see docs/CREDENTIALS.md)")

    todo = {k: v for k, v in ANIMS.items() if not args.only or k in args.only}
    char_id = primary_character(token)
    print(f"character {char_id}, {len(todo)} animation(s)")

    failed = []
    for i, (name, pid) in enumerate(todo.items(), 1):
        try:
            url = export(token, char_id, name, pid)
            data = download(url)
            where = "(dry run)" if args.dry_run else upload(presign, name, data)
            print(f"[{i}/{len(todo)}] ✅ {name}  {len(data)//1024} KB  {where}")
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, ValueError, TimeoutError, KeyError) as e:
            failed.append(name)
            print(f"[{i}/{len(todo)}] ❌ {name}: {e}")
        time.sleep(3)

    if failed:
        sys.exit(f"failed: {', '.join(failed)} — rerun with --only for each")


if __name__ == "__main__":
    main()
