# Search VRoid Hub for downloadable models by keyword, keeping only the ones
# whose licence actually permits shipping them in a commercial app.
import json, time, urllib.request, urllib.parse, sys

H = {"X-Api-Version": "11", "Accept": "application/json",
     "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60))

# Terms aimed at swimwear, plus the generic ones that surface the same models
# under a different tag. Japanese first — that is what the authors tag with.
TERMS = ["水着", "ビキニ", "bikini", "swimsuit", "swimwear", "ビーチ", "水著"]

seen, out = set(), []
for term in TERMS:
    q = urllib.parse.quote(term)
    url = f"https://hub.vroid.com/api/search/character_models?keyword={q}&limit=100&is_downloadable=true"
    pages = 0
    while url and pages < 12:
        try:
            j = get(url)
        except Exception as e:
            print(f"  {term}: err {e}", file=sys.stderr); break
        data = j.get("data") or []
        if not data: break
        for m in data:
            mid = m.get("id")
            if not mid or mid in seen: continue
            seen.add(mid); out.append(m)
        nxt = ((j.get("_links") or {}).get("next") or {}).get("href")
        url = ("https://hub.vroid.com" + nxt) if nxt and nxt.startswith("/") else nxt
        pages += 1
        time.sleep(0.35)
    print(f"{term}: running total {len(out)}", file=sys.stderr)

json.dump(out, open("vh_bikini_raw.json", "w"))
print("models:", len(out), file=sys.stderr)
