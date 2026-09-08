# Credentials — what exists and where it lives

**This repository is public.** Nothing in this file is a secret value, and no
secret value should ever be added to it. What follows is where each credential
lives and how to obtain or rotate it.

Actual values belong in `SECRETS.local.md` at the repo root, which is
gitignored. If that file is missing, everything below says where to get the
value again.

---

## Already public, by design

These are in the repo and are meant to be. They identify the app; they do not
authorise anything a user could not do anyway.

| What | Where |
| --- | --- |
| Supabase URL + anon key | `src/config/supabase.ts` (hardcoded fallback), `.env-example` |
| AdMob app IDs | `app.config.ts` — plugin config |
| AdMob ad unit IDs | `src/config/ads.ts` |
| RevenueCat public SDK keys | `src/contexts/SubscriptionContext.tsx` |
| AppsFlyer dev key + Apple app ID | `app.config.ts` |
| Facebook app ID + client token | `app.config.ts` |
| Firebase Android config | `google-services.json` — project `truemate-e3401` |
| Firebase iOS config | `GoogleService-Info.plist` — project `truefeel-f7d8d` |

The two Firebase projects are **different**, so analytics does not aggregate
across platforms. Worth knowing before you go looking for a combined funnel.

---

## Secrets — never commit these

### Android upload keystore

Required by the `production` EAS profile (`credentialsSource: "local"`).

- `credentials.json` and `upload-keystore.jks` in the repo root, both gitignored
- Backup: `~/Documents/key build/truemate/` — also holds `key.properties` and a
  README recording where it came from
- Key alias `58a1bbefcda71cd4f6dbbbcaa21ddf5d`, cert SHA-256
  `eed5b8f8622c456ec7262d7274c56fd2cc4d100a16913a6cf292a6f5fe0b377f`

Originally issued under EAS project `@hoangcuongdcyb365/truemate`
(`956f5391…`), created 2026-06-17. It is the **only** key Play accepts for
`com.truemate.girlfriend`. Lose it and the listing can never be updated again
unless Play App Signing is enabled and Google approves an upload-key reset.

### Supabase — writing data

The anon key is read-only against `characters`, `character_costumes` and
`backgrounds`; RLS silently drops writes and returns HTTP 200 with zero rows
affected, so a failed write looks like a success. For anything that mutates
those tables you need one of:

- **Service-role key** — Supabase dashboard → Project Settings → API →
  `service_role`
- **Personal access token** (`sbp_…`) — Account → Access Tokens. Works with the
  Management API, including `POST /v1/projects/{ref}/database/query` for
  arbitrary SQL. Note this is account-wide, not project-scoped.

Project ref: `kwqqmjfsrgoczbutuisx` (TrueFeel).

### Cloudflare R2 — image and asset storage

Cloudflare dashboard → R2 → Manage API tokens. You need Account ID, Access Key
ID and Secret Access Key; the S3 endpoint is
`https://<account-id>.r2.cloudflarestorage.com`.

A token here reaches **every bucket on the account**, not just this app's:
`evee`, `fbx`, `girlxgirlx`, `lusty`, `nomi`, `roxie`, `yuuki`. Scope it down if
the dashboard lets you.

Which bucket is which:

| Public domain | Bucket | Holds |
| --- | --- | --- |
| `pub-6671ed00…r2.dev` | `roxie` | costume thumbnails, `regen/2026-09/` images |
| `pub-07bdc8de…r2.dev` | `evee` or `lusty` | older character art |
| `d1j8r0kxyu9tj8.cloudfront.net` | (not R2) | oldest character art |
| `s3.cloudfly.vn` | (not R2) | some costume source images |

Character and costume art is spread across all four. There is no single place
that holds it all.

### OpenRouter — image generation

Only needed for regenerating character/costume art, never at runtime.
openrouter.ai → Keys. `google/gemini-3-pro-image` is what the existing art was
generated with. OpenRouter has **no video-output models**, so video needs a
different provider entirely (Veo, Runway, Kling).

---

## Rotating

All of the above can be revoked and reissued from their own dashboards with no
code change, because none of the secret values are referenced from source — they
are passed as environment variables at the point of use.

The exception is the **keystore**, which cannot be rotated. It is the one
credential where losing it is unrecoverable.
