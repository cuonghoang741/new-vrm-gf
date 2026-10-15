# VRoid Hub crawl and import

This pipeline finds character models that may legally ship in a paid app and
imports them. Each VRoid character becomes a TrueMate character, and each of
her models becomes one of her outfits.

```bash
python3 vh_bikini.py            # swimwear terms  → vh_bikini_raw.json (uncommitted, ~10MB)
python3 vh_more.py              # body/appeal terms, merged into the same file
python3 vh_bikini_shortlist.py  # licence filter  → vh_bikini_shortlist.json

python3 import_characters.py --limit 400               # dry run of the whole shortlist
python3 import_characters.py --recheck --limit 20      # dry run against today's licences
python3 import_characters.py --show-rows --limit 1     # ...plus the exact rows --commit writes
python3 import_characters.py --recheck --curation review.json --approved-only   # what --commit would do
python3 import_characters.py --commit --publisher company --curation review.json \
    --only <cid> --max-outfits 0 --limit 1             # first real import: one approved model
```

`vh_bikini_shortlist.json` is committed. It holds **305 characters / 721
models** that passed the licence filter when they were crawled (2026-09-25),
sorted by outfit count and then hearts. The crawler read only the first API
page for each character (VRoid serves at most 20 models a page), so characters
listed with 16 or more models may have more. `--recheck` reads every page.

## The licence filter is the point

A model is kept only when `redistribution`, `corporate_commercial_use` and
`modification` are all `allow`, `characterization_allowed_user` is `everyone`,
`sexual_expression` is `allow`, and `is_downloadable` is `true` (a JSON
boolean). A model that fails any of these cannot be re-hosted on our R2 and
shipped. Do not relax the filter to raise the count.

`import_characters.py` applies the same filter (`perm()` and `passes()`).
Importing the module has no side effects, so the filter can be unit-tested.
After the filter, these checks can only take more models out:

- **Who publishes TrueMate.** VRoid has two commercial-use terms:
  `corporate_commercial_use` for a company (a legal entity) and
  `personal_commercial_use` for an individual or sole proprietor. The filter
  always requires the corporate one. `--commit` refuses to run without
  `--publisher company|individual`, and records it in every row's
  `source.publisher`. Unless it is `company`, `personal_commercial_use` must be
  `profit` as well; a dry run without `--publisher` assumes this stricter rule.
  **Confirm who the publisher is before the first real import.**
- **A vendor's licence.** `vendor_specified_license` (terms a VRoid item vendor
  imposes on models built with the item) must be `default`, the filter's
  value, or the field's most permissive value. No override.
- **Credit and author.** `credit` must be `necessary` or `unnecessary` (VRoid's
  `default` means "not set": the duty is unknown), and the model must name its
  author. No override.
- **The licence inside the file.** It is checked twice: the API's copy of the
  file's meta at planning, and the downloaded file before upload (below). No
  override.

Licences change after a crawl, so `--commit` re-checks every model against the
live API three times: when planning the character, right before downloading
each file, and once more for every staged model right before the first INSERT
(staging takes minutes per model). A model that fails or changed at the last
check is dropped, and `checked_at` is the time of that last read. A dry run
does the planning check with `--recheck`, including each passing model's own
page, which is the only place its description appears. A model that fails is
listed with the reason and never imported.

## What the importer does

For each shortlisted character, the importer reads her models (live with
`--recheck`), keeps the ones that pass the checks above, removes what the
content screen rejects (below), and drops models already in the DB. It then
plans one of these outcomes:

- **NEW**: one `characters` row on her most-hearted model, plus a costume row
  per model. The base model becomes the `'default'` starter row, and up to
  `--max-outfits` (default 30; 0 = the starter only) more models become
  `'pro'` rows.
- **EXISTS**: the DB already has her. With `--attach-existing`, her new models
  become hidden outfits of the TrueMate character that already owns most of
  her models. A tie needs `target` in the curation file.
- **BELOW-MIN**: fewer importable models than `--min-outfits`; the line says
  what was left out.
- **EXCLUDED / NOTHING / SKIPPED**: these print the reason and write nothing.

`--limit` (default 20) counts only NEW and ATTACH characters, after dedupe.
`--min-outfits` (default 1) counts *importable* models: licensed, screened,
not in the DB and under the cap (an ATTACH counts her new outfits). A character
whose models now *all* fail is still listed, so the licence change is visible.

`--commit` imports only models a person approved in the curation file
(`approve`, below): keyword screens are never complete, and the files are
public from the moment they are uploaded. `--approved-only` shows that plan in
a dry run. The outfit sheet (`PickerGrid`, a `FlatList`) and the preview strip
(a horizontal `ScrollView`) both scroll, so 30 outfits fit; check a 30-outfit
character on a device before publishing her.

The dry run lists, for each character, her base model and every outfit (id,
size, cleaned name next to the raw title), each skipped model with its reason,
and her notes. At the end it prints the totals: characters, costume rows,
models and GB to download (`original_file_size`, 1 GB = 10^9 bytes).
Results on 2026-10-08, with the default `--max-outfits 30` and no
`--publisher` (so `personal_commercial_use` must be `profit`):

| run | new characters | costume rows (starter + outfits) | download |
| --- | --- | --- | --- |
| shortlist only, no dedupe key | 286 | 665 (286 + 379) | 10.93 GB |
| shortlist, complete dedupe (`SUPABASE_PAT`) | 261 | 610 (261 + 349) | 9.99 GB |
| `--recheck`, complete dedupe (what `--commit` would plan, before review) | 175 | 457 (175 + 282) | 7.15 GB |

The shortlist runs see names only (no tags, descriptions, licences or BOOTH
data), so they over-count. The `--recheck` run made 1,114 VRoid Hub calls and
took about 22 minutes. What it found:
- **Already in the DB:** 25 characters.
- **Licence drift:** none. All 253 licence failures are models the crawl had
  already rejected.
- **Personal use only:** 81 models are `personal_commercial_use` `nonprofit` or
  `disallow`. They are left out unless `--publisher company`.
- **Other terms** (vendor licence, credit, author, the file's licence): none.
- **Missed by the crawl:** 58 planned models (`+live`).
- **Minor-coded:** 34 models, 12 of them through a description. Two characters
  state their age there (15, and 16 with her high-school year); the importer
  before this review would have imported their models.
- **Held:** 172 models. Reasons (a model can have several): 80 school-age
  wording (35 only in a description: one character's description makes all 27
  of her models school-age), 73 BOOTH parts, 20 someone else's character,
  4 descriptions that forbid use, 4 child heights, 1 author handle. After the
  screen, 98 characters have nothing left to import.
- **Over the cap:** 24 models (0.32 GB) beyond `--max-outfits 30`.
- **Credit required:** 40 of the planned models.
- **Imported earlier but rejected now:** 21 models, marked
  `⚠ ALREADY IN THE DB` with the row they belong to: BOOTH parts, licences
  that only allow personal non-profit use (fine for a company publisher only),
  one licence that now says `sexual_expression=disallow`, and three whose
  author writes "Don't distribute my models" and "do not use for purposes of
  18+". The importer never changes existing rows: decide on each.
- **Authors with minor-coded models:** 9, listed at the end with the
  characters of theirs that are planned or already in the DB.

### The rows

Rows match what the app reads (see the comments in `character_row` /
`costume_row`).

**Character row:**
- `is_public=false`, `available=false`, `tier='pro'`.
- `price_ruby` and `price_vcoin` are NULL. A CHECK requires `> 0`, so the
  old importer's `price_ruby: 0` failed every insert.
- `base_model_url` is the base model's R2 `.vrm`, `thumbnail_url` is the
  portrait, and `avatar` is the full-body image.
- `description` is NULL (the tagline is written in the CMS) and
  `instruction` is a placeholder persona.
- `order` is NULL, `difficulty` is 2.
- `data.source` holds the provenance below.

**Costume row:**
- `model_url` is the `.vrm`, which is what the viewer loads. It ends in
  lowercase `.vrm` with no query string.
- `thumbnail` is the portrait.
- `url` is the full-body image. `url` is the outfit's 2D art:
  `loadCharacter.ts` sets it as her avatar on relaunch without checking it.
  The 50 legacy VRoid rows that store the bare model id there draw a blank
  2D avatar. New rows keep the model id in `metadata.source` and in the
  `model_url` file name.
- `unlock_type` is `'default'` for the starter row and `'pro'` for the rest.
  `tier` is sent as the value the `sync_tier` trigger derives anyway.
- `price_ruby` is NULL and `unlock_at_level` is 1.
- `available` is true on a new (hidden) character and false when attached
  to an existing one.
- `description` reads "VRoid Hub · title · by author" (only the CMS shows it).
- `created_at` is staggered by 1 ms per row, so the outfit sheet keeps the
  hearts order. One INSERT would otherwise give every row the same `now()`.

**Write order:** re-check every staged model (above), insert the character,
insert all her costume rows in one INSERT, then PATCH `default_costume_id`
(the starter row) and `total_costumes`. Nothing in the DB maintains either
column. If any step fails, the character is deleted again (her costumes
cascade) and the run stops. A row is only written when it is complete.

**Provenance**, in `characters.data.source` and `character_costumes.metadata.source`:
- `site`, `url` (`https://hub.vroid.com/en/characters/<cid>/models/<mid>`),
  `character_id`, `model_id`, `character`, `model`.
- `author` (the uploader) and `author_id`. Both are required.
- `credit`: `necessary` unless the API licence, the file's licence and the
  download licence all say `unnecessary`. `license` holds the API's eight
  licence fields as VRoid sent them.
- `publisher`: whose commercial-use term the licence was checked against.
- `vendor_specified_license`, `vendor_flags`, `other_users_available` and
  `age_limit`, as VRoid sent them.
- `checked_at` (the last licence read before the INSERT), `imported_by`, the
  source image URLs with `vroid_default` (VRoid's own render, or the author's
  art), and the VRoid version.
- `vrm_author`, when the name inside the file differs from the uploader.
- `booth_items`, when any.
- At commit time, the file's `sha256`, `file_size` and embedded licence
  (`vrm`), and `download_license`: the id VRoid issued when the licence was
  accepted (and its licence, when the answer carries one).

This is a superset of the `{site, url, model, author, license}` block that the
74 existing VRoid characters carry. Nothing in the app reads `metadata`, and
the keys the app does read from `data` (`live2d`, `coming_soon`, …) are never
written.

**Files** go to R2 under `app-art/vroid/<cid>/<mid>.vrm`, `…_portrait.<ext>` and
`…_full.<ext>`, through `r2-presign`, which only signs `app-art/` and
`qa-builds/` keys. The keys depend only on VRoid ids, so a re-run overwrites
instead of duplicating. Each upload is read back: it must be complete, start
with the same bytes, and send `Access-Control-Allow-Origin: *`, because Android
loads the viewer from `file://`. The images are VRoid's previews: a stop-gap
until our renders replace them (see below). The bucket is public, so they are
reachable from import time; `vroid_default=false` marks art the author made
(which the model licence may not cover): replace those first. A key that was
uploaded but ended up in no row (the model was dropped later) is printed as
`orphan`; a re-run of that model overwrites it.

### Dedupe

The importer matches by VRoid character id and model id, never by name. It
looks for those ids in `data.source`, `metadata.source`, the legacy numeric
costume `url`, and the `<id>.vrm` file names. Names are only kept unique.

| key in the environment | dedupe |
| --- | --- |
| `SUPABASE_SERVICE_KEY` | complete (required by `--commit`) |
| `SUPABASE_PAT` | complete, read-only SQL via the Management API (as `write_personas.py`) |
| `SUPABASE_ANON_KEY` | PARTIAL: hidden characters are invisible (Haru, Nozomi plan as new) |
| none | **SKIPPED**: the header and totals say so; DB models plan as new |

A character that a crashed run left without a starter outfit is printed as a
WARNING at the top of every run.

### Content screen

The screen reads character and model names, the tags, the VRM title and
reference, and the model's and the character's descriptions (live data only:
`--recheck` or `--commit`). It can only take models out.

- **Excluded, no override**: minor-coded words such as ショタ, ロリ (not
  ロリータ or ゴスロリ), 小学, 中学, 子供, ランドセル, loli, shota, kid,
  child, JS and JC; school wear in a small or medium body ((小)スクール水着);
  and a stated age under 18 (16歳, 十七才, "17 years old", not 3歳年上 or
  15歳以上). This applies to the descriptions too, so a disclaimer such as
  "not for kids" also excludes a model: the screen errs that way on purpose.
- **Held** until a person reviews the model and lifts that hold, by name, under
  `release` (one release never lifts another kind of hold):
  - `school`: school-age wording (制服, セーラー, スクール水着, 学園, 学生,
    部活, 体操服, ブルマ, JK, school, student, uniform, sailor, (小)/(中) sizes).
    It catches adult uniforms too ("combat uniform"); release those;
  - `height`: a body under 145 cm ("Dracula 130cm", 身長135);
  - `third_party`: someone else's character (初音ミク, Sonico, DDLC, FNaF,
    SNK, My Hero Academia, Pumpkin Night, …), a tag shaped like a character's
    name (`Toga_Himiko`), or an author handle like `…R34`. Every Libinika
    model says "A Parody to Monika from DDLC";
  - `age_limit`: VRoid's R18/R15/adult flag;
  - `author`: a minor-coded author handle (ロリババア…);
  - `description`: the model's or the character's description forbids
    redistribution, commercial use, modification, reposting or sexual use
    (再配布禁止, 二次配布禁止, 商用利用不可, R18禁止, "Don't distribute my
    models", "do not use for purposes of 18+", …). Read it before naming this
    one: it contradicts the licence fields.
- **Held, lifted only per BOOTH item**: BOOTH parts
  (`character_model_booth_items`). BOOTH terms often forbid redistribution
  (再配布✖); allow a reviewed item with `booth_allow`.
- **Never lifted**: VRoid vendor flags, and an author who does not allow use
  by other users.
- **Held at `--commit`, no override**: a download whose file is not a VRM, or
  whose embedded licence is stricter than the filter. VRoid writes its licence
  into the file as `hub.vroid.com/license?…` URLs (`otherLicenseUrl` and
  `otherPermissionUrl`): every one is read, every value of a repeated key
  counts, all five keys must be there, and `allowed_to_use_user` must be
  `everyone`. `allowedUserName` and `sexualUssageName` always apply;
  `commercialUssageName` applies without a VRoid URL, or to an individual
  publisher. The planning check runs the same test on the API's copy of the
  file's meta.
- **Notes only**: male? / not a person? / childlike proportions?, named by
  us, credit required, a description that mentions terms or credit, Japanese
  or missing outfit names, size variants, and authors with minor-coded models
  elsewhere (listed again at the end of the run, with their characters
  already in the DB).

Tags, descriptions, BOOTH parts and vendor flags are only known live. A dry
run without `--recheck` cannot see them, but `--commit` always checks them.

### Curation file

`--curation FILE` (JSON) records review decisions. It can only remove models
or choose between licensed ones, and `--commit` needs it:

```json
{"approve":     ["<model id>"],
 "skip":        ["<character or model id>"],
 "release":     {"<model id>": ["school", "third_party"]},
 "booth_allow": ["<BOOTH item id>"],
 "characters":  {"<cid>": {"name": "Remi", "base": "<model id>", "target": "<tm uuid>"}},
 "outfits":     {"<model id>": "Swimsuit"}}
```

- `approve`: models a person looked at (her VRoid page, previews, tags and
  description) and found fit. `--commit` stages nothing else.
- `release`: the holds lifted for one model: `school`, `height`,
  `third_party`, `age_limit`, `author`, `description`. Anything else (or the
  old list form) is refused with a message.
- `characters.<cid>.name` must be a usable name (letters, spaces, hyphens);
  `base` picks her starter model; `target` picks the character to attach to.
- `outfits` names an outfit (in English: the app has no translation for them).

### Naming

VRoid titles are the author's, not the character's: `【Free model】Ao`,
`MeshModelさん`, `TVBOXシリーズ`. Imported verbatim, they would ship a
girlfriend called "Free Model".

**Character names:** the importer takes a Latin name from the title when one
reads like a name (`文目 冷美(Ayame Remi)` → Ayame Remi, `Swimsuit Mari` →
Mari). Otherwise it uses a pool of ~400 ordinary given names that skips names
already in the DB, and prints `(named by us)`. Names contain only letters,
spaces and hyphens, because they are pasted into single-quoted JavaScript in
`VRMViewer.tsx`.

**Outfit names:** these come from the cleaned title, with `ver.`, `【Free】`,
`(DL可能)` / `(DL化)`, a `cluster` prefix, the character's own name and
version tags removed. `'` becomes `’`, and `"`,
`\` and line breaks are dropped. "nude" becomes "Bare", because `become_nude`
picks any outfit with "nude" in its name. Names are unique within a character
and at most 28 characters long.

## Downloading the models (needs VROID_COOKIE)

The crawl gives metadata and preview images. Downloading the `.vrm` needs a
signed-in VRoid Hub session: `POST /api/download_licenses` answers
`401 COMMON_SIGNED_IN_REQUIRED` without one.

`fetch_vrm` accepts either answer shape (a `download_url`, or a licence id for
`/api/download_licenses/{id}/download`), stores the licence id in
`source.download_license`, and checks any licence the answer carries. It sends
the cookie only to hub.vroid.com and follows redirects by hand, so the cookie
never reaches the file host. No request that carries a credential (the cookie,
the service key, the PAT, the presign token) follows a redirect.

**Not yet verified end to end.** The first real run should be one approved
model: `--commit --publisher … --curation review.json --only <cid>
--max-outfits 0 --limit 1`. Save its whole output before retrying: a 401/403
prints VRoid's answer and content type, because VRoid Hub may want more than
the cookie (a CSRF header, for one).

`--commit` refuses to start, before any network call, unless `VROID_COOKIE`,
`SUPABASE_SERVICE_KEY` and `R2_PRESIGN_TOKEN` are set, `--publisher` is given,
and `--curation` approves at least one model. See `docs/CREDENTIALS.md` for the
presign token. Errors go to stderr; a dry run whose live checks failed exits 1.

One question is still open: whether VRoid Hub's terms allow scripted downloads
with a personal session. The model licence covers re-hosting the file, not how
it is fetched.

## Before publishing imported rows

Imported rows are written hidden. Do all of this before an editor sets
`is_public=true, available=true`:

1. **Deploy the CMS price fix first.** `web-admin` used to show a NULL price
   as "0" and send 0 on every save, which `CHECK (price IS NULL OR price > 0)`
   refuses, so no edit of an imported row could be saved, not even a rename.
   It now maps an empty box or 0 to NULL (`priceOrNull` in `src/lib/db.ts`,
   used by `CharacterEditor.tsx`, `OutfitsTab.tsx` and the quick price cells).
   Steps 4 to 6 need the deployed version.
2. **Credits.** Every model whose `source.credit` is not `unnecessary` must be
   credited publicly before its rows go live. Today `/credits` names no VRoid
   author. Its "3D characters" paragraph says the models are "licensed to or
   created for TrueMate", which is not accurate. Plan (not implemented yet):
   - In `web-legal/credits.html`, replace the "3D characters" section
     (lines 21–22) with "3D characters from VRoid Hub". It needs a one-line
     intro, `<ul id="vroid-credits">`, a `<noscript>` line pointing to VRoid
     Hub, and ~30 lines of inline script that run two queries with the
     public anon key (the one `web-admin/src/lib/supabase.ts` already ships;
     never the service key). Both queries were verified against PostgREST
     on 2026-10-08:
     - characters (64 rows today):
       `characters?select=id,name,src:data->source&is_public=eq.true&available=eq.true&data->source->>site=eq.VRoid%20Hub`
     - outfits (37 rows today): `character_costumes?select=costume_name,url,src:metadata->source,ch:characters!character_costumes_character_id_fkey!inner(name,is_public,available,src:data->source)&available=eq.true&ch.is_public=eq.true&ch.available=eq.true&or=(url.match.^[0-9]+$,metadata->source->>site.eq.VRoid%20Hub)`.
       The FK hint is required: without it PostgREST answers HTTP 300,
       because the two tables have two relationships. The `or` covers legacy
       rows (numeric `url`) and rows from this importer (`metadata.source`).
   - Render each line as "author — model (as TrueMate name[, outfit])",
     sorted by author, linked to the model's VRoid Hub page, and marked
     **unless** `source.credit == 'unnecessary'` (VRoid's `default` and a
     missing value mean the duty is unknown: credit them).
   - A legacy outfit with no `metadata.source` takes its author from the
     parent character, and its link from the parent's VRoid character id
     plus the numeric `url`.
   - Build the list with `textContent` only, because names are third-party
     text. Accept only links that start with `https://hub.vroid.com/`.
   - Fix the same claim at `web-legal/index.html:151` and the footer at
     `credits.html:36`, and the `set.credits_desc` string (Settings →
     "Credits & licenses") in all 10 locales. Redeploy `web-legal` once (see
     its README). From then on the list follows the DB as rows are
     published.
   - Optional: a credit line per character in `CharacterPreview.tsx`, copying
     the Live2D one (lines 357–362). Add `source?` to the `PreviewCharacter.data`
     type (lines 47–60); `CharacterSheet.tsx:186` already selects `data`.
   - A generated static page is the alternative, but it goes stale after every
     import.
3. **Look at every model.** Render it (`tools/vroid/render`), and hide or
   delete anything that is not a finished girlfriend model: mascots
   (TVBOX), garment demos, male-looking models, odd or childlike proportions
   (`20260930210000_hide_broken_models.sql` is the precedent). Act on every
   `note` the dry run printed, and on every author listed under `⚠ authors`.
   **Her starter model is special**: the `'default'` row is also
   `characters.base_model_url`, `thumbnail_url` and `avatar`, which
   `selectCharacter.ts` and `loadCharacter.ts` load whatever the costume rows
   say, and `characters.default_costume_id` points at it (a foreign key, so
   the row cannot simply be deleted). Hiding it leaves her on that model with
   no starter outfit to switch back to. So:
   - *before importing*, list the model under curation `skip` (or pick
     another with `characters.<cid>.base`) and re-plan;
   - *after importing*, either delete the whole character (her costume rows
     cascade) and import again, or point `base_model_url`, `thumbnail_url`,
     `avatar` and `default_costume_id` at another of her rows, set that row's
     `unlock_type` to `'default'`, and only then hide or delete the old one.
4. **Replace the stop-gap art** with renders of our own, starting with the
   images whose `source.images.vroid_default` is false (the author's own art).
   The rows to update are `thumbnail_url` / `avatar` (and `small_thumb_url` /
   `small_avatar`, which imported rows leave NULL) on characters and
   `thumbnail` / `url` on costumes (`20260930200000_costume_thumbnails.sql`
   did this for the 50 legacy outfits). Cut-outs (`*_nobg`) are optional.
5. **Name every outfit in English.** About 4 in 10 imported names are
   Japanese, and some are "Outfit N"; the app has no translation for costume
   names, and the name is what the chat model is told she is wearing. Give
   names through curation `outfits` before importing (the dry run lists the
   ids in a `note`), or in the CMS after step 1. Keep one of each set of size
   variants (`note size or height variants`).
6. **Write her tagline and personality** in the CMS. `description` is NULL and
   `instruction` is a placeholder marked `[TODO`; the CMS refuses to publish
   a character in that state. `write_personas.py generate out.json --ids
   <uuid>,…` (or `--include-hidden`) writes personas for hidden characters.
7. **Re-check the licence** right before publishing:
   `SUPABASE_PAT=… python3 import_characters.py --recheck --publisher … --only <cid>`.
   Every model must still show as already in the DB, with no ⚠ line.
8. **Publish** by ticking `is_public` and `available` on the character. A new
   character's outfits are already `available`; attached outfits are not.
   Then, after all hides and deletes, recount `total_costumes` for **every**
   character you published or changed (new or attached): nothing in the DB
   maintains it, and the picker shows it as "N outfits" and uses it for the
   HOT badge:
   `update characters c set total_costumes = (select count(*) from character_costumes k where k.character_id = c.id and k.available) where c.id in ('<id>', …);`
   Four live rows are stale today; running the same statement once without
   the `where c.id in (…)` fixes them. (A trigger on `character_costumes` would
   make this automatic; it does not exist yet.)

## Other scripts here

- `rc.py`: reads, creates and sets Firebase Remote Config parameters. The CMS
  can only edit keys that already exist, so new flags are created with this.
- `pushbuild.sh`: uploads a build to R2 (the header explains the token).
- `write_personas.py`: generates personas for thin-persona characters
  (public ones by default; `--include-hidden` or `--ids` for imported ones).
- `render/`: VRM renders for picker cards and outfit thumbnails.
