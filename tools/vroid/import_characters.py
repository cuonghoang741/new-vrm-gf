#!/usr/bin/env python3
"""
Import licensed VRoid Hub characters into TrueMate.

Each VRoid Hub character in the shortlist becomes one `characters` row, built
on her most-hearted model, plus one `character_costumes` row per model. The
base model becomes her starter outfit, and every other model becomes a PRO
outfit (up to --max-outfits).

    python3 import_characters.py                         # dry run (the default)
    python3 import_characters.py --recheck --limit 5     # dry run on live licences
    python3 import_characters.py --show-rows --limit 1   # ...plus the rows --commit writes
    python3 import_characters.py --commit --publisher company --curation review.json --limit 1

The dry run changes nothing and needs no credentials. --commit is the only mode
that downloads, uploads or writes. It refuses to start unless VROID_COOKIE,
SUPABASE_SERVICE_KEY and R2_PRESIGN_TOKEN are set, --publisher says who
publishes TrueMate, and --curation lists the models a person approved.

Licence: a model is imported only if it passes the shortlist filter exactly
(`perm()` plus `is_downloadable`), and the stricter checks after it (the
publisher's commercial-use term, vendor licences, credit and author, the
licence inside the file). --commit re-checks each model live before
downloading it and again right before the INSERT; a dry run does the planning
check with --recheck. Models that fail are listed and never imported.
README.md has the whole contract.

Environment:
    SUPABASE_SERVICE_KEY  --commit: writes the rows; also gives full dedupe
    SUPABASE_PAT          dry run: full dedupe through read-only SQL
    SUPABASE_ANON_KEY     dry run: partial dedupe (cannot see hidden characters)
    SUPABASE_URL          default https://kwqqmjfsrgoczbutuisx.supabase.co
    R2_PRESIGN_TOKEN      --commit: uploads (docs/CREDENTIALS.md)
    YUUKI_REF             project hosting r2-presign (default hpjhqezgfqztcafaknzk)
    VROID_COOKIE          --commit: a signed-in VRoid Hub session, to download

Importing this module does nothing (no network, no environment reads). All
the work happens in main(), so the filter can be unit-tested on its own.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import http.client
import json
import os
import re
import socket
import struct
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SHORTLIST = os.path.join(HERE, "vh_bikini_shortlist.json")

HUB = "https://hub.vroid.com"
HUB_HEADERS = {"X-Api-Version": "11", "Accept": "application/json",
               "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
HUB_MIN_INTERVAL = 0.6           # seconds between VRoid Hub calls (asked: >= 0.5)
HUB_RETRY_DELAYS = (2, 5, 15)    # on 429 / 5xx / network errors
HUB_MAX_PAGES = 25               # the API serves at most 20 models a page

DEFAULT_SUPABASE_URL = "https://kwqqmjfsrgoczbutuisx.supabase.co"
DEFAULT_YUUKI_REF = "hpjhqezgfqztcafaknzk"
# r2-presign only signs keys under qa-builds/ and app-art/ (docs/CREDENTIALS.md).
# The keys depend only on VRoid ids, so a re-run overwrites the same objects
# instead of piling up copies.
R2_PREFIX = "app-art/vroid"
R2_PLACEHOLDER = "<r2-public>"   # stands in for the public base in dry-run rows
IMPORTED_BY = "tools/vroid/import_characters.py"

MAX_VRM_BYTES = 300 * 1000 * 1000
MAX_IMAGE_BYTES = 20 * 1000 * 1000
MB = 1e6
GB = 1e9


class Fatal(Exception):
    """Stops the whole run: credentials refused, or a DB write failed."""


class ModelSkip(Exception):
    """This one model cannot be imported; the rest of the run goes on."""


class HubError(Exception):
    pass


# ── the licence filter ──────────────────────────────────────────────────────
# Exactly vh_bikini_shortlist.py's perm() plus its is_downloadable check.
# Do not loosen it. Everything else in this file can only take models away.
LICENCE_RULES = (
    ("redistribution", "allow"),
    ("corporate_commercial_use", "allow"),
    ("modification", "allow"),
    ("characterization_allowed_user", "everyone"),
    ("sexual_expression", "allow"),
)
LICENCE_FIELDS = ("modification", "redistribution", "credit", "characterization_allowed_user",
                  "sexual_expression", "violent_expression", "corporate_commercial_use",
                  "personal_commercial_use")


def _licence(m: dict) -> dict:
    lic = m.get("license")
    return lic if isinstance(lic, dict) else {}


def perm(m: dict) -> bool:
    """Only licences that actually allow shipping this in a paid app."""
    lic = _licence(m)
    return all(lic.get(k) == want for k, want in LICENCE_RULES)


def passes(m: dict) -> bool:
    """A VRoid Hub model (API shape) that may be imported."""
    return m.get("is_downloadable") is True and perm(m)       # a JSON true, not "false" or [0]


def licence_failures(m: dict) -> list:
    """Why passes(m) is False, for the report. Empty exactly when it passes."""
    lic = _licence(m)
    out = [] if m.get("is_downloadable") is True else ["not downloadable"]
    if not lic:
        return out + ["no licence in the API response"]
    return out + ["%s=%s" % (k, lic.get(k)) for k, want in LICENCE_RULES if lic.get(k) != want]


# The checks below only tighten the filter above.
#
# Who publishes TrueMate decides which of VRoid's commercial-use terms applies:
# corporate_commercial_use for a company (a legal entity), personal_commercial_use
# for an individual or a sole proprietor. The filter always requires corporate
# use; unless --publisher company is given, personal use must allow profit too.
PUBLISHERS = ("company", "individual")


def publisher_failures(lic, publisher) -> list:
    """`lic` is a licence dict (None: unknown, as in the shortlist)."""
    if publisher == "company" or lic is None:
        return []
    v = lic.get("personal_commercial_use")
    if v == "profit":
        return []
    return ["personal_commercial_use=%s (a paid app needs profit unless --publisher company)" % v]


# latest_character_model_version.vendor_specified_license: terms that a VRoid
# item vendor (a sold base model or outfit) imposes on every model built with
# it. "default" means the vendor set nothing. Anything else must say what the
# filter requires, or be that field's most permissive value.
_RULE = dict(LICENCE_RULES)
_MOST_PERMISSIVE = {"personal_commercial_use": "profit", "violent_expression": "allow",
                    "credit": "unnecessary"}


def vendor_licence_failures(vsl) -> list:
    if vsl is None:
        return []
    if not isinstance(vsl, dict):
        return ["vendor licence unreadable: %r" % (vsl,)]
    return ["vendor licence %s=%s" % (k, v) for k, v in sorted(vsl.items())
            if v not in (None, "default") and v != _RULE.get(k) and v != _MOST_PERMISSIVE.get(k)]


def provenance_failures(m: dict) -> list:
    """Every imported row names its author and whether the licence asks for credit."""
    out = []
    if m.get("live"):
        credit = (m.get("licence") or {}).get("credit")
        if credit not in ("necessary", "unnecessary"):
            out.append("credit=%s (whether the author must be credited is unknown)" % credit)
    if not m.get("author"):
        out.append("no author name")
    return out


def needs_credit(m: dict):
    """True / False, or None when unknown (a shortlist model). Anything but an
    explicit 'unnecessary' counts as 'necessary'."""
    lic = m.get("licence")
    if not lic:
        return None
    return lic.get("credit") != "unnecessary" or bool(m.get("file_credit"))


# ── content screen ──────────────────────────────────────────────────────────
# Applied to character names, model names, tags, the VRM's own title and
# reference, and the model's and the character's descriptions (tags, VRM
# fields and descriptions only when the data is live: --recheck or --commit).
# It can only take models out, never put one back that the licence filter
# rejected. Keyword lists are never complete, which is why --commit also
# imports only models a person approved (Curation.approve).

# Minor-coded: never imported, and there is no override.
CHILD = re.compile(
    r"(ショタ|ロリババア|ロリっ?子|ロリコン|合法ロリ|(?<![ァ-ヴー甘])ロリ(?![ァ-ヴー])|ペド|"
    r"幼女|幼児|幼稚園|園児|小学|中学|女児|男児|子供|子ども|こども|キッズ|ランドセル|"
    r"[(（]\s*[小中]\s*[)）]\s*(?:スクール|スク水|制服|セーラー|学生服|体操|ブルマ|school)|"
    r"(?<![a-z])(?:shota|loli|lolis|pedo|kids?|child|children|toddler|js|jc)(?![a-z]))",
    re.I)
# An explicit age under 18: 16歳, 十七才, "17 years old". Not a relative age
# (3歳年上, "2 years older") or an age limit (15歳以上).
_NOT_AN_AGE = r"(?!\s*(?:年上|年下|差|違い|以上|以下|未満|上|下))"
MINOR_AGE = re.compile(
    r"((?<![\d.])(?:1[0-7]|[1-9])\s*(?:歳|才|years?[\s-]*old(?!er)|y/?o(?![a-z]))" + _NOT_AN_AGE + "|"
    r"(?<![一二三四五六七八九十百千])(?:十[一二三四五六七]?|[一二三四五六七八九])\s*(?:歳|才)" + _NOT_AN_AGE + ")",
    re.I)

# Held: skipped until someone reviews the model and lifts that hold for it by
# name under "release" in the curation file.
SCHOOL = re.compile(
    r"(高校|女子高生|女子校|学校|学園|(?<!大)学生|生徒|制服|セーラー|スクール|スク水|体操(?:服|着)|ブルマ|"
    r"部活|帰宅部|[(（]\s*[小中]\s*[)）]|"
    r"(?<![a-z])(?:jk|school\w*|high ?school(?:ers?)?|students?|uniforms?|sailors?|seifuku|sukumizu|"
    r"gakuen|gakusei)(?![a-z]))", re.I)
THIRD_PARTY = re.compile(
    r"(初音ミク|ソニコ|不知火|ホロライブ|にじさんじ|原神|ポケモン|ブルアカ|ブルーアーカイブ|ボカロ|"
    r"ボーカロイド|東方|艦これ|ウマ娘|シナモロール|サンリオ|パロディ|二次創作|ファンアート|"
    r"僕のヒーローアカデミア|ヒロアカ|鬼滅|呪術廻戦|ラブライブ|アイマス|プリコネ|"
    r"(?<![a-z])(?:miku|hatsune|sonico|shiranui|monika|ddlc|hololive|nijisanji|genshin|pokemon|"
    r"nikke|vocaloid|touhou|kancolle|umamusume|cinnamoroll|sanrio|cyberpunk|maloney|lola bunny|"
    r"parody|fan[\s_-]?art|fnaf|fnia|freddy'?s?|fazbear'?s?|fazclaires?|bonnie[\s_-]?(?:the[\s_-]?)?(?:bunny|rabbit)|"
    r"snk|king[\s_-]?of[\s_-]?fighters|"
    r"(?:boku[\s_-]?no[\s_-]?)?hero[\s_-]?academia|boku[\s_-]?no[\s_-]?hero|toga|himiko|pumpkin.?night|"
    r"rule[\s_-]?34|honkai|hoyoverse|blue[\s_-]?archive|azur[\s_-]?lane|arknights|evangelion|"
    r"sailor[\s_-]?moon|overwatch|final[\s_-]?fantasy|dragon[\s_-]?ball|naruto|kimetsu|"
    r"demon[\s_-]?slayer|jujutsu|chainsaw[\s_-]?man|spy[\s_-]?x[\s_-]?family|nier|danganronpa|"
    r"love[\s_-]?live|zenless|star[\s_-]?rail|kasane[\s_-]?teto)(?![a-z])|"
    r"(?<![0-9])r34(?![0-9]))", re.I)            # R34 also inside a handle: "ClucsuccR34"
# A body height a child has (an adult woman is ~150-170 cm): "Dracula 130cm", 身長135.
CHILD_HEIGHT = re.compile(r"((?<![\d.])(?:1[0-3]\d|14[0-4])\s*(?:cm|センチ)(?![a-z])|"
                          r"身長\s*[:：]?\s*(?:1[0-3]\d|14[0-4])(?!\d))", re.I)
# A tag like "Toga_Himiko" usually names someone's character. Tags made of
# ordinary words ("Big_Breasts", "Elf_Girl") are not that.
NAME_TAG = re.compile(r"(?<![A-Za-z])([A-Z][a-z]+)_([A-Z][a-z]+)(?![A-Za-z])")
TAG_WORDS = set("""
big huge small large long short tall thick breasts breast boobs hair eyes ears tail elf studio
project restart roid night day dark light style styles type ver version color colour
""".split())
# Only the per-model call carries the descriptions (--recheck fetches it too).
DESCRIPTION_RESTRICTS = re.compile(
    r"((?:再|二次)配布(?:は|を)?(?:禁止|不可|NG|✖|×|ご遠慮|しないで)|"
    r"商用(?:利用|目的)?(?:で(?:の)?(?:利用|使用))?(?:は|を)?(?:禁止|不可|NG|✖|×|ご遠慮)|"
    r"営利(?:目的)?(?:で(?:の)?)?(?:利用|使用)?(?:は|を)?(?:禁止|不可|NG)|非商用|個人利用(?:のみ|限定)|"
    r"改変(?:は|を)?(?:禁止|不可|NG)|(?:無断)?転載(?:は|を)?(?:禁止|不可|NG)|"
    r"redistribut\w* (?:is |are )?(?:strictly )?(?:prohibited|forbidden|not allowed|not permitted)|"
    r"(?:do not|don'?t|no) (?:re-?)?distribut\w*|no commercial|non-?commercial|not for commercial|"
    r"commercial use (?:is )?(?:strictly )?(?:prohibited|forbidden|not allowed|not permitted)|"
    r"personal use only|do not (?:re-?)?sell|"
    # ...or sexual use, which contradicts sexual_expression=allow: "do not use for purposes of 18+"
    r"(?:R-?18|18\+|成人向け?|アダルト|エロ|性的(?:な)?)(?:な)?(?:利用|使用|表現|用途|目的)?(?:で(?:の)?(?:利用|使用))?"
    r"(?:は|を)?(?:禁止|不可|NG|✖|×|ご遠慮)|"
    r"(?:no|not for|don'?t use (?:\w+ )*?for|do not use (?:\w+ )*?for)(?: the)?(?: purposes? of)? "
    r"(?:18\+|nsfw|adult|sexual|porn\w*|lewd|hentai|r-?18)|"
    r"(?:nsfw|sexual|adult|18\+) (?:use |content )?(?:is )?(?:strictly )?(?:prohibited|forbidden|not allowed|not permitted))",
    re.I)

# Printed for the curator, nothing more.
NOTES = (
    ("male?", re.compile(
        r"(男|兄|弟|おじ|じーさん|じいさん|爺|くん|君|[太一二三四五次]郎|健吾|校長|親父|オヤジ|"
        r"(?<![a-z])(?:boy|boys|man|men|male|guy|kun|"
        r"brother|bro|husband|father|dad|grandpa|genderbend)(?![a-z]))", re.I)),
    ("not a person?", re.compile(
        r"(マスコット|着ぐるみ|ロボ|ゾンビ|ピクトグラム|モンスター|(?<![a-z])(?:mascot|robot|bot|"
        r"zombie|furry|orc|monster|tv|tvbox|pictogram)(?![a-z]))", re.I)),
    ("childlike proportions?", re.compile(r"(ちび|チビ|(?<![a-z])(?:chibi|sd)(?![a-z]))", re.I)),
    ("terms in the description", re.compile(r"(利用規約|規約|クレジット|terms of use|credit)", re.I)),
)
TERMS_MENTION = NOTES[-1][1]


def screen_text(*parts) -> str:
    out = []
    for p in parts:
        if isinstance(p, (list, tuple)):
            out.extend(str(x) for x in p if x)
        elif p:
            out.append(str(p))
    return unicodedata.normalize("NFKC", " | ".join(out))


def minor_coded(text: str):
    hit = CHILD.search(text) or MINOR_AGE.search(text)
    return hit.group(0) if hit else None


def note_labels(text: str) -> list:
    return [label for label, rx in NOTES if rx.search(text)]


def name_tag(tags):
    """The first tag that looks like a character's name (First_Last), or None."""
    for t in tags or []:
        for a, b in NAME_TAG.findall(unicodedata.normalize("NFKC", str(t))):
            words = {a.lower(), b.lower()}
            if not words & (TAG_WORDS | NOT_A_NAME):
                return t
    return None


# ── naming ──────────────────────────────────────────────────────────────────
# VRoid names are often Japanese, decorated, or a handle rather than a name.
# The app shows this under her portrait, so it has to read like a person. It
# is also pasted into single-quoted JavaScript (VRMViewer.tsx), so: letters,
# spaces and hyphens only.
NAME_RX = re.compile(r"[A-Za-z][A-Za-z\- ]{1,19}")
WORD_RX = re.compile(r"[A-Za-z][A-Za-z\-]{1,11}")

# Words that mean the author titled the upload, not the character. Importing
# them verbatim ships a girlfriend called "Free Model" or "Cute Bunny Girl".
NOT_A_NAME = set("""
free model models sample samples test mesh avatar avatars vroid vrm download downloads
girl girls gal boy boys man men woman women lady kid kids cute sexy hot bunny bunnies
swimsuit swimwear bikini beach summer winter cat fox wolf dog elf furry emo orc demon
angel goth gothic black white pink red blue green gold golden silver purple dress
dresses outfit outfits costume costumes suit maid nurse school time desktop mate ver
version unoptimized optimized real viking warrior wonder scary corrupted big mommy
mama mom sister princess queen just the an of and new romance anime imagine moving
shoes actor npc bot robot series character chan kun san sama tan kawaii miss mrs mr
waifu commission fusion genderbend tomboy one prototype proto beta alpha final base
body idol vtuber project original oc my cool little baby chibi mini extras extra twin
legacy edition complete darkness sprinter support band going out craftwife novelai
makehuman cluster desktopmate
""".split())

# Used when the source has no usable name: ordinary given names, because she is
# a person in the app. The editor renames her in the CMS anyway. Names already
# in the DB are skipped at run time.
NAME_POOL = list(dict.fromkeys("""
Aiko Mira Yuna Sena Nari Kaori Elin Rika Sora Mei Nadia Yumi Cleo Riya Suzu Talia Hana
Vera Noa Kira Lumi Saki Ayla Rina Emi Zara Yui Nova Ines Maya Reia Soli Tara Umi Wren
Yara Akane Akari Ami Anri Ayaka Ayane Chiaki Chie Chihiro Chinatsu Emiko Ena Eri Erika
Fumika Haruka Hikari Himari Hinata Honoka Ibuki Iroha Izumi Juri Kanade Kanon Kaho
Karin Kasumi Kaya Kiko Kokoro Koharu Kotone Kurumi Madoka Mahiro Maiko Makoto Mana
Manami Marika Megumi Midori Miharu Mika Miki Mikoto Minami Misaki Mitsuki Miu Miyu Moe
Momo Nanami Naomi Natsuki Nene Niko Nodoka Reina Rino Risa Ruka Ruri Sae Sana Saya
Sayaka Shiho Shizuku Suzune Tamaki Tomoka Tsubaki Tsumugi Uta Wakaba Yoko Yuka Yukari
Yume Yuzu Ara Bora Dahye Eunbi Haeun Jia Jimin Jiwoo Minji Seoyeon Sohee Yuri Hayun
Dain Gaeun Yerin Yeji Sumin Seulgi Hyejin Lan Lian Ling Qing Xia Xinyi Yan Yue Zhen
Lili Jing Fang Hui Ning Rui Shan Ting Wen Yun Abby Ada Alice Alina Amber Amelia Anna
Bella Bianca Blair Brooke Callie Camila Cara Celia Chloe Clara Daisy Dana Delia Diana
Eden Edith Elena Eliza Ember Emily Emma Erin Esme Eva Faye Flora Freya Gemma Gia
Grace Hazel Heidi Helena Holly Ida Isla Jade Jana Jenna Julia June Kate Kayla Lacey
Laila Lara Laura Layla Lena Lila Lily Livia Lola Lucia Lucy Lydia Mabel Macy Maia
Mara Margo Maria Marie Megan Mila Mina Molly Nella Nina Nora Olive Olivia Opal Paige
Pearl Penny Petra Piper Poppy Quinn Rachel Riley Rosa Rose Ruby Ruth Sadie Sara Selma
Sienna Sofia Stella Sylvie Tess Thea Tilly Viola Wendy Willa Zoe Aisha Amara Anya Inga
Kaia Kalani Leia Liv Maren Nia Noor Oona Rhea Saga Tove Zuri Elif Defne Leyla Mirae
Sunny Alba Alma Ana Aria Astrid Ayumi Beatrix Bree Carmen Cecily Cora Dalia Dora Elise
Eloise Elsie Etta Evie Farah Fleur Gwen Hanna Hedda Ilse Imani Iona Irene Isadora Jola
Juno Kalina Kamila Karla Keira Kiri Klara Lana Leona Lina Liora Lisa Lotte Luisa Lyra
Magda Mae Maisie Malia Marta Matilda Maude Melia Mika Milena Mirela Nadine Nell Noemi
Odette Ophelia Orla Pia Priya Raisa Raya Reese Rhiannon Romy Rowan Sabine Salome Selin
Sia Signe Solene Suki Tamsin Tia Tilde Ulla Una Valeria Vivi Wanda Xenia Yasmin Ylva
Zadie Zelie Zinnia Asami Chika Hanae Harumi Hiromi Junko Kazumi Keiko Kumiko Mariko
Michiru Mutsumi Nagisa Naoko Nozomi Reiko Sachi Satsuki Setsuna Shinobu Tomoe Yasuko
""".split()))


def norm_name(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def valid_name(s: str) -> bool:
    return bool(s) and bool(NAME_RX.fullmatch(s)) and "  " not in s and not s.endswith((" ", "-"))


def _fix_case(word: str) -> str:
    parts = []
    for part in word.split("-"):
        if not part:
            continue
        if part.islower() or part.isupper() or part[1:2].isupper():
            part = part.capitalize()
        parts.append(part)
    return "-".join(parts)


def _name_from(cand: str):
    """`cand` as a display name if it reads like one, else None."""
    words = [w.strip(".,!?-") for w in cand.split()]
    words = [w for w in words if w]
    if not (1 <= len(words) <= 2):
        return None
    for w in words:
        if not WORD_RX.fullmatch(w) or (w.isupper() and len(w) > 1):
            return None
        bits = [b.lower() for b in re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", w)]
        if any(b in NOT_A_NAME for b in bits) or w.lower() in NOT_A_NAME or len(bits) > 2:
            return None                  # "SupportGirl", "PattyOnYT": a handle, not a name
        if not re.search(r"[aeiouy]", w, re.I):
            return None
    name = " ".join(_fix_case(w) for w in words)
    return name if valid_name(name) else None


def name_candidates(raw: str) -> list:
    """[(candidate, whole)] in order of preference. `whole`: not a fragment of the title."""
    s = unicodedata.normalize("NFKC", raw or "").strip()
    paren = re.findall(r"[(]\s*([^()]{2,30}?)\s*[)]", s)
    stripped = re.sub(r"\([^()]*\)|【[^】]*】|\[[^\]]*\]", " ", s).strip()
    segments = [x.strip() for x in re.split(r"[^A-Za-z\- ]+|\s{2,}", stripped) if x.strip()]
    if re.search(r"[^\x00-\x7f]", s):
        ordered = [(x, True) for x in paren] + [(stripped, True)] + [(x, False) for x in segments]
    else:
        ordered = [(stripped, True)] + [(x, False) for x in segments] + [(x, True) for x in paren]
    out = []
    for c, whole in ordered:
        out.append((c, whole))
        words = c.split()
        if len(words) > 1:
            # "Swimsuit Mari" → "Mari": drop the title words, keep the name.
            out.append((" ".join(w for w in words if w.lower().strip(".,!?-") not in NOT_A_NAME), False))
            out.append((words[0], False))
    return out


def display_name(raw: str, taken: set, wanted=None) -> tuple:
    """(name, invented). `invented` when the source had nothing usable."""
    if wanted and valid_name(wanted) and norm_name(wanted) not in taken:
        return wanted, False
    for cand, whole in name_candidates(raw):
        name = _name_from(cand)
        if name and (whole or len(name) >= 3) and norm_name(name) not in taken:
            return name, False
    for n in NAME_POOL:
        if norm_name(n) not in taken:
            return n, True
    for i in range(2, 10000):
        for n in NAME_POOL:
            cand = "%s %s" % (n, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i % 26])
            if norm_name(cand) not in taken:
                return cand, True
    raise RuntimeError("name pool exhausted")


# Outfit names show on the tile (one line, ellipsized) and go to the chat model
# as [Current Outfit: …]. They are pasted into single-quoted JavaScript too
# (VRMViewer.tsx), so no ' " \ or line breaks.
OUTFIT_MAX = 28
_L, _R = r"(?<![A-Za-z])", r"(?![A-Za-z])"      # \b would not split 水着ver
_OUTFIT_JUNK = re.compile(
    "(?i)(" + "|".join([
        _L + r"free\s*model" + _R, _L + r"free" + _R, _L + r"sample" + _R, _L + r"cc0" + _R,
        _L + r"univrm" + _R, _L + r"vrm\s*ver\s*[\d.]+", _L + r"for\s*cluster" + _R,
        _L + r"cluster\s*ok" + _R, r"cluster\s*対応版?", _L + r"cluster" + _R, r"#\S+",
        _L + r"cluster(?=[A-Z]{0,2}サイズ)",                 # "ClusterLLサイズ" → "LLサイズ"
        r"[(]?\s*DL\s*(?:可能?|化)\s*[)]?",                    # (DL可能), (DL化): "downloadable"
        _L + r"downloadable" + _R, _L + r"vrm\s*[01](?:\.\d)?(?![A-Za-z0-9])",
        _L + r"v\d+[a-z0-9]*" + _R, _L + r"ver(?:sion)?\.?\s*[\d.]*\s*$",
    ]) + ")")
# A size or height variant: the same outfit on another body.
SIZE_VARIANT = re.compile(r"([(（]\s*[大中小]\s*[)）]|(?:XL|LL|S|M|L)\s*サイズ|(?<!\d)\d{3}\s*cm(?![a-z]))", re.I)
_EDGE = " -–—_·・:|/.,‖"
_SEP = " _-(（[【・:"


def _unwrap(s: str) -> str:
    m = re.fullmatch(r"\s*[(\[【](.+)[)\]】]\s*", s)
    return m.group(1).strip() if m else s


def _strip_prefix(s: str, prefix: str):
    """`s` without a leading `prefix` (the character's own name), or None."""
    if len(prefix) < 2 or not s.lower().startswith(prefix.lower()):
        return None
    rest = s[len(prefix):]
    if not rest.strip() or rest[0] in "\u2019's":          # "Libinika's Twin" keeps its name
        return None
    joined = not prefix[-1].isascii() or not rest[0].isascii()   # Japanese runs words together
    return rest if (rest[0] in _SEP or joined) else None


def clean_outfit_name(raw: str, character_raw: str = "") -> str:
    """A tile-sized outfit name, or "" when nothing is left (the caller numbers it)."""
    s = unicodedata.normalize("NFKC", raw or "").replace("'", "\u2019")
    s = re.sub(r"[\x00-\x1f\x7f\"\\`\u2028\u2029]", " ", s).replace("_", " ").strip()
    s = re.sub(r"^(?:\s*(?:【[^】]*】|\[[^\]]*\]))+(?=.)", "", s).strip()   # 【Free model】, [PR]
    c = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", character_raw or "")).strip()
    bare_c = re.sub(r"\s*\([^()]*\)\s*", " ", c).strip()     # "Hairi Awano (School time)"
    prefixes = list(dict.fromkeys(x for x in (c, c.replace(" ", ""), bare_c, (c.split() or [""])[0]) if x))
    if c and norm_name(s) in {norm_name(x) for x in prefixes[:3]}:
        return ""                                        # the model is just named after her
    for prefix in prefixes:
        rest = _strip_prefix(s, prefix)
        if rest is not None:
            # "ジトメちゃん CLCT for GEAR" → "CLCT for GEAR"; "Rindere-chan -Midriff-" → "Midriff"
            s = re.sub(r"(?i)^[\s-]*(?:chan|san|kun|sama|ちゃん|さん|くん|様)(?![A-Za-z])", "", rest)
            break
    s = _unwrap(s.strip(_EDGE))
    s = re.sub(r"^(?:\s*(?:【[^】]*】|\[[^\]]*\]))+(?=.)", "", s)
    for _ in range(3):
        s = _OUTFIT_JUNK.sub(" ", s)
    s = _unwrap(re.sub(r"\s+", " ", s).strip(_EDGE))
    s = re.sub(r"(?i)nude", "Bare", s)    # sceneActions.ts wires any "nude" outfit to become_nude
    if len(s) > OUTFIT_MAX:
        bare = re.sub(r"\s*\([^()]*\)\s*", " ", s).strip(_EDGE)
        if 3 <= len(bare) <= OUTFIT_MAX:
            s = bare
        else:
            head = s[:OUTFIT_MAX + 1]
            cut = max(head.rfind(" "), head.rfind("-"), head.rfind("・"))
            s = (head[:cut] if cut >= 12 else s[:OUTFIT_MAX]).rstrip(_EDGE + "(")
    s = s.strip()
    if s[:1].isascii() and s[:1].islower():
        s = s[0].upper() + s[1:]                         # "witch" → "Witch"
    return s


def outfit_names(character_raw: str, models: list, cur, existing=(), base_first=True) -> dict:
    """mid → costume_name, unique within the character (case-insensitive)."""
    seen = {norm_name(x) for x in existing}
    out = {}
    for i, m in enumerate(models):
        name = cur.outfit_name(m["id"]) or clean_outfit_name(m.get("name"), character_raw)
        if not name:
            name = "Original" if (i == 0 and base_first) else "Outfit %d" % (i + (0 if base_first else 1))
        stem, k = name, 2
        while norm_name(name) in seen:
            name = "%s %d" % (stem[:OUTFIT_MAX - 3].rstrip(), k)
            k += 1
        seen.add(norm_name(name))
        out[m["id"]] = name
    return out


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


# ── HTTP ────────────────────────────────────────────────────────────────────
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None      # urllib raises the 3xx as an HTTPError; request() returns it


# urllib copies every header to the host a redirect points at. A request that
# carries any of these never follows a redirect: the 3xx comes back as the answer.
SENSITIVE_HEADERS = {"cookie", "authorization", "apikey", "x-presign-token"}


class Http:
    """
    Returns (status, headers, body) for any HTTP answer; raises only on
    network errors (a broken HTTP exchange, such as a truncated body, raises
    ConnectionError). A request carrying a credential never follows redirects.
    """

    def __init__(self):
        self._follow = urllib.request.build_opener()
        self._manual = urllib.request.build_opener(_NoRedirect)

    def request(self, method, url, headers=None, data=None, timeout=60,
                follow_redirects=True, max_bytes=None):
        headers = dict(headers or {})
        if any(k.lower() in SENSITIVE_HEADERS for k in headers):
            follow_redirects = False
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        opener = self._follow if follow_redirects else self._manual
        try:
            with opener.open(req, timeout=timeout) as r:
                return r.status, _lower(r.headers), _read(r, max_bytes)
        except urllib.error.HTTPError as e:
            try:
                body = e.read() if e.fp else b""
            except Exception:
                body = b""
            return e.code, _lower(e.headers), body
        except http.client.HTTPException as e:     # IncompleteRead, BadStatusLine, …
            raise ConnectionError("broken HTTP answer from %s: %s" % (
                urllib.parse.urlsplit(url).hostname, type(e).__name__))


def _lower(headers) -> dict:
    return {k.lower(): v for k, v in (headers.items() if headers else [])}


def _read(r, max_bytes):
    if not max_bytes:
        return r.read()
    chunks, n = [], 0
    while True:
        b = r.read(1 << 20)
        if not b:
            return b"".join(chunks)
        n += len(b)
        if n > max_bytes:
            raise ModelSkip("response over %d bytes" % max_bytes)
        chunks.append(b)


def _snippet(body, n=200) -> str:
    return (body or b"")[:n].decode("utf-8", "replace").replace("\n", " ")


# ── VRoid Hub ───────────────────────────────────────────────────────────────
class Hub:
    """Anonymous, polite VRoid Hub API client."""

    def __init__(self, http, min_interval=HUB_MIN_INTERVAL, delays=HUB_RETRY_DELAYS):
        self.http, self.min_interval, self.delays = http, min_interval, delays
        self._last = 0.0
        self.calls = 0

    def get(self, url):
        """JSON for `url`, or None on 404."""
        err = None
        for attempt in range(len(self.delays) + 1):
            wait = self._last + self.min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.calls += 1
            try:
                st, _, body = self.http.request("GET", url, headers=HUB_HEADERS, timeout=60)
            except (urllib.error.URLError, socket.timeout, ConnectionError, OSError,
                    http.client.HTTPException) as e:
                err = "network: %s" % (e or type(e).__name__)
            else:
                if st == 200:
                    try:
                        j = json.loads(body)
                    except ValueError:
                        raise HubError("%s: answered something that is not JSON" % url)
                    if not isinstance(j, dict):
                        raise HubError("%s: answered JSON that is not an object" % url)
                    return j
                if st == 404:
                    return None
                err = "HTTP %d %s" % (st, _snippet(body, 120))
                if st not in (429, 500, 502, 503, 504):
                    break
            if attempt < len(self.delays):
                time.sleep(self.delays[attempt])
        raise HubError("%s: %s" % (url, err))

    def list_character_models(self, cid):
        """Every model of a character, following the API's pages. None if she is gone."""
        url = "%s/api/characters/%s/models?limit=30" % (HUB, urllib.parse.quote(str(cid)))
        out, seen = [], set()
        for page in range(HUB_MAX_PAGES):
            j = self.get(url)
            if j is None:
                return None if page == 0 else out
            data = j.get("data") or []
            if not isinstance(data, list):
                raise HubError("character %s: the model list is not a list" % cid)
            for m in data:
                mid = str(m.get("id") or "") if isinstance(m, dict) else ""
                if mid and mid not in seen:
                    seen.add(mid)
                    out.append(m)
            links = j.get("_links") if isinstance(j.get("_links"), dict) else {}
            nxt = (links.get("next") or {}).get("href") if isinstance(links.get("next"), dict) else None
            if not nxt:
                return out
            url = urllib.parse.urljoin(HUB + "/", nxt)
            if urllib.parse.urlsplit(url).hostname != "hub.vroid.com":
                raise HubError("pagination left hub.vroid.com: %s" % url)
        raise HubError("character %s: more than %d pages" % (cid, HUB_MAX_PAGES))

    def get_character_model(self, mid):
        """
        One model; the licence sits at data.character_model.license. This call
        also carries the descriptions the listing lacks: the model's (the
        author's own words, often terms of use) and the character's.
        """
        j = self.get("%s/api/character_models/%s" % (HUB, urllib.parse.quote(str(mid))))
        if j is None:
            return None
        d = j.get("data") if isinstance(j.get("data"), dict) else {}
        cm = d.get("character_model")
        if not isinstance(cm, dict):
            return None
        cm = dict(cm)
        cd = d.get("character_detail") if isinstance(d.get("character_detail"), dict) else {}
        cm["_description"] = _text(d.get("description"))
        cm["_character_description"] = _text(cd.get("description"))
        return cm


def _text(v) -> str:
    return v if isinstance(v, str) else ""


def _image(m, field, size):
    return _dict(_dict(m.get(field)).get(size)).get("url") or None


VENDOR_FLAGS = ("is_vendor_forbidden_use_by_others", "is_vendor_protected_download",
                "is_vendor_forbidden_other_users_preview")
AGE_FLAGS = ("is_r18", "is_r15", "is_adult")


def _dict(v) -> dict:
    return v if isinstance(v, dict) else {}


def model_from_api(m: dict) -> dict:
    """The fields the importer uses, from a VRoid Hub model object."""
    v = _dict(m.get("latest_character_model_version"))
    ch = _dict(m.get("character"))
    user = _dict(ch.get("user"))
    meta = _dict(v.get("vrm_meta"))
    age = _dict(m.get("age_limit"))
    vsl = v.get("vendor_specified_license")
    return {
        "id": str(m.get("id")),
        "name": (m.get("name") or "").strip(),
        "hearts": m.get("heart_count") or 0,
        "size": v.get("original_file_size") or 0,
        "portrait": _image(m, "portrait_image", "w600"),
        "full": _image(m, "full_body_image", "w600"),
        "full_hi": _image(m, "full_body_image", "original"),
        # VRoid's own render of the model, or art the author uploaded (which the
        # model licence may not cover): the first previews to replace.
        "images_default": {"portrait": _dict(m.get("portrait_image")).get("is_default_image"),
                           "full": _dict(m.get("full_body_image")).get("is_default_image")},
        "passes": passes(m),
        "failures": licence_failures(m),
        "licence": dict(_licence(m)) or None,
        "vendor_licence": vsl,
        "vendor_failures": vendor_licence_failures(vsl),
        "tags": [t.get("name") for t in m.get("tags") or [] if isinstance(t, dict) and t.get("name")],
        "booth": [str(b.get("booth_item_id")) for b in m.get("character_model_booth_items") or []
                  if isinstance(b, dict) and b.get("booth_item_id")],
        "vendor": [k for k in VENDOR_FLAGS if v.get(k)],
        "vendor_flags": {k: v.get(k) for k in VENDOR_FLAGS if k in v},
        "other_users": m.get("is_other_users_available"),
        "age_limit": {k: age.get(k) for k in AGE_FLAGS if k in age} or None,
        "age_flags": [k for k in AGE_FLAGS if age.get(k)],
        "cid": str(ch.get("id") or ""),
        "character_name": (ch.get("name") or "").strip(),
        "author": (user.get("name") or "").strip(),
        "author_id": str(user.get("id") or "") or None,
        "version_id": v.get("id"),
        "spec_version": v.get("spec_version"),
        # The API's copy of the meta written into the file: its licence is
        # checked at planning too, so the dry run shows what --commit would hold.
        "vrm_meta": meta or None,
        "file_credit": embedded_licence(spec_of(v.get("spec_version")), meta)[1] if meta else False,
        "vrm_title": meta.get("title"),
        "vrm_author": meta.get("author"),
        "vrm_reference": meta.get("reference"),
        "description": m.get("_description"),
        "character_description": m.get("_character_description"),
        "detail_error": m.get("_detail_error"),
        "published_at": m.get("published_at"),
        "live": True,
    }


def model_from_shortlist(entry: dict, sm: dict) -> dict:
    """Same shape, from the crawl. Licence, tags and BOOTH data are unknown."""
    return {
        "id": str(sm.get("id")), "name": (sm.get("name") or "").strip(),
        "hearts": sm.get("hearts") or 0, "size": sm.get("size") or 0,
        "portrait": sm.get("portrait"), "full": sm.get("full"), "full_hi": None, "images_default": None,
        "passes": True, "failures": [], "licence": None, "vendor_licence": None, "vendor_failures": [],
        "tags": None, "booth": None, "vendor": None, "vendor_flags": None, "other_users": None,
        "age_limit": None, "age_flags": [],
        "cid": str(entry.get("character_id")), "character_name": (entry.get("name") or "").strip(),
        "author": (entry.get("author") or "").strip(), "author_id": None,
        "version_id": None, "spec_version": None, "vrm_meta": None, "file_credit": False,
        "vrm_title": None, "vrm_author": None,
        "vrm_reference": None, "description": None, "character_description": None, "detail_error": None,
        "published_at": None, "live": False,
    }


def fetch_vrm(http, mid, cookie, publisher=None, max_bytes=MAX_VRM_BYTES) -> tuple:
    """
    (file bytes, the download licence VRoid issued). The one authenticated
    step. NOT VERIFIED END TO END: this is the first thing to try with a real
    cookie (`--commit --only <cid> --max-outfits 0`), and its output is the
    record to keep.

    `POST /api/download_licenses` answers 401 COMMON_SIGNED_IN_REQUIRED
    without a session. This accepts either answer shape seen in VRoid Hub's
    API: a `download_url`, or a licence id for
    `GET /api/download_licenses/{id}/download` (a redirect to the file). Its
    id is the record of accepting the licence, and a licence it carries is
    checked like the API's.
    The cookie only ever goes to hub.vroid.com. Redirects are followed by
    hand, and the request is sent without the cookie once it leaves that host.
    """
    h = dict(HUB_HEADERS)
    h.update({"Cookie": cookie, "Content-Type": "application/json"})
    st, hd, body = http.request("POST", HUB + "/api/download_licenses", headers=h,
                                data=json.dumps({"character_model_id": str(mid)}).encode(), timeout=60,
                                follow_redirects=False)
    if st in (401, 403):
        # Maybe the cookie, maybe a header VRoid also wants (CSRF): keep the body.
        raise Fatal("VRoid Hub refused download_licenses (HTTP %d, %s): %s. Check VROID_COOKIE "
                    "first" % (st, hd.get("content-type") or "no content-type", _snippet(body, 300)))
    if st not in (200, 201):
        raise ModelSkip("download_licenses answered HTTP %d: %s" % (st, _snippet(body)))
    try:
        j = json.loads(body)
    except ValueError:
        raise ModelSkip("download_licenses answered something that is not JSON")
    d = _dict(_dict(j).get("data"))
    record = {"id": str(d["id"]) if d.get("id") else None}
    lic = d.get("license") if isinstance(d.get("license"), dict) else \
        _dict(d.get("character_model")).get("license")
    if isinstance(lic, dict):
        bad = [x for x in licence_failures({"license": lic, "is_downloadable": True})]
        bad += publisher_failures(lic, publisher)
        if bad:
            raise ModelSkip("the download licence says " + ", ".join(bad))
        record["license"] = {k: lic.get(k) for k in LICENCE_FIELDS}
    url = d.get("download_url") or d.get("url")
    if not url and d.get("id"):
        url = "%s/api/download_licenses/%s/download" % (HUB, urllib.parse.quote(str(d["id"])))
    if not url or not isinstance(url, str):
        raise ModelSkip("no download_url or licence id in: %s" % _snippet(body))
    for _ in range(6):
        url = urllib.parse.urljoin(HUB + "/", url)
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != "https":
            raise ModelSkip("refusing a non-https download URL")
        on_hub = parts.hostname == "hub.vroid.com"
        hh = dict(HUB_HEADERS, Cookie=cookie) if on_hub else {"User-Agent": HUB_HEADERS["User-Agent"]}
        st, hd, body = http.request("GET", url, headers=hh, timeout=900,
                                    follow_redirects=False, max_bytes=max_bytes)
        if st in (301, 302, 303, 307, 308) and hd.get("location"):
            url = hd["location"]
            continue
        if st == 200:
            return body, record
        if on_hub and st in (401, 403):
            raise Fatal("VRoid Hub refused the download (HTTP %d, %s): %s. Check VROID_COOKIE first"
                        % (st, hd.get("content-type") or "no content-type", _snippet(body, 300)))
        raise ModelSkip("download answered HTTP %d" % st)
    raise ModelSkip("download redirected more than 5 times")


def fetch_image(http, url) -> tuple:
    """(bytes, extension, content type) for a VRoid preview image."""
    if not url or urllib.parse.urlsplit(url).scheme != "https":
        raise ModelSkip("no https image URL")
    st, _, body = http.request("GET", url, headers={"User-Agent": HUB_HEADERS["User-Agent"]},
                               timeout=120, max_bytes=MAX_IMAGE_BYTES)
    if st != 200:
        raise ModelSkip("image answered HTTP %d" % st)
    kind = sniff_image(body)
    if not kind:
        raise ModelSkip("image is not JPEG/PNG/WebP")
    return (body,) + kind


def sniff_image(b: bytes):
    """VRoid serves JPEG under .png paths, so the extension follows the bytes."""
    if b[:3] == b"\xff\xd8\xff":
        return ".jpg", "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png", "image/png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return ".webp", "image/webp"
    return None


# ── the downloaded file ─────────────────────────────────────────────────────
VRM0_LICENCES_THAT_FORBID = {"Redistribution_Prohibited", "CC_BY_NC", "CC_BY_NC_SA",
                             "CC_BY_ND", "CC_BY_NC_ND"}


def hub_licence_params(meta: dict) -> list:
    """
    VRoid Hub writes its licence into the file as hub.vroid.com/license?…
    URLs (otherLicenseUrl and otherPermissionUrl, usually the same). Every one
    is read, and every value of a repeated key: [(field, {key: [values]})].
    """
    out = []
    for k in ("otherLicenseUrl", "otherPermissionUrl", "licenseUrl"):
        u = meta.get(k)
        if not isinstance(u, str):
            continue
        p = urllib.parse.urlsplit(u.strip())
        if (p.hostname or "").lower() == "hub.vroid.com" and p.path.rstrip("/").endswith("/license"):
            out.append((k, urllib.parse.parse_qs(p.query, keep_blank_values=True)))
    return out


def embedded_licence(spec: str, meta: dict, publisher=None) -> tuple:
    """
    (problems, credit_required) for the licence written inside a VRM, or in
    the API's copy of that meta. A problem is a way it is stricter than the
    filter; the file's licence never loosens the API's.
    """
    out, credit = [], False
    hubs = hub_licence_params(meta)
    for field, q in hubs:
        for k, want in LICENCE_RULES:
            vals = q.get(k)
            if not vals:
                out.append("file licence (%s) has no %s" % (field, k))
            out.extend("file licence %s=%s" % (k, v) for v in sorted(set(vals or [])) if v != want)
        out.extend("file licence allowed_to_use_user=%s" % v
                   for v in sorted(set(q.get("allowed_to_use_user") or [])) if v != "everyone")
        if publisher != "company":
            vals = q.get("personal_commercial_use") or [None]
            out.extend("file licence personal_commercial_use=%s (a paid app needs profit unless "
                       "--publisher company)" % v for v in sorted(set(vals), key=str) if v != "profit")
        if set(q.get("credit") or [None]) - {"unnecessary"}:
            credit = True
    if spec == "0.x":
        if meta.get("licenseName") in VRM0_LICENCES_THAT_FORBID:
            out.append("file licenseName=%s" % meta.get("licenseName"))
        # VRoid maps characterization_allowed_user onto allowedUserName and
        # sexual_expression onto sexualUssageName: both always apply.
        if meta.get("allowedUserName") != "Everyone":
            out.append("file allowedUserName=%s" % meta.get("allowedUserName"))
        # (VRM 0.0 spells it "Ussage", later exporters "Usage": every value present counts.)
        sexual = _meta_values(meta, "sexualUssageName", "sexualUsageName")
        if sexual != ["Allow"]:
            out.append("file sexualUssageName=%s" % "/".join(map(str, sexual or [None])))
        # It maps personal (not corporate) use onto commercialUssageName: that
        # one applies when the file has no VRoid licence, or to an individual.
        commercial = _meta_values(meta, "commercialUssageName", "commercialUsageName")
        if (not hubs or publisher != "company") and commercial != ["Allow"]:
            out.append("file commercialUssageName=%s" % "/".join(map(str, commercial or [None])))
    else:
        # VRM 1.0: a missing field means the spec's restrictive default.
        checks = (("avatarPermission", "onlyAuthor", lambda v: v == "everyone"),
                  ("allowExcessivelySexualUsage", False, lambda v: v is True),
                  ("commercialUsage", "personalNonProfit", lambda v: v == "corporation"),
                  ("allowRedistribution", False, lambda v: v is True),
                  ("modification", "prohibited", lambda v: v != "prohibited"))
        for k, default, ok in checks:
            v = meta.get(k, default)
            if not ok(v):
                out.append("file %s=%s" % (k, v))
        if meta.get("creditNotation", "required") != "unnecessary":
            credit = True
    return out, credit


def _meta_values(meta, *keys) -> list:
    """The distinct values set under any of `keys`, in a stable order."""
    vals = [meta.get(k) for k in keys if meta.get(k) not in (None, "")]
    return sorted(set(vals), key=str)


def embedded_licence_problems(spec: str, meta: dict, publisher=None) -> list:
    """Ways the licence inside the file is stricter than the filter allows."""
    return embedded_licence(spec, meta, publisher)[0]


def spec_of(spec_version) -> str:
    return "1.0" if str(spec_version or "").startswith("1") else "0.x"


def inspect_vrm(blob: bytes, publisher=None) -> tuple:
    """(summary, problems). Any problem means: do not upload."""
    if len(blob) < 20 or blob[:4] != b"glTF":
        return {}, ["not a GLB file"]
    version, total = struct.unpack_from("<II", blob, 4)
    problems = [] if version == 2 else ["GLB version %d" % version]
    if total != len(blob):
        problems.append("GLB header says %d bytes, got %d" % (total, len(blob)))
    clen, ctype = struct.unpack_from("<I4s", blob, 12)
    if ctype != b"JSON" or 20 + clen > len(blob):
        return {}, problems + ["no glTF JSON chunk"]
    try:
        gltf = json.loads(blob[20:20 + clen].decode("utf-8"))
    except ValueError:
        return {}, problems + ["unreadable glTF JSON"]
    ext = gltf.get("extensions") or {}
    if isinstance(ext.get("VRMC_vrm"), dict):
        spec, meta = "1.0", ext["VRMC_vrm"].get("meta") or {}
    elif isinstance(ext.get("VRM"), dict):
        spec, meta = "0.x", ext["VRM"].get("meta") or {}
    else:
        return {}, problems + ["glTF without a VRM extension"]
    keep = ("title", "name", "author", "authors", "version", "reference", "allowedUserName",
            "sexualUssageName", "sexualUsageName", "commercialUssageName", "commercialUsageName", "licenseName",
            "otherLicenseUrl", "otherPermissionUrl", "avatarPermission", "commercialUsage",
            "allowRedistribution", "modification", "allowExcessivelySexualUsage", "creditNotation")
    summary = {"spec": spec}
    summary.update({k: meta[k] for k in keep if meta.get(k) not in (None, "", [])})
    found, credit = embedded_licence(spec, meta, publisher)
    summary["credit_required"] = credit
    return summary, problems + found


# ── Supabase ────────────────────────────────────────────────────────────────
class Env:
    def __init__(self, environ):
        g = lambda k: (environ.get(k) or "").strip()
        self.supabase_url = (g("SUPABASE_URL") or DEFAULT_SUPABASE_URL).rstrip("/")
        self.service_key = g("SUPABASE_SERVICE_KEY")
        self.pat = g("SUPABASE_PAT")
        self.anon_key = g("SUPABASE_ANON_KEY") or g("EXPO_PUBLIC_SUPABASE_ANON_KEY")
        self.presign_token = g("R2_PRESIGN_TOKEN")
        self.yuuki_ref = g("YUUKI_REF") or DEFAULT_YUUKI_REF
        self.vroid_cookie = g("VROID_COOKIE")
        host = urllib.parse.urlsplit(self.supabase_url).hostname or ""
        self.project_ref = g("SUPABASE_PROJECT_REF") or host.split(".")[0]

    def missing_for_commit(self) -> list:
        need = (("VROID_COOKIE", self.vroid_cookie), ("SUPABASE_SERVICE_KEY", self.service_key),
                ("R2_PRESIGN_TOKEN", self.presign_token))
        out = [k for k, v in need if not v]
        if not self.supabase_url.startswith("https://"):
            out.append("SUPABASE_URL (must be https)")
        return out


HUB_MODEL_URL = re.compile(r"hub\.vroid\.com/(?:[a-z]{2}/)?characters/(\d+)/models/(\d+)")
VRM_FILE_ID = re.compile(r"(?<!\d)(\d{12,20})\.vrm(?:[?#]|$)")
BARE_ID = re.compile(r"^\d{12,20}$")


def vroid_ids(src) -> tuple:
    """(character id, {model ids}) recorded in a data.source / metadata.source."""
    if not isinstance(src, dict):
        return None, set()
    cid = str(src["character_id"]) if src.get("character_id") else None
    mids = {str(src["model_id"])} if src.get("model_id") else set()
    hit = HUB_MODEL_URL.search(str(src.get("url") or ""))
    if hit:
        cid = cid or hit.group(1)
        mids.add(hit.group(2))
    return cid, mids


class DbIndex:
    """What the DB already holds, keyed by VRoid ids."""

    def __init__(self, tier, detail=""):
        self.tier, self.detail = tier, detail
        self.names = set()
        self.chars = {}           # tm id → {name, cid, public, available, default_costume_id, imported_by, author}
        self.by_mid = {}          # VRoid model id → [(kind, tm id)]
        self.by_cid = {}          # VRoid character id → {tm id: rows of hers}
        self.outfit_rows = {}     # tm id → costume rows that are not her starter
        self.costume_names = {}   # tm id → {lowercased costume_name}

    @property
    def complete(self) -> bool:
        return self.tier in ("service", "pat")

    def add_model(self, mid, kind, tm, cid):
        self.by_mid.setdefault(mid, []).append((kind, tm))
        if cid:
            owners = self.by_cid.setdefault(cid, {})
            owners[tm] = owners.get(tm, 0) + 1

    def label(self, tm) -> str:
        c = self.chars.get(tm)
        return (c or {}).get("name") or ("%s… (hidden)" % tm[:8])

    def incomplete(self) -> list:
        return [tm for tm, c in self.chars.items()
                if c.get("imported_by") == IMPORTED_BY and not c.get("default_costume_id")]

    def by_author(self, author) -> list:
        """TrueMate characters whose recorded VRoid author is `author`."""
        a = norm_name(author)
        return sorted((self.label(tm) for tm, c in self.chars.items() if a and norm_name(c.get("author")) == a),
                      key=str.lower)


def build_index(tier, chars, costumes, sl_mid_to_cid, detail="") -> DbIndex:
    idx = DbIndex(tier, detail)
    for c in chars:
        tm, src = str(c["id"]), c.get("source")
        cid, mids = vroid_ids(src)
        f = VRM_FILE_ID.search(c.get("base_model_url") or "")
        if f:
            mids.add(f.group(1))
        idx.names.add(norm_name(c.get("name")))
        idx.chars[tm] = {"name": c.get("name"), "cid": cid, "public": c.get("is_public"),
                         "available": c.get("available"),
                         "default_costume_id": c.get("default_costume_id"),
                         "imported_by": src.get("imported_by") if isinstance(src, dict) else None,
                         "author": src.get("author") if isinstance(src, dict) else None}
        for mid in mids:
            idx.add_model(mid, "base model", tm, cid or sl_mid_to_cid.get(mid))
    for k in costumes:
        tm, src = str(k["character_id"]), k.get("source")
        cid, mids = vroid_ids(src)
        u = (k.get("url") or "").strip()
        if BARE_ID.match(u):
            mids.add(u)
        f = VRM_FILE_ID.search(k.get("model_url") or "")
        if f:
            mids.add(f.group(1))
        parent = (idx.chars.get(tm) or {}).get("cid")
        for mid in mids:
            idx.add_model(mid, "outfit", tm, cid or sl_mid_to_cid.get(mid) or parent)
        if k.get("unlock_type") != "default":
            idx.outfit_rows[tm] = idx.outfit_rows.get(tm, 0) + 1
        idx.costume_names.setdefault(tm, set()).add(norm_name(k.get("costume_name")))
    return idx


CHAR_SQL = ("select id, name, is_public, available, base_model_url, default_costume_id, "
            "data->'source' as source from characters")
COSTUME_SQL = ("select id, character_id, costume_name, url, model_url, available, unlock_type, "
               "metadata->'source' as source from character_costumes")
CHAR_SELECT = "id,name,is_public,available,base_model_url,default_costume_id,source:data->source"
COSTUME_SELECT = ("id,character_id,costume_name,url,model_url,available,unlock_type,"
                  "source:metadata->source")


def mgmt_sql(http, env, sql):
    """Read-only SQL through the Management API (the write_personas.py route)."""
    st, _, body = http.request(
        "POST", "https://api.supabase.com/v1/projects/%s/database/query" % env.project_ref,
        headers={"Authorization": "Bearer " + env.pat, "Content-Type": "application/json",
                 "User-Agent": "truemate-vroid-import"},
        data=json.dumps({"query": sql, "read_only": True}).encode(), timeout=120)
    if st not in (200, 201):
        raise Fatal("Management API answered HTTP %d: %s" % (st, _snippet(body)))
    return json.loads(body)


def _rest_headers(key, extra=None):
    h = {"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"}
    h.update(extra or {})
    return h


def rest_select(http, env, key, table, select, page=1000):
    rows, offset = [], 0
    while True:
        url = "%s/rest/v1/%s?select=%s&order=id&limit=%d&offset=%d" % (
            env.supabase_url, table, urllib.parse.quote(select, safe=",:*()"), page, offset)
        st, hd, body = http.request("GET", url, headers=_rest_headers(key, {"Prefer": "count=exact"}))
        if st not in (200, 206):
            raise Fatal("reading %s answered HTTP %d: %s" % (table, st, _snippet(body)))
        got = json.loads(body)
        rows.extend(got)
        total = (hd.get("content-range") or "").rpartition("/")[2]
        offset += len(got)
        if not got or (total.isdigit() and offset >= int(total)) or (not total.isdigit() and len(got) < page):
            return rows


def load_index(http, env, shortlist, need_complete) -> DbIndex:
    sl_map = {str(m["id"]): str(e["character_id"]) for e in shortlist for m in e.get("models") or []}
    if env.service_key:
        tier, key = "service", env.service_key
    elif env.pat and not need_complete:
        tier, key = "pat", None
    elif env.anon_key and not need_complete:
        tier, key = "anon", env.anon_key
    else:
        if need_complete:
            raise Fatal("--commit needs SUPABASE_SERVICE_KEY for dedupe")
        return DbIndex("none")
    if tier == "pat":
        chars, costumes = mgmt_sql(http, env, CHAR_SQL), mgmt_sql(http, env, COSTUME_SQL)
    else:
        chars = rest_select(http, env, key, "characters", CHAR_SELECT)
        costumes = rest_select(http, env, key, "character_costumes", COSTUME_SELECT)
    return build_index(tier, chars, costumes, sl_map,
                       "%d characters, %d costume rows" % (len(chars), len(costumes)))


def rest_write(ctx, method, path, payload=None, want=(200, 201, 204)):
    """Every DB write goes through here, and only --commit can reach it."""
    ctx.require_commit()
    env = ctx.env
    st, _, body = ctx.http.request(
        method, "%s/rest/v1/%s" % (env.supabase_url, path),
        headers=_rest_headers(env.service_key, {"Content-Type": "application/json",
                                                "Prefer": "return=representation"}),
        data=None if payload is None else json.dumps(payload).encode(), timeout=120)
    if st not in want:
        raise Fatal("%s %s answered HTTP %d: %s" % (method, path.split("?")[0], st, _snippet(body, 400)))
    try:
        return json.loads(body) if body else None
    except ValueError:
        raise Fatal("%s %s answered something that is not JSON: %s" % (method, path.split("?")[0], _snippet(body)))


# ── R2 ──────────────────────────────────────────────────────────────────────
def r2_put(ctx, key, blob, content_type, uploaded=None) -> str:
    """
    Presigned PUT straight to Cloudflare (the R2 keys stay server-side), then a
    read-back. `uploaded` collects every key a PUT was sent for: the bucket is
    public, and a key no row ends up using is reported as an orphan.
    """
    ctx.require_commit()
    env, http = ctx.env, ctx.http
    st, _, body = http.request(
        "POST", "https://%s.supabase.co/functions/v1/r2-presign" % env.yuuki_ref,
        headers={"Content-Type": "application/json", "x-presign-token": env.presign_token},
        data=json.dumps({"path": key, "contentType": content_type}).encode(), timeout=60)
    if st in (401, 403):
        raise Fatal("r2-presign refused R2_PRESIGN_TOKEN (HTTP %d); see docs/CREDENTIALS.md" % st)
    if st != 200:
        raise ModelSkip("r2-presign answered HTTP %d for %s: %s" % (st, key, _snippet(body)))
    try:
        d = json.loads(body)
        put_url, public = d["url"], d["publicUrl"]
    except (ValueError, KeyError, TypeError):
        raise Fatal("r2-presign answered without url/publicUrl: %s" % _snippet(body))
    if uploaded is not None:
        uploaded.append(key)
    st, _, _ = http.request("PUT", put_url, headers={"Content-Type": content_type},
                            data=blob, timeout=900)
    if st not in (200, 201):
        raise ModelSkip("R2 PUT answered HTTP %d for %s" % (st, key))
    verify_public(http, public, blob, key)
    return public


def verify_public(http, url, blob, key):
    """The app can only use a file that is public, complete and CORS-enabled."""
    p = urllib.parse.urlsplit(url)
    if p.scheme != "https" or p.query or p.fragment or "'" in url or "\\" in url:
        raise ModelSkip("unusable public URL for %s: %s" % (key, url))
    if key.endswith(".vrm") and not url.endswith(".vrm"):
        raise ModelSkip("public URL does not end in .vrm (loadCharacter.ts, vrmCache.ts): %s" % url)
    st, hd, body = http.request("GET", url, headers={"Range": "bytes=0-15", "Origin": "null",
                                                     "User-Agent": "truemate-vroid-import"}, timeout=60)
    if st not in (200, 206) or body[:16] != blob[:16]:
        raise ModelSkip("read-back of %s failed (HTTP %d)" % (url, st))
    total = (hd.get("content-range") or "").rpartition("/")[2]
    if st == 206 and total.isdigit() and int(total) != len(blob):
        raise ModelSkip("%s holds %s bytes, uploaded %d" % (url, total, len(blob)))
    if hd.get("access-control-allow-origin") != "*":
        raise ModelSkip("%s has no Access-Control-Allow-Origin: * (Android loads from file://)" % url)


# ── curation ────────────────────────────────────────────────────────────────
class CurationError(ValueError):
    pass


# Holds a reviewer may lift for one model, by naming them. BOOTH parts are
# lifted per BOOTH item (booth_allow); VRoid's vendor flags and an author who
# does not allow use by other users are never lifted.
RELEASABLE = {
    "school": "school-age wording",
    "height": "a body height under 145 cm",
    "third_party": "someone else's character (names, tags, the author's handle)",
    "age_limit": "VRoid's R15/R18/adult flag",
    "author": "the author's handle is minor-coded (look at every model of theirs)",
    "description": "the author's description restricts use (read it first)",
}
NOT_RELEASABLE = {
    "booth": "BOOTH parts are allowed per item: list the item id under booth_allow",
    "vendor": "VRoid vendor flags are never lifted",
    "other_users": "an author who does not allow use by other users is never overridden",
    "minor": "minor-coded models are never imported",
}


class Curation:
    """
    Review decisions (--curation FILE, JSON):
      {"approve":     ["<model id>", ...],         # looked at, fit to import; --commit imports only these
       "skip":        ["<character or model id>", ...],
       "release":     {"<model id>": ["school", "third_party"]},   # lift these holds only
       "booth_allow": ["<BOOTH item id>", ...],    # terms read, redistribution allowed
       "characters":  {"<cid>": {"name": "Ayame", "base": "<model id>", "target": "<tm uuid>"}},
       "outfits":     {"<model id>": "Swimsuit"}}
    It can only remove models or pick between licensed ones. Minor-coded
    content, licence failures (the API's, a vendor's, the file's) and VRoid's
    vendor and other-users flags cannot be lifted at all; every other hold is
    lifted only for the reason the reviewer names (RELEASABLE).
    """

    KEYS = {"approve", "skip", "release", "booth_allow", "characters", "outfits"}

    def __init__(self, data=None):
        d = data or {}
        if not isinstance(d, dict):
            raise CurationError("curation: the file must hold a JSON object")
        unknown = set(d) - self.KEYS
        if unknown:
            raise CurationError("curation: unknown keys %s" % sorted(unknown))
        self.approve = self._ids(d, "approve")
        self.skip = self._ids(d, "skip")
        self.booth_allow = self._ids(d, "booth_allow")
        self.release = self._release(d.get("release"))
        chars = d.get("characters") or {}
        if not isinstance(chars, dict):
            raise CurationError('curation: "characters" maps a VRoid character id to {name, base, target}')
        self.chars = {str(k): v for k, v in chars.items() if isinstance(v, dict)}
        for cid, v in self.chars.items():
            if v.get("name") and not valid_name(str(v["name"])):
                raise CurationError("curation: characters.%s.name %r is not a usable name (letters, "
                                    "spaces and hyphens, 2-20 characters)" % (cid, v["name"]))
        outfits = d.get("outfits") or {}
        if not isinstance(outfits, dict):
            raise CurationError('curation: "outfits" maps a model id to its outfit name')
        self.outfits = {str(k): str(v) for k, v in outfits.items()}

    @staticmethod
    def _ids(d, key) -> set:
        v = d.get(key) or []
        if not isinstance(v, list):
            raise CurationError('curation: "%s" must be a list of ids' % key)
        return {str(x) for x in v}

    @staticmethod
    def _release(v) -> dict:
        if not v:
            return {}
        if isinstance(v, list):
            raise CurationError('curation: "release" names the holds it lifts, per model: '
                                '{"<model id>": ["school", "third_party"]}. Liftable: %s'
                                % ", ".join(sorted(RELEASABLE)))
        if not isinstance(v, dict):
            raise CurationError('curation: "release" must map model ids to lists of holds')
        out = {}
        for mid, reasons in v.items():
            reasons = [reasons] if isinstance(reasons, str) else reasons
            if not isinstance(reasons, list) or not reasons:
                raise CurationError("curation: release.%s must list the holds it lifts (%s)"
                                    % (mid, ", ".join(sorted(RELEASABLE))))
            for r in reasons:
                if r in NOT_RELEASABLE:
                    raise CurationError("curation: release.%s: %s" % (mid, NOT_RELEASABLE[r]))
                if r not in RELEASABLE:
                    raise CurationError("curation: release.%s: unknown hold %r (liftable: %s)"
                                        % (mid, r, ", ".join(sorted(RELEASABLE))))
            out[str(mid)] = set(reasons)
        return out

    @classmethod
    def load(cls, path):
        if not path:
            return cls()
        with open(path, encoding="utf-8") as f:
            return cls(json.load(f))

    def released(self, mid) -> set:
        return self.release.get(str(mid), set())

    def char(self, cid, key):
        v = self.chars.get(str(cid), {}).get(key)
        return str(v) if v else None

    def outfit_name(self, mid):
        n = self.outfits.get(str(mid))
        return clean_outfit_name(n) if n else None


# ── planning ────────────────────────────────────────────────────────────────
class Plan:
    def __init__(self, rank, entry):
        self.rank = rank
        self.cid = str(entry.get("character_id"))
        self.raw_name = (entry.get("name") or "").strip()
        self.author = (entry.get("author") or "").strip()
        self.action = None      # new | attach | exists | excluded | skipped | none | error
        self.reason = ""
        self.name, self.invented = None, False
        self.base, self.outfits, self.capped = None, [], []
        self.skipped = []       # (model, category, reason)
        self.notes = []
        self.owners, self.target, self.pending = [], None, []
        self.passing, self.live = 0, False
        self.names = {}         # model id → costume_name
        self.flagged = []       # model ids in the DB that fail the licence or the screen now

    @property
    def models(self) -> list:
        return ([self.base] if self.base else []) + self.outfits

    @property
    def bytes(self) -> int:
        return sum(m.get("size") or 0 for m in self.models)

    def skip(self, m, category, reason, idx=None):
        hits = idx.by_mid.get(m["id"]) if idx is not None else None
        if hits:
            # Imported earlier, and it would not be imported today: a live row to review.
            reason += "  ⚠ ALREADY IN THE DB as %s: review that row" % ", ".join(
                "%s of %s" % (kind, idx.label(tm)) for kind, tm in hits)
            self.flagged.append(m["id"])
        self.skipped.append((m, category, reason))


def description_text(m: dict) -> str:
    return screen_text(m.get("description"), m.get("character_description"))


def core_text(m: dict, character_raw: str) -> str:
    """Names, tags and the VRM's title and reference: everything but the descriptions."""
    return screen_text(character_raw, m.get("name"), m.get("tags"), m.get("vrm_title"), m.get("vrm_reference"))


def model_text(m: dict, character_raw: str) -> str:
    return screen_text(character_raw, m.get("name"), m.get("tags"), m.get("vrm_title"),
                       m.get("vrm_reference"), m.get("description"), m.get("character_description"))


def minor_reason(m: dict, character_raw: str):
    hit = minor_coded(core_text(m, character_raw))
    if hit:
        return "minor-coded %r" % hit
    hit = minor_coded(description_text(m))
    return "minor-coded %r in the description" % hit if hit else None


def _found(rx, text: str, desc: str):
    """`rx`'s first hit, saying when it is only in the descriptions."""
    hit = rx.search(text)
    if not hit:
        return None
    core = rx.search(text[:len(text) - len(desc)]) if desc and text.endswith(desc) else hit
    return "%r" % hit.group(0) if core else "%r in the description" % hit.group(0)


def hold_reasons(m: dict, text: str, cur: Curation, author: str = "") -> list:
    """[(hold, message)]: the holds still on this model after the reviewer's releases."""
    out = []
    desc = description_text(m)
    hit = _found(SCHOOL, text, desc)
    if hit:
        out.append(("school", "school-age wording " + hit))
    hit = _found(CHILD_HEIGHT, text, desc)
    if hit:
        out.append(("height", "a child's height " + hit))
    hit = _found(THIRD_PARTY, text, desc)
    if hit:
        out.append(("third_party", "someone else's character? " + hit))
    tag = name_tag(m.get("tags"))
    if tag:
        out.append(("third_party", "tag %r looks like a character's name" % tag))
    if author and THIRD_PARTY.search(screen_text(author)):
        out.append(("third_party", "author handle %r suggests fan art" % author))
    if author and minor_coded(screen_text(author)):
        out.append(("author", "the author's handle %r is minor-coded" % author))
    if m.get("age_flags"):
        out.append(("age_limit", "VRoid age limit %s" % ", ".join(m["age_flags"])))
    booth = [b for b in (m.get("booth") or []) if b not in cur.booth_allow]
    if booth:
        out.append(("booth", "uses BOOTH parts %s (read each item's terms; booth_allow)" % ", ".join(booth)))
    out.extend(("vendor", "VRoid vendor flag %s" % f) for f in m.get("vendor") or [])
    if m.get("other_users") is False:
        out.append(("other_users", "author does not allow use by other users"))
    hit = DESCRIPTION_RESTRICTS.search(description_text(m))
    if hit:
        out.append(("description", "the description says %r" % hit.group(0)))
    released = cur.released(m["id"])
    return [(k, msg) for k, msg in out if k not in released]


def terms_failures(m: dict, publisher) -> list:
    """Hard failures after the shortlist filter: never imported, no override."""
    out = list(m.get("vendor_failures") or []) + provenance_failures(m)
    if m.get("vrm_meta"):
        found, _ = embedded_licence(spec_of(m.get("spec_version")), m["vrm_meta"], publisher)
        out += [x.replace("file ", "file (the API's copy) ", 1) for x in found]
    return out


def screen_model(m: dict, p, cur: Curation, args):
    """
    (category, reason) that keeps model `m` of character `p` out, or None.
    Everything after the shortlist filter, in the order the plan applies it.
    """
    if m.get("detail_error"):
        return "error", m["detail_error"]
    why = minor_reason(m, p.raw_name)            # the gravest reason first: it is what gets counted
    if why:
        return "minor", why + " (never imported)"
    bad = publisher_failures(m.get("licence"), getattr(args, "publisher", None))
    if bad:
        return "personal", "; ".join(bad)
    bad = terms_failures(m, getattr(args, "publisher", None))
    if bad:
        return "terms", "; ".join(bad)
    if m["id"] in cur.skip:
        return "curation", "skipped in the curation file"
    holds = hold_reasons(m, model_text(m, p.raw_name), cur, m.get("author") or p.author)
    if holds:
        return "hold", "HOLD: " + "; ".join(msg for _, msg in holds)
    return None


# Categories that, for a model already in the DB, mean its live row needs review.
FLAG_CATEGORIES = {"licence", "drift", "personal", "terms", "minor", "hold"}


def requires_approval(args) -> bool:
    return bool(args.commit or getattr(args, "approved_only", False))


_JAPANESE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]")     # kana, kanji, full-width


def outfit_name_notes(p) -> list:
    out = []
    jp = [m["id"] for m in p.models if _JAPANESE.search(p.names.get(m["id"], ""))]
    if jp:
        out.append("%d outfit name(s) in Japanese: give each an English name (curation \"outfits\"): %s"
                   % (len(jp), ", ".join(jp)))
    numbered = [m["id"] for m in p.models if re.fullmatch(r"Outfit \d+", p.names.get(m["id"], ""))]
    if numbered:
        out.append("%d outfit(s) without a usable title (\"Outfit N\"): name them: %s"
                   % (len(numbered), ", ".join(numbered)))
    sized = [m["id"] for m in p.models if SIZE_VARIANT.search(screen_text(m.get("name")))]
    if len(sized) > 1:
        out.append("size or height variants (one outfit on several bodies?): keep one, skip the rest: %s"
                   % ", ".join(sized))
    return out


def plan_character(rank, entry, live, idx, cur, args) -> Plan:
    """
    What to do with one VRoid character. `live` is her live model list (from
    --recheck), or None: either not re-checked, or (with --recheck) gone.
    """
    p = Plan(rank, entry)
    p.live = live is not None
    if p.live and live:                  # an --only character that is not shortlisted
        ch = _dict(_dict(live[0]).get("character"))
        p.raw_name = p.raw_name or (ch.get("name") or "").strip()
        p.author = p.author or (_dict(ch.get("user")).get("name") or "").strip()
    if p.cid in cur.skip:
        p.action, p.reason = "skipped", "skipped in the curation file"
        return p
    hit = minor_coded(screen_text(p.raw_name))
    if hit:
        p.action, p.reason = "excluded", "minor-coded name %r (never imported)" % hit
        return p
    if args.recheck and live is None:
        p.action, p.reason = "none", "gone from VRoid Hub (deleted or private)"
        return p

    if p.live:
        models = [model_from_api(m) for m in live if isinstance(m, dict)]
        live_ids = {m["id"] for m in models}
        sl = {str(m.get("id")): m for m in entry.get("models") or []}
        for mid, sm in sl.items():
            if mid not in live_ids:
                p.skip({"id": mid, "name": sm.get("name") or "", "size": sm.get("size")},
                       "gone", "gone from VRoid Hub", idx)
        for m in models:
            m["new_live"] = m["id"] not in sl
        for m in [m for m in models if not m["passes"]]:
            if m["id"] in sl:            # passed at the crawl, fails now: someone must see this
                p.skip(m, "drift", "licence CHANGED since the crawl: " + ", ".join(m["failures"]), idx)
            else:
                p.skip(m, "licence", "licence: " + ", ".join(m["failures"]), idx)
        for m in [m for m in models if m["passes"] and m["cid"] != p.cid]:
            p.skip(m, "other", "belongs to character %s" % m["cid"])
        models = [m for m in models if m["passes"] and m["cid"] == p.cid]
    else:
        models = [model_from_shortlist(entry, sm) for sm in entry.get("models") or []]
    p.passing = len(models)
    models.sort(key=lambda m: -(m.get("hearts") or 0))     # stable: API order breaks ties

    kept, minor = [], 0
    for m in models:
        why = screen_model(m, p, cur, args)
        if why:
            cat, reason = why
            minor += cat == "minor"
            p.skip(m, cat, reason, idx if cat in FLAG_CATEGORIES else None)
            continue
        kept.append(m)

    # Free text (descriptions) would make these notes noise: names and tags only.
    labels = sorted({lab for m in models for lab in note_labels(core_text(m, p.raw_name))
                     if lab != "terms in the description"})
    if labels:
        p.notes.append("review: " + ", ".join(labels))
    terms = [m["id"] for m in kept if TERMS_MENTION.search(description_text(m))]
    if terms:
        p.notes.append("the description mentions terms or credit: read it for %s" % ", ".join(terms))
    if minor:
        p.notes.append("%d model(s) of hers are minor-coded: review the rest before publishing" % minor)
    credit = [m for m in kept if needs_credit(m)]
    if credit:
        p.notes.append("credit required on %d model(s): the credits page must name %s"
                       % (len(credit), p.author or "the author"))
    if getattr(args, "publisher", None) == "company":
        personal = sorted({(m.get("licence") or {}).get("personal_commercial_use") for m in kept
                           if m.get("licence") and m["licence"].get("personal_commercial_use") != "profit"},
                          key=str)
        if personal:
            p.notes.append("personal_commercial_use=%s: licensed only because the publisher is a company"
                           % "/".join(map(str, personal)))
    if not p.live and len(entry.get("models") or []) >= 16:
        p.notes.append("may have more models: the crawl read only one API page (--recheck reads all)")

    owners = dict(idx.by_cid.get(p.cid) or {})
    fresh = []
    for m in kept:
        hits = idx.by_mid.get(m["id"])
        if hits:
            for _, tm in hits:
                owners[tm] = owners.get(tm, 0) + 1
            p.skip(m, "imported", "already in the DB: " +
                   ", ".join("%s of %s" % (kind, idx.label(tm)) for kind, tm in hits))
        else:
            fresh.append(m)

    unapproved = 0
    if requires_approval(args):
        approved = []
        for m in fresh:
            if m["id"] in cur.approve:
                approved.append(m)
            else:
                unapproved += 1
                p.skip(m, "unapproved", "not approved yet (curation \"approve\")")
        fresh = approved
    not_approved = " (%d new model(s) not approved)" % unapproved if unapproved else ""

    if owners:
        p.owners = sorted(owners, key=lambda tm: (-owners[tm], idx.label(tm)))
        if not fresh:
            p.action, p.reason = "exists", "already in the DB as %s%s" % (
                ", ".join(idx.label(t) for t in p.owners), not_approved)
            return p
        p.pending = fresh
        target = cur.char(p.cid, "target")
        if not target:
            top = [tm for tm in p.owners if owners[tm] == owners[p.owners[0]]]
            target = top[0] if len(top) == 1 else None
        if not args.attach_existing:
            p.action = "exists"
            p.reason = ("already in the DB as %s; %d new passing model(s) not attached (--attach-existing)"
                        % (", ".join(idx.label(t) for t in p.owners), len(fresh)))
            return p
        if not target:
            p.action = "exists"
            p.reason = ("split across %s; set characters.%s.target in the curation file to attach"
                        % (", ".join(idx.label(t) for t in p.owners), p.cid))
            return p
        room = max(0, args.max_outfits - idx.outfit_rows.get(target, 0))
        p.action, p.target = "attach", target
        p.outfits, p.capped = fresh[:room], fresh[room:]
        p.names = outfit_names(p.raw_name, p.outfits, cur, idx.costume_names.get(target, ()),
                               base_first=False)
        if not p.outfits:
            p.capped = []                # listed once, as pending
            p.action, p.reason = "exists", "%s already has %d outfits (--max-outfits %d)" % (
                idx.label(target), idx.outfit_rows.get(target, 0), args.max_outfits)
        else:
            p.pending = []
            p.notes.extend(outfit_name_notes(p))
        return p

    if not fresh:
        p.action, p.reason = "none", "no model left to import" + not_approved
        return p
    wanted = cur.char(p.cid, "base")
    base = next((m for m in fresh if m["id"] == wanted), fresh[0])
    if wanted and base["id"] != wanted:
        p.notes.append("curated base %s is not importable now (see its line); the base is %s"
                       % (wanted, base["id"]))
    rest = [m for m in fresh if m is not base]
    p.action, p.base = "new", base
    p.outfits, p.capped = rest[:args.max_outfits], rest[args.max_outfits:]
    p.names = outfit_names(p.raw_name, p.models, cur)
    p.notes.extend(outfit_name_notes(p))
    return p


# ── rows ────────────────────────────────────────────────────────────────────
def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def iso(dt) -> str:
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def source_snapshot(m: dict, checked_at, publisher=None) -> dict:
    """data.source / metadata.source: a superset of the 74 existing VRoid blocks."""
    lic = m.get("licence")
    credit = needs_credit(m)
    snap = {
        "site": "VRoid Hub",
        "url": "https://hub.vroid.com/en/characters/%s/models/%s" % (m["cid"], m["id"]),
        "character_id": m["cid"], "model_id": m["id"],
        "character": m.get("character_name"), "model": m.get("name"),
        "author": m.get("author") or None, "author_id": m.get("author_id"),
        # What the credits page goes by: "necessary" unless every source says
        # "unnecessary" (the API licence, the file's licence, the download licence).
        "credit": None if credit is None else ("necessary" if credit else "unnecessary"),
        "license": ({k: lic.get(k) for k in LICENCE_FIELDS} if lic else None),
        "publisher": publisher,            # whose commercial-use term the licence was checked against
        "checked_at": iso(checked_at) if (m.get("live") and checked_at) else None,
        "imported_by": IMPORTED_BY,
        "images": {"portrait": m.get("portrait"), "full": m.get("full_hi") or m.get("full")},
    }
    if lic:
        extra = {k: v for k, v in lic.items() if k not in LICENCE_FIELDS}
        if extra:
            snap["license"].update(extra)
    if m.get("live"):
        snap.update({"version_id": m.get("version_id"), "spec_version": m.get("spec_version"),
                     "size": m.get("size") or None,
                     "vendor_specified_license": m.get("vendor_licence"),
                     "vendor_flags": m.get("vendor_flags") or None,
                     "other_users_available": m.get("other_users"),
                     "age_limit": m.get("age_limit")})
        if m.get("images_default"):
            snap["images"]["vroid_default"] = m["images_default"]
        if m.get("vrm_author") and m.get("vrm_author") != m.get("author"):
            snap["vrm_author"] = m.get("vrm_author")
        if m.get("booth"):
            snap["booth_items"] = m["booth"]
    return snap


def character_row(char_id, name, base) -> dict:
    """`base` = {"model", "snap", "urls"}. Written hidden; an editor publishes."""
    u = base["urls"]
    return {
        "id": char_id, "name": name,
        "description": None,               # her tagline: written in the CMS before publishing
        "instruction": persona(name),
        "is_public": False, "available": False,
        "tier": "pro", "price_ruby": None, "price_vcoin": None,   # never 0: CHECK (> 0)
        "base_model_url": u["model"],
        "thumbnail_url": u["portrait"], "avatar": u["full"],
        "small_thumb_url": None, "small_avatar": None, "avatar_nobg": None, "avatar_original": None,
        "data": {"source": base["snap"]},
        "order": None,
        "default_costume_id": None,        # set once her costume rows exist (FK)
        "total_costumes": 0,               # nothing in the DB maintains it
        "total_dances": 0, "total_secrets": 0, "difficulty": 2,
        "user_id": None, "owner_by_id": None, "is_custom": None,
        "background_default_id": None, "video_url": None, "agent_elevenlabs_id": None,
    }


def costume_row(char_id, item, name, unlock_type, available, created_at) -> dict:
    m, u, snap = item["model"], item["urls"], item["snap"]
    return {
        "id": item["row_id"], "character_id": char_id,
        "costume_name": name,
        "url": u["full"],                  # the outfit's 2D art: loadCharacter.ts sets it as her avatar
        "thumbnail": u["portrait"],        # the tile; CharacterPreview drops rows without one
        "model_url": u["model"],           # what the 3D viewer loads
        "unlock_type": unlock_type,
        "tier": "pro" if unlock_type == "pro" else "free",   # what the sync_tier trigger derives
        "price_ruby": None, "price_vcoin": None,
        "unlock_at_level": 1,
        "available": available,
        "description": "VRoid Hub · %s · by %s" % (re.sub(r"\s+", " ", m.get("name") or "untitled"),
                                                   m.get("author") or "unknown author"),
        "metadata": {"source": snap},
        "created_at": iso(created_at),     # one INSERT shares now(); this keeps hearts order
        "streak_days": None, "video_url": None, "should_hide": None, "thumbnail_remove_bg": None,
        "url_original": None, "thumbnail_original": None, "url_nobg": None, "thumbnail_nobg": None,
    }


def build_rows(p, items, cur, idx, start):
    """(character row or None, costume rows, PATCH for the character or None)."""
    models = [it["model"] for it in items]
    if p.action == "new":
        names = outfit_names(p.raw_name, models, cur)
        char_id = str(uuid.uuid4())
        char = character_row(char_id, p.name, items[0])
        rows = [costume_row(char_id, it, names[it["model"]["id"]], "default" if i == 0 else "pro",
                            True, start + datetime.timedelta(milliseconds=i))
                for i, it in enumerate(items)]
        patch = {"default_costume_id": rows[0]["id"], "total_costumes": len(rows)}
        return char, rows, patch
    names = outfit_names(p.raw_name, models, cur, idx.costume_names.get(p.target, ()), base_first=False)
    rows = [costume_row(p.target, it, names[it["model"]["id"]], "pro", False,
                        start + datetime.timedelta(milliseconds=i)) for i, it in enumerate(items)]
    return None, rows, None


def placeholder_items(p, checked_at, publisher=None):
    out = []
    for m in p.models:
        key = "%s/%s/%s/%s" % (R2_PLACEHOLDER, R2_PREFIX, p.cid, m["id"])
        out.append({"model": m, "row_id": str(uuid.uuid4()), "snap": source_snapshot(m, checked_at, publisher),
                    "urls": {"model": key + ".vrm", "portrait": key + "_portrait.jpg",
                             "full": key + "_full.jpg"}})
    return out


# ── commit ──────────────────────────────────────────────────────────────────
class Ctx:
    def __init__(self, args, env, http, hub, idx, cur, out=print):
        self.args, self.env, self.http, self.hub, self.idx, self.cur = args, env, http, hub, idx, cur
        self.out = out
        self.commit = bool(args.commit)

    def require_commit(self):
        if not self.commit:
            raise RuntimeError("a write was attempted in a dry run")


NETWORK_ERRORS = (HubError, urllib.error.URLError, socket.timeout, ConnectionError, http.client.HTTPException)


def live_model(ctx, p, mid) -> tuple:
    """
    (model, when it was read): the per-model answer for `mid`, checked exactly
    like the plan checked it. Raises ModelSkip when it may not be imported now.
    """
    raw = ctx.hub.get_character_model(mid)
    checked_at = utc_now()
    if raw is None:
        raise ModelSkip("gone from VRoid Hub")
    cm = model_from_api(raw)
    if cm["id"] != str(mid):
        raise ModelSkip("the API answered model %s" % cm["id"])
    if not cm["passes"]:
        raise ModelSkip("licence now: " + ", ".join(cm["failures"]))
    if cm["cid"] != p.cid:
        raise ModelSkip("now belongs to character %s" % cm["cid"])
    why = screen_model(cm, p, ctx.cur, ctx.args)
    if why:
        raise ModelSkip(why[1])
    if requires_approval(ctx.args) and cm["id"] not in ctx.cur.approve:
        raise ModelSkip("not approved (curation \"approve\")")
    return cm, checked_at


def stage_model(ctx, p, m, uploaded=None) -> dict:
    """Re-check, download, inspect and upload one model. Raises ModelSkip to drop it."""
    cm, checked_at = live_model(ctx, p, m["id"])
    blob, download_licence = fetch_vrm(ctx.http, cm["id"], ctx.env.vroid_cookie, ctx.args.publisher)
    summary, problems = inspect_vrm(blob, ctx.args.publisher)
    if problems:
        raise ModelSkip("HOLD (file): " + "; ".join(problems))
    if summary.get("credit_required") or \
            (download_licence.get("license") or {}).get("credit", "unnecessary") != "unnecessary":
        cm["file_credit"] = True            # the stricter source wins
    portrait, p_ext, p_type = fetch_image(ctx.http, cm["portrait"])
    full, f_ext, f_type = fetch_image(ctx.http, cm["full_hi"] or cm["full"])
    key = "%s/%s/%s" % (R2_PREFIX, p.cid, cm["id"])
    keys = [key + ".vrm", key + "_portrait" + p_ext, key + "_full" + f_ext]
    urls = {"model": r2_put(ctx, keys[0], blob, "application/octet-stream", uploaded),
            "portrait": r2_put(ctx, keys[1], portrait, p_type, uploaded),
            "full": r2_put(ctx, keys[2], full, f_type, uploaded)}
    snap = source_snapshot(cm, checked_at, ctx.args.publisher)
    snap.update({"sha256": hashlib.sha256(blob).hexdigest(), "file_size": len(blob), "vrm": summary,
                 "download_license": download_licence})
    return {"model": cm, "row_id": str(uuid.uuid4()), "snap": snap, "urls": urls, "keys": keys}


# What may not change between staging a model and inserting its row.
WATCHED = ("licence", "vendor_licence", "vendor_flags", "other_users", "age_limit", "booth", "cid",
           "author", "author_id", "version_id")


def final_recheck(ctx, p, items) -> list:
    """
    Re-read every staged model right before the first write. Staging takes
    minutes per model (a download and three uploads), so the check that
    staged one is stale by the time the last is done. A model that fails now,
    or whose licence-relevant fields changed, is dropped; checked_at becomes
    the time of this last read.
    """
    kept = []
    for it in items:
        old = it["model"]
        try:
            cm, checked_at = live_model(ctx, p, old["id"])
        except ModelSkip as e:
            ctx.out("        drop    %s  at the final check: %s" % (old["id"], e))
            continue
        except NETWORK_ERRORS as e:
            ctx.out("        drop    %s  at the final check: network: %s" % (old["id"], e))
            continue
        changed = [k for k in WATCHED if cm.get(k) != old.get(k)]
        if changed:
            ctx.out("        drop    %s  changed while staging: %s" % (old["id"], ", ".join(changed)))
            continue
        it["snap"]["checked_at"] = iso(checked_at)
        kept.append(it)
    return kept


def commit_character(ctx, p) -> bool:
    ctx.require_commit()
    uploaded, used = [], set()
    try:
        return _commit_character(ctx, p, uploaded, used)
    finally:
        # The bucket is public: say what was sent that no row refers to.
        for key in uploaded:
            if key not in used:
                ctx.out("        orphan  %s  (on the public bucket, no row uses it; a re-run of this "
                        "model overwrites it)" % key)


def _commit_character(ctx, p, uploaded, used) -> bool:
    items = []
    for m in p.models:
        try:
            it = stage_model(ctx, p, m, uploaded)
        except ModelSkip as e:
            ctx.out("        drop    %s  %s" % (m["id"], e))
            continue
        except NETWORK_ERRORS as e:
            ctx.out("        drop    %s  network: %s" % (m["id"], e))
            continue
        except (ValueError, AttributeError, TypeError, KeyError, struct.error) as e:
            ctx.out("        drop    %s  unexpected answer: %s: %s" % (m["id"], type(e).__name__, e))
            continue
        ctx.out("        staged  %s  %s" % (m["id"], mb(it["snap"]["file_size"])))
        items.append(it)
    if items:
        items = final_recheck(ctx, p, items)
    if not items:
        ctx.out("        ✗ nothing left to import")
        return False
    char, rows, patch = build_rows(p, items, ctx.cur, ctx.idx, utc_now())
    if char:
        try:
            got = rest_write(ctx, "POST", "characters", char)
            if not isinstance(got, list) or not got or str(_dict(got[0]).get("id")) != char["id"]:
                raise Fatal("characters insert did not return the new row")
            got = rest_write(ctx, "POST", "character_costumes", rows)
            if not isinstance(got, list) or len(got) != len(rows):
                raise Fatal("costume insert returned %d of %d rows"
                            % (len(got) if isinstance(got, list) else 0, len(rows)))
            done = rest_write(ctx, "PATCH", "characters?id=eq.%s" % char["id"], patch)
            if not done:
                raise Fatal("PATCH matched no character row")
        except Exception:
            # A row is only written when it is complete; her costumes cascade.
            try:
                rest_write(ctx, "DELETE", "characters?id=eq.%s" % char["id"])
            except Exception as e2:
                ctx.out("        ✗ could not remove the half-written character %s: %s" % (char["id"], e2))
            raise
        tm = char["id"]
        ctx.idx.names.add(norm_name(p.name))
        ctx.idx.chars[tm] = {"name": p.name, "cid": p.cid, "imported_by": IMPORTED_BY,
                             "default_costume_id": patch["default_costume_id"],
                             "author": items[0]["model"].get("author")}
        ctx.out("        ✓ character %s  %s + %d costume rows" % (tm, p.name, len(rows)))
    else:
        tm = p.target
        got = rest_write(ctx, "POST", "character_costumes", rows)
        if not isinstance(got, list) or len(got) != len(rows):
            raise Fatal("costume insert returned %d of %d rows"
                        % (len(got) if isinstance(got, list) else 0, len(rows)))
        ctx.idx.outfit_rows[tm] = ctx.idx.outfit_rows.get(tm, 0) + len(rows)
        ctx.out("        ✓ %d hidden outfit(s) attached to %s" % (len(rows), ctx.idx.label(tm)))
    for it in items:
        used.update(it["keys"])
    for it, row in zip(items, rows):
        ctx.idx.add_model(it["model"]["id"], "outfit", tm, p.cid)
        ctx.idx.costume_names.setdefault(tm, set()).add(norm_name(row["costume_name"]))
    return True


# ── output ──────────────────────────────────────────────────────────────────
def mb(n) -> str:
    return "%.1f MB" % ((n or 0) / MB)


def gb(n) -> str:
    return "%.2f GB" % ((n or 0) / GB)


LABELS = {"new": "NEW", "attach": "ATTACH", "exists": "EXISTS", "excluded": "EXCLUDED",
          "skipped": "SKIPPED", "none": "NOTHING", "error": "ERROR"}


def print_plan(p, idx, out=print, cur=None):
    src = '"%s" by %s · cid %s' % (p.raw_name or "?", p.author or "?", p.cid)
    if p.action == "new":
        out("[%3d] NEW      %s%s  ← %s" % (p.rank, p.name, "  (named by us)" if p.invented else "", src))
    elif p.action == "attach":
        out("[%3d] ATTACH   → %s  ← %s" % (p.rank, idx.label(p.target), src))
    else:
        out("[%3d] %-8s %s — %s" % (p.rank, LABELS.get(p.action, p.action), src, p.reason))
    roles = ([("base", p.base)] if p.base else []) + [("outfit", m) for m in p.outfits]
    for role, m in roles:
        name = p.names.get(m["id"], "")
        line = "        %-7s %-20s %9s  %s" % (role, m["id"], mb(m.get("size")), name)
        if (m.get("name") or "") != name:
            line += '  ← "%s"' % (m.get("name") or "")
        tags = []
        if m.get("new_live"):
            tags.append("+live")
        credit = needs_credit(m)
        if credit is not None:
            tags.append("credit necessary" if credit else "credit unnecessary")
        if cur is not None and m["id"] in cur.approve:
            tags.append("approved")
        out(line + ("  [%s]" % ", ".join(tags) if tags else ""))
    if p.capped:
        out("        cap     %d more passing model(s) over --max-outfits (%s)"
            % (len(p.capped), mb(sum(m.get("size") or 0 for m in p.capped))))
    if p.pending and p.action == "exists":
        for m in p.pending:
            out("        new     %-20s %9s  %s" % (m["id"], mb(m.get("size")), m.get("name") or ""))
    for m, _, why in p.skipped:
        out("        skip    %-20s %9s  %s — %s" % (m["id"], mb(m.get("size")), m.get("name") or "", why))
    for n in p.notes:
        out("        note    " + n)
    if p.action in ("new", "attach"):
        out("        = %s%d outfit(s) · %d model(s) · %s"
            % ("1 character + " if p.action == "new" else "", len(p.outfits), len(p.models), mb(p.bytes)))


def importable(p):
    """How many models --commit would stage for `p`, or None if it plans nothing."""
    if p.action == "new":
        return len(p.models)
    if p.action == "attach":
        return len(p.outfits)
    return None


def print_below_min(p, n, args, out=print):
    held = {}
    for _, cat, _ in p.skipped:
        held[cat] = held.get(cat, 0) + 1
    why = ", ".join("%d %s" % (k, cat) for cat, k in sorted(held.items())) or "no other models"
    out('[%3d] BELOW-MIN "%s" by %s · cid %s — %d importable model(s) < --min-outfits %d (left out: %s)'
        % (p.rank, p.raw_name or "?", p.author or "?", p.cid, n, args.min_outfits, why))


def print_rows(p, cur, idx, out=print, publisher=None):
    items = placeholder_items(p, utc_now() if p.live else None, publisher)
    char, rows, patch = build_rows(p, items, cur, idx, utc_now())
    out("        --show-rows (%s = the public R2 base r2-presign returns; image extensions follow the "
        "downloaded bytes; ids and timestamps are made fresh at --commit):" % R2_PLACEHOLDER)
    dump = lambda o: json.dumps(o, ensure_ascii=False, indent=2).replace("\n", "\n          ")
    if char:
        out("          POST characters " + dump(char))
    out("          POST character_costumes " + dump(rows))
    if patch:
        out("          PATCH characters?id=eq.%s %s" % (char["id"], json.dumps(patch)))


class Totals:
    def __init__(self):
        self.actions = {}
        self.new_chars = self.base_rows = self.outfit_rows = self.models = self.bytes = 0
        self.capped = self.capped_bytes = 0
        self.pending = 0
        self.skips = {}
        self.credit = 0
        self.below_min = 0
        self.committed = self.failed = 0
        self.flagged = 0

    def add(self, p):
        self.actions[p.action] = self.actions.get(p.action, 0) + 1
        self.flagged += len(p.flagged)
        if p.action in ("new", "attach"):
            self.new_chars += p.action == "new"
            self.base_rows += 1 if p.base else 0
            self.outfit_rows += len(p.outfits)
            self.models += len(p.models)
            self.bytes += p.bytes
            self.capped += len(p.capped)
            self.capped_bytes += sum(m.get("size") or 0 for m in p.capped)
            self.credit += sum(1 for m in p.models if needs_credit(m))
        if p.action == "exists":
            self.pending += len(p.pending)
        for _, cat, _ in p.skipped:
            self.skips[cat] = self.skips.get(cat, 0) + 1

    @property
    def errors(self) -> int:
        return self.actions.get("error", 0) + self.skips.get("error", 0)


def print_totals(t, args, idx, hub, out=print):
    a = lambda k: t.actions.get(k, 0)
    s = lambda k: t.skips.get(k, 0)
    out("")
    out("═" * 78)
    out("TOTAL%s" % ("" if args.commit else " (dry run: nothing was downloaded, uploaded or written)"))
    out("  characters   %d new · %d attach · %d already in the DB · %d excluded (minor-coded) · "
        "%d curation-skipped · %d with nothing to import%s"
        % (a("new"), a("attach"), a("exists"), a("excluded"), a("skipped"), a("none"),
           (" · %d errors" % a("error")) if a("error") else ""))
    out("  rows         %d characters + %d costume rows (%d starter outfits + %d outfits)"
        % (t.new_chars, t.base_rows + t.outfit_rows, t.base_rows, t.outfit_rows))
    out("  download     %d models · %s  (VRoid original_file_size; 1 GB = 10^9 bytes)"
        % (t.models, gb(t.bytes)))
    out("  left out     licence %d (%d of them passed at the crawl) · personal use only %d · other terms %d"
        " · gone %d · minor-coded %d · held %d · curation %d · already in DB %d · over --max-outfits %d (%s)%s%s%s"
        % (s("licence") + s("drift"), s("drift"), s("personal"), s("terms"), s("gone"), s("minor"),
           s("hold"), s("curation"), s("imported"), t.capped, gb(t.capped_bytes),
           (" · not approved %d" % s("unapproved")) if s("unapproved") else "",
           (" · not attached %d" % t.pending) if t.pending else "",
           (" · per-model check failed %d" % s("error")) if s("error") else ""))
    if t.below_min:
        out("  below --min-outfits %d: %d characters (listed as BELOW-MIN)" % (args.min_outfits, t.below_min))
    if t.flagged:
        out("  ⚠ in the DB  %d model(s) imported earlier fail the licence or the screen now (marked ⚠ above)"
            % t.flagged)
    out("  credit       %s" % (("%d imported model(s) need the author credited" % t.credit)
                              if args.recheck else "unknown: the shortlist has no licence fields (--recheck)"))
    out("  publisher    %s" % publisher_line(args))
    out("  licence      %s" % ("re-checked live (%d VRoid Hub calls)" % hub.calls if hub
                              else "NOT re-checked: as crawled into the shortlist (--recheck)"))
    out("  dedupe       %s" % dedupe_line(idx))
    if args.commit:
        out("  committed    %d characters/attachments written, %d failed" % (t.committed, t.failed))


def publisher_line(args) -> str:
    if args.publisher == "company":
        return "company: VRoid's corporate commercial-use term applies"
    if args.publisher == "individual":
        return "individual: personal_commercial_use must be 'profit' as well"
    return ("not given (--publisher): personal_commercial_use must be 'profit' as well%s"
            % ("" if args.recheck else "; unknown without --recheck"))


def dedupe_line(idx) -> str:
    if idx.tier == "none":
        return ("SKIPPED: no SUPABASE_SERVICE_KEY, SUPABASE_PAT or SUPABASE_ANON_KEY. Models already in "
                "the DB are planned as new, and names are not checked against the DB")
    if idx.tier == "anon":
        return ("PARTIAL (anon key: %s): hidden characters are invisible, so their models may show as new"
                % idx.detail)
    return "by VRoid character and model id against the DB (%s key: %s)" % (idx.tier, idx.detail)


# ── main ────────────────────────────────────────────────────────────────────
def parse_args(argv=None):
    # allow_abbrev=False: "--co" or "--comm" must not quietly mean --commit.
    ap = argparse.ArgumentParser(description="Import licensed VRoid Hub characters (dry run by default).",
                                 allow_abbrev=False)
    ap.add_argument("--shortlist", default=DEFAULT_SHORTLIST)
    ap.add_argument("--limit", type=int, default=20,
                    help="characters to import or attach, counted after dedupe (default 20)")
    ap.add_argument("--min-outfits", type=int, default=1,
                    help="skip characters with fewer importable models: licensed, screened, not in the "
                         "DB, under the cap (default 1)")
    ap.add_argument("--max-outfits", type=int, default=30,
                    help="outfit rows per character besides her starter outfit (default 30; 0 = starter only)")
    ap.add_argument("--only", action="append", default=[], metavar="CID",
                    help="just this VRoid character (repeatable; with --recheck it need not be shortlisted)")
    ap.add_argument("--recheck", action="store_true",
                    help="re-check every licence against the live API, with each passing model's own "
                         "page for its description (always on with --commit)")
    ap.add_argument("--publisher", choices=PUBLISHERS,
                    help="who publishes TrueMate: 'company' (a legal entity) or 'individual' (a person "
                         "or sole proprietor, who also needs personal_commercial_use=profit). Required "
                         "by --commit; a dry run without it assumes the stricter rule")
    ap.add_argument("--attach-existing", action="store_true",
                    help="add new models of characters already in the DB as hidden outfits")
    ap.add_argument("--curation", metavar="FILE", help="review decisions, see Curation (required by --commit)")
    ap.add_argument("--approved-only", action="store_true",
                    help="plan only models approved in the curation file, as --commit does")
    ap.add_argument("--show-rows", action="store_true", help="print the rows --commit would write")
    ap.add_argument("--commit", action="store_true",
                    help="download, upload and insert (needs VROID_COOKIE, SUPABASE_SERVICE_KEY, "
                         "R2_PRESIGN_TOKEN, --publisher and --curation)")
    args = ap.parse_args(argv)
    if args.limit < 1 or args.min_outfits < 1 or args.max_outfits < 0:
        ap.error("--limit and --min-outfits must be >= 1, --max-outfits >= 0")
    if args.approved_only and not args.curation:
        ap.error("--approved-only needs --curation")
    return args


def load_shortlist(path):
    if not os.path.exists(path) and not os.path.isabs(path) and os.path.exists(os.path.join(HERE, path)):
        path = os.path.join(HERE, path)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("expected a JSON list of characters")
    return path, data


def fetch_details(hub, cid, live, cur) -> list:
    """
    The listing, with every model that passes the filter replaced by its own
    per-model answer. Only that answer carries the descriptions (the terms an
    author writes, a character's age), so a dry run shows the holds --commit
    applies. A model whose answer fails is kept out, never planned from the
    listing alone.
    """
    out = []
    for m in live:
        if not isinstance(m, dict):
            continue
        mid = str(m.get("id"))
        own = str(_dict(m.get("character")).get("id") or "") == str(cid)
        if not (passes(m) and own) or mid in cur.skip:
            out.append(m)
            continue
        try:
            d = hub.get_character_model(mid)
            problem = None if d is not None else "per-model check: gone from VRoid Hub"
        except HubError as e:
            d, problem = None, "per-model check failed: %s" % e
        if d is not None and str(d.get("id")) != mid:
            d, problem = None, "per-model check answered model %s" % d.get("id")
        if d is None:
            m = dict(m)
            m["_detail_error"] = problem
            out.append(m)
        else:
            out.append(d)
    return out


class AuthorWatch:
    """Authors with minor-coded models anywhere in this run: every model of theirs needs a look."""

    def __init__(self):
        self.minor = {}          # norm author → [display name, minor-coded count]
        self.planned = {}        # norm author → ["[rank] name", …]

    def count(self, author) -> int:
        return self.minor.get(norm_name(author), [None, 0])[1]

    def saw(self, p):
        a = norm_name(p.author)
        n = sum(1 for _, cat, _ in p.skipped if cat == "minor") + (p.action == "excluded")
        if a and n:
            self.minor.setdefault(a, [p.author, 0])[1] += n

    def planned_as(self, p, label):
        a = norm_name(p.author)
        if a:
            self.planned.setdefault(a, []).append("[%d] %s" % (p.rank, label))

    def report(self, idx, out):
        lines = []
        for a, (who, n) in sorted(self.minor.items(), key=lambda kv: -kv[1][1]):
            planned, in_db = self.planned.get(a, []), idx.by_author(who)
            if planned or in_db:
                lines.append("%s: %d minor-coded; planned %s; in the DB %s"
                             % (who, n, ", ".join(planned) or "none", ", ".join(in_db) or "none"))
        if lines:
            out("  ⚠ authors    with minor-coded models (review every model of theirs before approving):")
            for x in lines:
                out("               " + x)


def main(argv=None, environ=None, out=print, err=None) -> int:
    err = err or (lambda msg: print(msg, file=sys.stderr))
    args = parse_args(argv)
    env = Env(os.environ if environ is None else environ)
    if args.commit:
        missing = env.missing_for_commit()
        if not args.publisher:
            missing.append("--publisher company|individual (who publishes TrueMate)")
        if not args.curation:
            missing.append("--curation FILE (the models a person approved)")
        if missing:
            err("--commit refused: set %s. Nothing was done." % "; ".join(missing))
            return 2
        args.recheck = True
    try:
        path, shortlist = load_shortlist(args.shortlist)
    except (OSError, ValueError) as e:
        err("shortlist %s: %s" % (args.shortlist, e))
        return 2
    try:
        cur = Curation.load(args.curation)
    except (OSError, ValueError) as e:          # CurationError and bad JSON are ValueErrors
        err("curation %s: %s" % (args.curation, e))
        return 2
    if args.commit and not cur.approve:
        err('--commit refused: the curation file approves no model ("approve"). Nothing was done.')
        return 2
    transport = Http()
    try:
        idx = load_index(transport, env, shortlist, need_complete=args.commit)
    except (Fatal, ValueError) + NETWORK_ERRORS as e:
        err("dedupe failed: %s" % e)
        return 2
    hub = Hub(transport) if args.recheck else None

    shortlisted = {str(e.get("character_id")) for e in shortlist}
    entries = [e for e in shortlist if not args.only or str(e.get("character_id")) in args.only]
    for c in args.only:
        if c not in shortlisted and not args.recheck:
            err("--only %s: not in the shortlist; add --recheck to plan it from the live API" % c)
    if args.recheck:
        known = {str(e.get("character_id")) for e in entries}
        entries += [{"character_id": c, "name": "", "author": "", "models": []}
                    for c in args.only if c not in known]
    ranks = {str(e.get("character_id")): i for i, e in enumerate(shortlist, 1)}

    out("VRoid Hub → TrueMate · %s" % ("COMMIT" if args.commit else "DRY RUN (nothing is downloaded, "
                                                                     "uploaded or written)"))
    out("  shortlist  %s · %d characters / %d models"
        % (os.path.relpath(path), len(shortlist), sum(len(e.get("models") or []) for e in shortlist)))
    out("  licence    %s" % ("live re-check of every model and each passing model's own page "
                             "(VRoid Hub API, %.1fs between calls)" % HUB_MIN_INTERVAL if args.recheck else
                             "as crawled, NOT re-checked (--recheck); tags, descriptions, BOOTH parts "
                             "and vendor flags unknown"))
    out("  publisher  %s" % publisher_line(args))
    out("  dedupe     %s" % dedupe_line(idx))
    out("  review     %s" % ("only models approved in %s (%d listed)" % (args.curation, len(cur.approve))
                             if requires_approval(args) else
                             "not applied: --commit imports only models approved in --curation"))
    out("  limits     --limit %d · --min-outfits %d · --max-outfits %d%s"
        % (args.limit, args.min_outfits, args.max_outfits,
           " · --attach-existing" if args.attach_existing else ""))
    for tm in idx.incomplete():
        out("  WARNING    %s (%s) was left half-imported: no starter outfit. Fix or delete it first."
            % (idx.label(tm), tm))
    out("")

    ctx = Ctx(args, env, transport, hub, idx, cur, out)
    totals, taken, counted, watch = Totals(), set(idx.names), 0, AuthorWatch()
    for entry in entries:
        if counted >= args.limit:
            break
        cid = str(entry.get("character_id"))
        rank = ranks.get(cid, 0)
        live = None
        decided = cid in cur.skip or minor_coded(screen_text(entry.get("name")))
        if args.recheck and not decided:     # no API call for a character that is out anyway
            try:
                live = hub.list_character_models(cid)
                if live:
                    live = fetch_details(hub, cid, live, cur)
            except HubError as e:
                p = Plan(rank, entry)
                p.action, p.reason = "error", "live check failed: %s" % e
                print_plan(p, idx, out)
                totals.add(p)
                continue
        p = plan_character(rank, entry, live, idx, cur, args)
        elsewhere = watch.count(p.author)
        watch.saw(p)
        n = importable(p)
        if n is not None and n < args.min_outfits:
            print_below_min(p, n, args, out)
            totals.below_min += 1
            continue
        if elsewhere:
            p.notes.append("%s has %d minor-coded model(s) on other characters: review every model "
                           "of theirs" % (p.author, elsewhere))
        if p.action == "new":
            wanted = cur.char(p.cid, "name")
            p.name, p.invented = display_name(p.raw_name, taken, wanted)
            taken.add(norm_name(p.name))
            if wanted and p.name != wanted:
                p.notes.append("curated name %r is taken; she is %r for now" % (wanted, p.name))
            if p.invented:
                p.notes.append("review: named by us (the source has no usable name): render her first")
        print_plan(p, idx, out, cur if requires_approval(args) or cur.approve else None)
        totals.add(p)
        if p.action not in ("new", "attach"):
            continue
        watch.planned_as(p, p.name if p.action == "new" else "→ %s" % idx.label(p.target))
        counted += 1
        if args.show_rows:
            print_rows(p, cur, idx, out, args.publisher)
        if args.commit:
            try:
                ok = commit_character(ctx, p)
            except (Fatal,) + NETWORK_ERRORS as e:
                out("        ✗ stopped: %s" % e)
                err("stopped: %s" % e)
                totals.failed += 1
                print_totals(totals, args, idx, hub, out)
                return 1
            totals.committed += ok
            totals.failed += not ok
    print_totals(totals, args, idx, hub, out)
    watch.report(idx, out)
    if totals.errors:
        err("%d live check(s) failed: the plan above is incomplete" % totals.errors)
    if not args.commit:
        out("\nDry run. --commit (with VROID_COOKIE, SUPABASE_SERVICE_KEY, R2_PRESIGN_TOKEN, --publisher, and "
            "--curation approving each model) imports.")
    else:
        out("\nEvery row is is_public=false / available=false. See README.md, "
            "\"Before publishing imported rows\".")
    return 1 if totals.errors else 0


if __name__ == "__main__":
    sys.exit(main())
