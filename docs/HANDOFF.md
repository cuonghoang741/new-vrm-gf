# Where things stand — 2026-09-25

Written to pause cleanly. Read this before picking the work back up.

Companion docs: `BUILD.md` (how to build), `CREDENTIALS.md` (where secrets
live). This file is the state, the blockers and the traps.

---

## 1. Blocked, needs a decision

### VRoid Hub crawl — cannot download the models

The crawl and licence filter work. What does not work is getting the `.vrm`
file, and without one a `characters` row is dead weight: the app only shows a
character whose `base_model_url` is a VRM, and the CMS flags
`thiếu base_model_url`.

```
POST https://hub.vroid.com/api/download_licenses
  → 401 {"code":"COMMON_SIGNED_IN_REQUIRED"}
```

`is_downloadable: true` means *the author permits downloads*, not *anonymous
download works*. A signed-in VRoid Hub session is required.

What already exists (in the session scratchpad, **not** the repo — copy
anything worth keeping before the scratchpad is cleaned):

| file | contents |
| --- | --- |
| `vh_bikini_raw.json` | 680 swimwear models, 7 search terms |
| `vh_bikini_shortlist.json` | 105 characters whose licence permits shipping; 45 have 2+ outfits |
| `vh_bikini.py` | the keyword crawler |
| `vh_bikini_shortlist.py` | licence filter + ranking |

The licence filter is the part not to loosen. It keeps a model only when
`redistribution`, `corporate_commercial_use`, `modification` are all `allow`,
`characterization_allowed_user` is `everyone`, and `sexual_expression` is
`allow`. Anything less cannot be hosted on our R2 and shipped in a paid app.

**To unblock:** a VRoid Hub session cookie, or identify the source the earlier
21 characters came from. Their models sit on
`pub-6671ed00…r2.dev/regen/2026-09/vrm-vr…` and the scratchpad holds 36 `.vrm`
files plus BOOTH scrape artefacts — so BOOTH was the source, but at least one
of those items records `再配布✖` (redistribution forbidden), so BOOTH needs a
per-item licence check before anything is re-hosted.

### 2D character art missing after first onboarding

Reported on a real device, not reproduced, cause unknown. The first screen a
new user sees, so it blocks a store submission.

Ruled out: the data. All three giftable characters (Emmie, Rina, Yukie) have
`avatar`, `avatar_nobg` and `base_model_url`.

Prime suspect: the welcome-paywall flow (see §2) opens a modal over Play the
instant onboarding finishes, and the 2D layer is **unmounted entirely** while
`is3DMode` is true (`SceneLayer.tsx`) — so "nothing shows" is consistent with
being in 3D before the model has loaded.

Next step is evidence, not more guessing: a screenshot, or
`adb logcat -s ReactNativeJS` across onboarding → Play.

---

## 2. A second session was editing this tree

At the time of writing, 17 files are modified and uncommitted by another
Claude session, plus an applied-but-untracked migration
(`20260924110000_pro_ruby_rolling_week.sql`). Its work includes a welcome
paywall after onboarding (`services/session.ts`, `AppNavigator`,
`PlayScreen`), `pro_or_ruby` on `CharacterSheet`, and copy changes.

**Every APK/AAB built on 2026-09-24 evening contains that work.** It compiles,
but it has not been reviewed by the session that built those binaries. Get it
committed before trusting a build.

That session also found a real bug in the PRO weekly ruby (see §4) — the
migration fixing it is already applied to the database.

---

## 3. Store configuration

RevenueCat project `proj4c49c311`, entitlement `pro`, offering `default`.
There is **no App Store app in the project** — only Play Store and Test Store —
so iOS has no weekly and no flash-sale product at all.

As served to the Android app (verify with the public key, not the admin API —
see below):

```
$rc_weekly          truemate.pro.weekly
$rc_monthly         truemate.pro.monthly
$rc_annual          truemate.pro.yearly      (kept: production still uses it)
weekly.flash_sale   truemate.pro.weekly.flash_sale
truemate.ruby.1..6
```

`weekly.flash_sale` was an **empty package** for a day — it existed in the
dashboard with no product attached, so RevenueCat never sent it to the app and
the gift box opened onto "no offer". Attaching it needs a path under the
*project*, not the offering; the offering-nested route 404s and that is what
made this hard to see:

```
POST /v2/projects/{project_id}/packages/{package_id}/actions/attach_products
     {"products":[{"product_id":"<prod id>","eligibility_criteria":"all"}]}
```

**Check what the app actually receives**, which is not what the admin API
shows:

```bash
curl -s https://api.revenuecat.com/v1/subscribers/probe/offerings \
  -H "Authorization: Bearer goog_UWaWUNwJbAHkjnsXXzIPToKeefY" \
  -H "X-Platform: android" | python3 -m json.tool
```

The paywall sells **weekly and monthly**; yearly is gone from the UI but left
in RevenueCat so existing subscribers keep renewing.

---

## 4. Remote Config flags (Firebase `truemate-e3401`)

Created with `scratchpad/rc.py`; the CMS can only edit keys that already exist.

| key | default | what it does |
| --- | --- | --- |
| `ads_*` | on | per-format ad kill switches |
| `chat_v2_enabled` | true | route chat to `gemini-chat-v2` |
| `chat_inline_photo_enabled` | true | photos chosen inside the chat turn |
| `chat_safe_mode` | false | strict SFW policy over the persona |
| `flash_sale_test_mode` | **false** | **turn on to test the flash sale** |

`flash_sale_test_mode` lifts the two gates that make the offer untestable: one
window per device per day, and never for an account that has ever purchased.
It changes *when* the offer appears, never the price. Turn it off afterwards.

---

## 5. Building and shipping

`BUILD.md` documents EAS. What was actually used here is a local Gradle build,
which has two traps:

```bash
# 1. JAVA_HOME is not set in a fresh shell; the JDK is Homebrew's
export JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.20.1/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"

# 2. prebuild DELETES android/app/upload-keystore.jks — copy it back every time
TRUEMATE_ABIS=armeabi-v7a,arm64-v8a npx expo prebuild -p android --no-install
cp upload-keystore.jks android/app/

cd android && ./gradlew bundleRelease \
  -PTRUEMATE_UPLOAD_STORE_FILE=upload-keystore.jks \
  -PTRUEMATE_UPLOAD_STORE_PASSWORD=… -PTRUEMATE_UPLOAD_KEY_ALIAS=… \
  -PTRUEMATE_UPLOAD_KEY_PASSWORD=…        # passwords in credentials.json
```

Always verify the signer before handing a file over — a build signed with the
debug key is what Play rejects:

```bash
keytool -printcert -jarfile app-release.aab | grep SHA1
# must be 9A:C2:5A:5F:EC:E8:D7:44:A7:3D:F3:AF:E3:7B:2A:95:31:1B:75:CE
```

**ABIs.** `plugins/withAbiFilter.js` pins `arm64-v8a` because prebuild
otherwise restores all four and the x86 emulator libraries are 72 MB of a
179 MB APK that no phone can use. For an AAB pass
`TRUEMATE_ABIS=armeabi-v7a,arm64-v8a` — Play serves only the matching split, so
including 32-bit costs users nothing.

**versionCode** is minutes-since-epoch, automatic. Last built: **29837817**
(APK) / **29837813** (AAB).

### Hosting

Netlify is unusable: **every site on the `cuonghpc-work` team returns 401**,
including `truemate-cms`. Builds go to Cloudflare R2:

```bash
scratchpad/pushbuild.sh <file> [name]   # prints the public URL
```

It calls the `r2-presign` edge function on the **Yuuki** project
(`hpjhqezgfqztcafaknzk`), which reuses that project's R2 secrets and returns a
15-minute presigned PUT URL, so the bytes go straight to Cloudflare and the R2
keys never leave the server. Guarded by header `x-presign-token` against the
`R2_PRESIGN_TOKEN` secret there; writes limited to `qa-builds/` and `app-art/`.

Also on the Yuuki project: **`art-gen`**, same guard, generates a UI asset from
a prompt using that project's OpenRouter key (its Gemini key is out of quota).
That is how `app-art/flash-gift.png` was made.

The CMS build is clean but **cannot be deployed** until the Netlify account is
sorted, or the CMS is moved to R2 (it is a static site, so R2 would work).

---

## 6. Done recently, for context

- **Play AI-content policy fix** — the rejection was "no in-app way to report
  offensive AI content". Three entry points now: long-press a message, a flag
  in the media lightbox, and a Settings row. All file through
  `report_content()`; `content_reports` has no INSERT policy on purpose.
- **PRO = 500 ruby a week.** Granted, not claimed. Originally keyed on the ISO
  week, which the other session correctly spotted as exploitable once a weekly
  plan existed (subscribe Sunday evening → paid for two ISO weeks). Now a
  rolling 7 days, capped at 8 weeks of backfill.
- **`gemini-chat-v2`** — deliberately beside `gemini-chat`, which is untouched
  and still serves production. Adds safe mode and photos chosen inside the same
  LLM turn, matched on `medias.keywords`.
- **Flash sale** — 3-hour window opened by *closing* the paywall, once a day,
  never for an account that has purchased. `storePrice.effectivePrice` exists
  because on Play `priceString` is the *recurring* price and the discount lives
  in `defaultOption.introPhase`; reading the obvious field shows the sale
  package and the normal package at the same price.
- **CMS character cards render the real VRM** (preview only, nothing uploaded).

### Traps worth remembering

- **A `require()`d PNG renders blank in the Android release build.** The
  drawable is in the APK and correctly named; `expo-asset` resolves local
  images through the embedded update manifest, which lists 24 assets and none
  of the app's own. `assetBundlePatterns` does not change that. The flags and
  the rail's character icon are inlined as base64 for this reason.
- **`expo-blur` cannot blur a WebView/GL surface on Android.** Blur at the
  source instead: `blurRadius` on an image, `setPreviewBlur` inside the
  WebView. A BlurView laid over content is close to a no-op there.
- **Percentage width inside an auto-width parent collapses in Yoga.** It
  clipped chat bubbles to a sliver.
- **`vrmReady` is set once, by the viewer's `onReady`.** Setting it false as a
  "reload" is a one-way latch that disables the model loader for the rest of
  the session.

---

## 7. Open, lower priority

- Rina's description still names "Natsuki" (visible in the character picker).
- 166 of the 219 media imported from Yuuki have no description anywhere, so the
  chat photo picker can only choose randomly for them. Needs vision captioning.
- 112 older media carry keywords but are `available = false`; never published.
- `gemini-chat` (production) still ends its prompt with
  `and you can act as shemale`. Removed in v2, deliberately left alone in the
  live function.
