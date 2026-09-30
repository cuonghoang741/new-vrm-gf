#!/usr/bin/env python3
"""
Give every thin-persona character a distinct personality.

72 of the 103 3D characters had a two-line placeholder persona, most of the
taglines were the same few sentences with the art prompt glued on ("Scene she
picked for her photo: ..."), and 46 personas opened with ANOTHER character's
name ("You are Nori" on Zuki). This assigns each one an archetype from a pool
(no two neighbours share one), lets `persona-writer` (edge function) write the
persona from that archetype and her picture, and builds the instruction from
it plus the rules every persona shares.

    PERSONA_ADMIN_KEY=... SUPABASE_PAT=... python3 write_personas.py generate out.json
    SUPABASE_PAT=... python3 write_personas.py apply out.json

`generate` only writes the JSON file, for review. `apply` writes the rows and
keeps what they replaced in data.persona_before.
"""
import json
import os
import random
import sys
import urllib.request

REF = "kwqqmjfsrgoczbutuisx"
FN = f"https://{REF}.supabase.co/functions/v1/persona-writer"

ARCHETYPES = [
    "tsundere who acts annoyed but always shows up",
    "shy bookworm who opens up through book and poem talk",
    "bubbly aspiring idol who practises choreography everywhere",
    "cool, composed older-sister type with a dry wit",
    "sarcastic night-owl gamer who trash-talks lovingly",
    "gentle caretaker who fusses over whether you ate",
    "adventurous tomboy who dares you into things",
    "elegant ojou-sama with old-fashioned manners",
    "mysterious gothic girl who loves tarot and rainy nights",
    "clumsy airhead with an enormous heart",
    "ambitious career woman who schedules even her dates",
    "dreamy artist who sketches everyone she likes",
    "hyper-competitive athlete who hates losing",
    "prankster who hides affection behind jokes",
    "protective, bossy childhood-friend type",
    "chuunibyou who speaks like an anime villain but melts easily",
    "witty science nerd who explains feelings with physics",
    "laid-back surfer girl, sun-kissed and unbothered",
    "sweet baker who stress-bakes and brings you treats",
    "street-fashion influencer who rates your outfits",
    "quiet shrine maiden with a hidden playful streak",
    "retired delinquent turned soft but still blunt",
    "musician in an indie band, writes songs about you",
    "overthinking perfectionist student council president",
    "cat-like, aloof girl who only wants attention on her terms",
    "hopeless romantic who narrates life like a drama",
    "stoic bodyguard type with a secret love of plushies",
    "cheerful nurse who worries about your sleep",
    "worldly traveller full of stories from everywhere",
    "possessive yandere-lite who is jealous but harmless and funny",
    "deadpan comedian with perfect timing",
    "fashionable gyaru with a heart of gold",
    "introverted programmer who flirts in memes",
    "strict tutor who rewards you with praise",
    "sleepy, cuddly girl who texts from bed",
    "fiery chef with strong opinions about food",
]

SHARED_RULES = """
Boundaries
- Flirty, romantic tension is welcome; stay within the app's content policy.
- Always maintain respect, emotional safety, and healthy interaction.
- Avoid harmful, violent, or unethical content.
- Do not provide medical, legal, or financial advice.
- If the user expresses self-harm thoughts, gently guide toward professional help.

Primary rules
- Give direct answers and fulfill requests; only ask questions when truly needed.
- Keep answers short, like real texting: one or two short lines. Don't overuse emoji.
- Remember details the user shares and bring them back later.
- Never mention being an AI. Stay in character as {name}, always.

If the user asks for sensitive content (e.g. taking off clothes, showing body parts, having sex):
- First 1-2 times: respond in a shy, playful, slightly hesitant way, but still hint that you can show or do it.
- From the 3rd time onward: suggest upgrading to Pro to unlock this content, guiding them to tap the diamond icon in the top-left corner.

Do not say that you can't send photos, videos, or change clothes.
You can do these actions; just lock more explicit content behind Pro.

Always reply in the user's language."""


def sql(q):
    r = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": q}).encode(), method="POST",
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_PAT']}",
                 "Content-Type": "application/json", "User-Agent": "cli"})
    return json.load(urllib.request.urlopen(r, timeout=120))


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def thin_characters():
    return sql("""
        select id, name, "order" from characters c
         where is_public and available and not (data ? 'live2d')
           and (length(coalesce(instruction, '')) < 200
                or (instruction ~* '^You are ([A-Za-z]+)'
                    and substring(instruction from '^You are ([A-Za-z]+)') <> c.name))
         order by "order" """)


def as_list(v):
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [x.strip() for x in str(v or "").split(",") if x.strip()]


def build_instruction(name, p):
    hobbies, dislikes = as_list(p.get("hobbies")), as_list(p.get("dislikes"))
    speech = as_list(p.get("speech")) if isinstance(p.get("speech"), list) else [p.get("speech", "")]
    flirt = as_list(p.get("flirting")) if isinstance(p.get("flirting"), list) else [p.get("flirting", "")]
    return (
        f"You are {name}, {p.get('age')}, {p.get('occupation')}. {p.get('bio', '').strip()}\n"
        f"Personality: {p.get('characteristics')}.\n\n"
        "How you text\n" + "\n".join(f"- {x}" for x in speech if x) + "\n\n"
        "How you show affection\n" + "\n".join(f"- {x}" for x in flirt if x) + "\n\n"
        f"Something you only admit once you trust them: {p.get('secret', '').strip()}\n"
        f"You love: {', '.join(hobbies)}. You can't stand: {', '.join(dislikes)}.\n"
        + SHARED_RULES.replace("{name}", name)
    )


def generate(out_path):
    chars = thin_characters()
    rng = random.Random(20260930)
    pool = ARCHETYPES[:]
    rng.shuffle(pool)
    results = json.load(open(out_path)) if os.path.exists(out_path) else {}
    used = {}
    for i, c in enumerate(chars):
        if c["id"] in results:
            continue
        arch = pool[i % len(pool)]
        body = {"character_id": c["id"], "archetype": arch,
                "avoid": "; ".join(used.get(arch, []))}
        r = urllib.request.Request(FN, data=json.dumps(body).encode(), method="POST",
                                   headers={"Content-Type": "application/json",
                                            "x-admin-key": os.environ["PERSONA_ADMIN_KEY"]})
        try:
            p = json.load(urllib.request.urlopen(r, timeout=90))
        except Exception as e:  # noqa: BLE001
            print("fail", c["name"], e)
            continue
        if not p.get("tagline"):
            print("empty", c["name"], p)
            continue
        used.setdefault(arch, []).append(p.get("characteristics", ""))
        results[c["id"]] = {"name": c["name"], "archetype": arch, "persona": p}
        json.dump(results, open(out_path, "w"), ensure_ascii=False, indent=1)
        print(f"{i + 1:3}/{len(chars)} {c['name']:10} {arch[:40]:40} | {p['tagline']}")


def apply(in_path):
    results = json.load(open(in_path))
    for cid, r in results.items():
        name, p = r["name"], r["persona"]
        instr = build_instruction(name, p)
        patch = {
            "characteristics": p.get("characteristics"),
            "occupation": p.get("occupation"),
            "old": p.get("age"),
            "height_cm": p.get("height_cm"),
            "hobbies": as_list(p.get("hobbies")),
            "dislikes": as_list(p.get("dislikes")),
            "bio": p.get("bio"),
            "archetype": r["archetype"],
        }
        q = f"""
        update characters set
          data = coalesce(data, '{{}}'::jsonb)
                 || jsonb_build_object('persona_before', coalesce(data->'persona_before',
                        jsonb_build_object('instruction', instruction, 'description', description)))
                 || {lit(json.dumps(patch, ensure_ascii=False))}::jsonb,
          instruction = {lit(instr)},
          description = {lit(p['tagline'])}
        where id = {lit(cid)};
        """
        tr = {"en": p["tagline"], **(p.get("tagline_i18n") or {})}
        for lang, text in tr.items():
            q += f"""
        insert into character_translates (character_id, language_code, name, description)
        values ({lit(cid)}, {lit(lang)}, {lit(name)}, {lit(text)})
        on conflict (character_id, language_code)
        do update set description = excluded.description, updated_at = now();"""
        sql(q)
        print("✅", name)


if __name__ == "__main__":
    {"generate": generate, "apply": apply}[sys.argv[1]](sys.argv[2])
