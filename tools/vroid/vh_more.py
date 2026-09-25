import json, time, urllib.request, urllib.parse, sys, os

H = {"X-Api-Version": "11", "Accept": "application/json",
     "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))

# Round two: body/appeal words alongside the swimwear ones. Japanese first —
# that is what the authors actually tag with.
TERMS = ["セクシー", "グラビア", "水着ギャル", "ギャル", "巨乳", "お姉さん",
         "ボディ", "sexy", "swimsuit girl", "beach girl", "bunny", "バニー",
         "下着", "ランジェリー", "水着美少女", "ビーチガール"]

seen, out = {}, []
if os.path.exists("vh_bikini_raw.json"):
    for m in json.load(open("vh_bikini_raw.json")):
        if m.get("id"): seen[m["id"]] = m
print(f"starting from {len(seen)} already crawled", file=sys.stderr)

for term in TERMS:
    q = urllib.parse.quote(term)
    url = f"https://hub.vroid.com/api/search/character_models?keyword={q}&limit=100&is_downloadable=true"
    pages, added = 0, 0
    while url and pages < 12:
        try:
            j = get(url)
        except Exception as e:
            print(f"  {term}: {e}", file=sys.stderr); break
        data = j.get("data") or []
        if not data: break
        for m in data:
            mid = m.get("id")
            if mid and mid not in seen:
                seen[mid] = m; added += 1
        nxt = ((j.get("_links") or {}).get("next") or {}).get("href")
        url = ("https://hub.vroid.com" + nxt) if nxt and nxt.startswith("/") else nxt
        pages += 1
        time.sleep(0.3)
    print(f"{term}: +{added}  (total {len(seen)})", file=sys.stderr)

json.dump(list(seen.values()), open("vh_bikini_raw.json", "w"))
print("models total:", len(seen), file=sys.stderr)
