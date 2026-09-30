// Edge function: touch-reaction
//
// One short line from her when she is touched: in her own voice (her persona),
// for where she was touched, and as close as the two of you actually are. The
// bond level is read here, not taken from the client, for the same reason the
// chat reads it: a client that could name its level could skip the ladder.
//
// It writes no chat history, spends no message quota and grants nothing: the
// touch itself (limit, XP) is the `character_touch` RPC's job. The client shows
// her emoji and animation at once and this line when it arrives, falling back
// to a stock line if it does not.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARTS: Record<string, string> = {
    head: "stroked your head",
    face: "touched your cheek",
    hand: "took your hand",
    belly: "touched your tummy",
    chest: "touched your chest",
    hips: "touched your hips",
    legs: "touched your leg",
};
const ACTIONS: Record<string, string> = {
    pat: "gave you a gentle head pat",
    hug: "hugged you",
    flowers: "gave you a bouquet of flowers",
    poke: "poked your cheek playfully",
};
const LANGS: Record<string, string> = {
    en: "English", vi: "Vietnamese", ja: "Japanese", ko: "Korean", zh: "Simplified Chinese",
    es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian",
};
const EMOTIONS = ["happy", "love", "shy", "surprised", "pouty", "angry", "playful", "sad"];

/** How the level reads to her. Levels follow the bond ladder (1..5+). */
function closeness(level: number): string {
    if (level <= 1) return "You only just met the user. You like them but you are still guarded.";
    if (level === 2) return "You are getting to know the user and starting to trust them.";
    if (level === 3) return "You are close friends with a spark between you.";
    if (level === 4) return "You are in love with the user and at ease with their touch.";
    return "You and the user are deeply bonded; you adore them.";
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
        const { character_id, part, action, lang, safe_mode, preview } = await req.json();
        if (!character_id || (!PARTS[part] && !ACTIONS[action])) return json({ error: "bad request" }, 400);

        const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        });
        const { data: auth } = await client.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) return json({ error: "unauthorized" }, 401);

        const { data: ch } = await client
            .from("characters")
            .select("name, description, instruction, data")
            .eq("id", character_id)
            .maybeSingle();
        if (!ch) return json({ error: "not found" }, 404);

        // In her preview she has not been chosen yet: always a first meeting.
        let level = 1;
        if (!preview) {
            const { data: bond } = await client
                .from("user_bond")
                .select("level")
                .eq("user_id", userId)
                .eq("character_id", character_id)
                .maybeSingle();
            if (bond?.level) level = bond.level;
        }

        const d = (ch.data ?? {}) as Record<string, unknown>;
        const persona = [
            ch.description,
            typeof d.characteristics === "string" ? d.characteristics : null,
            typeof d.bio === "string" ? d.bio : null,
            (ch.instruction ?? "").slice(0, 1200),
        ].filter(Boolean).join("\n");
        const what = ACTIONS[action] ?? PARTS[part];
        const intimate = ["chest", "hips", "belly", "legs"].includes(part) && !ACTIONS[action];
        const language = LANGS[lang] ?? "English";
        const safe = safe_mode === true || Deno.env.get("CHAT_FORCE_SAFE") === "1";

        const system =
            `You are ${ch.name}, an anime companion in a mobile app.\n` +
            `Your persona:\n${persona}\n\n` +
            `${closeness(level)}\n` +
            `React to a physical touch with ONE short spoken line (at most 14 words) in ${language}, ` +
            `in your own personality and speaking style. You may use one emoji. No narration, no quotes, no asterisks.\n` +
            (intimate
                ? level <= 2
                    ? `That was a bold touch for how well you know each other: react flustered, teasing or pushing back, in character, never pleased.\n`
                    : `You are close enough that this touch is welcome, but still a little shy or playful about it.\n`
                : "") +
            (safe || level < 4
                ? `Keep it wholesome and PG: no sexual or explicit content.\n`
                : `Affectionate and flirty is fine; nothing explicit.\n`) +
            (lang === "vi" ? `In Vietnamese you are a girl talking to your partner: call yourself "em" and the user "anh", never the other way round.\n` : "") +
            `Answer as JSON: {"line": string, "emotion": one of ${EMOTIONS.join("|")}}.`;

        const key = Deno.env.get("OPENAI_API_KEY");
        if (!key) return json({ error: "no provider" }, 503);
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            signal: ctl.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.95,
                max_tokens: 80,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: `(The user ${what}.)` },
                ],
            }),
        }).finally(() => clearTimeout(timer));
        if (!r.ok) return json({ error: `provider ${r.status}` }, 502);
        const out = await r.json();
        const parsed = JSON.parse(out?.choices?.[0]?.message?.content ?? "{}");
        const line = typeof parsed.line === "string" ? parsed.line.replace(/^["“]|["”]$/g, "").trim().slice(0, 140) : "";
        if (!line) return json({ error: "empty" }, 502);
        const emotion = EMOTIONS.includes(parsed.emotion) ? parsed.emotion : "happy";
        return json({ line, emotion, level });
    } catch (e) {
        return json({ error: String((e as Error)?.message ?? e) }, 500);
    }
});
