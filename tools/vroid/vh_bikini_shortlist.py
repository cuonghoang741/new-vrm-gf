import json, time, urllib.request, sys
H={"X-Api-Version":"11","Accept":"application/json","User-Agent":"Mozilla/5.0"}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=60))

def perm(m):
    """Only licences that actually allow shipping this in a paid app."""
    l = m.get("license") or {}
    return (l.get("redistribution") == "allow"
            and l.get("corporate_commercial_use") == "allow"
            and l.get("modification") == "allow"
            and l.get("characterization_allowed_user") == "everyone"
            and l.get("sexual_expression") == "allow")

raw = json.load(open("vh_bikini_raw.json"))
chars = {}
for m in raw:
    ch = m.get("character") or {}
    if ch.get("id"): chars.setdefault(ch["id"], ch)
print("distinct characters:", len(chars), file=sys.stderr)

out = []
for i, (cid, ch) in enumerate(chars.items()):
    try:
        j = get(f"https://hub.vroid.com/api/characters/{cid}/models?limit=30")
    except Exception:
        continue
    models = [m for m in (j.get("data") or []) if m.get("is_downloadable") and perm(m)]
    if not models: continue
    models.sort(key=lambda m: -(m.get("heart_count") or 0))
    out.append({
        "character_id": cid,
        "name": ch.get("name"),
        "author": ((ch.get("user") or {}).get("name")),
        "outfits": len(models),
        "hearts": sum(m.get("heart_count") or 0 for m in models),
        "models": [{
            "id": m["id"], "name": m.get("name"), "hearts": m.get("heart_count"),
            "size": ((m.get("latest_character_model_version") or {}).get("original_file_size")),
            "portrait": (((m.get("portrait_image") or {}).get("w600") or {}).get("url")),
            "full": (((m.get("full_body_image") or {}).get("w600") or {}).get("url")),
        } for m in models],
    })
    if i % 25 == 0:
        print(f"  {i}/{len(chars)} → {len(out)} licensed", file=sys.stderr)
    time.sleep(0.25)

# Outfits first (that is the ask), hearts as the tie-break.
out.sort(key=lambda c: (-c["outfits"], -c["hearts"]))
json.dump(out, open("vh_bikini_shortlist.json", "w"))
multi = [c for c in out if c["outfits"] >= 2]
print(f"licensed characters: {len(out)}  (with 2+ outfits: {len(multi)})", file=sys.stderr)
