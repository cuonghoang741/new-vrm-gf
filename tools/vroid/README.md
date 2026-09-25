# VRoid Hub crawl

Finds character models that may legally ship in a paid app, ranked by how many
outfits each character has.

```bash
python3 vh_bikini.py            # → vh_bikini_raw.json   (not committed; ~3.8MB)
python3 vh_bikini_shortlist.py  # → vh_bikini_shortlist.json
```

`vh_bikini_shortlist.json` is committed: 105 characters that passed the licence
filter, 45 of them with two or more outfits, sorted by outfit count then hearts.

## The licence filter is the point

A model is kept only when `redistribution`, `corporate_commercial_use` and
`modification` are all `allow`, `characterization_allowed_user` is `everyone`,
and `sexual_expression` is `allow`. Anything short of that cannot be re-hosted
on our R2 and shipped. Do not relax it to raise the count.

## Blocked: downloading the models

The crawl gives metadata and preview images. Fetching the `.vrm` needs a
signed-in VRoid Hub session:

```
POST /api/download_licenses → 401 COMMON_SIGNED_IN_REQUIRED
```

`is_downloadable: true` means the author permits downloads, not that anonymous
download works. Until a session cookie is available this pipeline stops here,
and a `characters` row without a VRM is useless — the app only shows a
character whose `base_model_url` is a model file.

## Other scripts here

- `rc.py` — read/create/set Firebase Remote Config parameters. The CMS can only
  edit keys that already exist, so new flags are created with this.
- `pushbuild.sh` — upload a build to R2 (see the header for the token).
