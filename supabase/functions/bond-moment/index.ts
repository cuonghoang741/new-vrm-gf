// Edge function: bond-moment
//
// The one-time thing she says when the user reaches a bond level: Lv2 a small
// secret, Lv3 a nickname she will call them from now on, Lv4 a confession,
// Lv5 a vow. The level is checked against user_bond (the server's number, not
// the client's), a moment is written once per user/character/level, and it is
// also saved into the conversation so it stays in the chat and in her memory.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const LANGS: Record<string, string> = {
    en: "English", vi: "Vietnamese", ja: "Japanese", ko: "Korean", zh: "Simplified Chinese",
    es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian",
};
const BEATS: Record<number, string> = {
    2: "You have just become real friends. Tell them something small and personal about yourself that you had not shared before, warmly, in your own voice.",
    3: "You feel close to them now. Give them a cute nickname that fits your personality and how you see them, and tell them you will call them that from now on. Put the nickname alone in \"nickname\".",
    4: "You have fallen for them. Confess it, a little nervous, in your own way. Heartfelt and romantic.",
    5: "This is the deepest bond there is. Tell them they are your one and only, a heartfelt vow about your future together.",
};
const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
        const { character_id, level, lang } = await req.json();
        const lv = Number(level);
        if (!character_id || !BEATS[lv]) return json({ error: "bad request" }, 400);

        const url = Deno.env.get("SUPABASE_URL") ?? "";
        const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        });
        const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
        const { data: auth } = await user.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return json({ error: "unauthorized" }, 401);

        const { data: bond } = await admin.from("user_bond").select("level")
            .eq("user_id", uid).eq("character_id", character_id).maybeSingle();
        if (!bond || (bond.level ?? 1) < lv) return json({ error: "not_reached" }, 409);

        const { data: had } = await admin.from("bond_moments").select("message, nickname")
            .eq("user_id", uid).eq("character_id", character_id).eq("level", lv).maybeSingle();
        if (had) return json({ ...had, level: lv, existing: true });

        const { data: ch } = await admin.from("characters")
            .select("name, description, instruction").eq("id", character_id).maybeSingle();
        if (!ch) return json({ error: "not found" }, 404);

        const language = LANGS[lang] ?? "English";
        const system =
            `You are ${ch.name}, an anime companion in a mobile app.\n` +
            `Your persona:\n${ch.description ?? ""}\n${(ch.instruction ?? "").slice(0, 1500)}\n\n` +
            `A special moment: ${BEATS[lv]}\n` +
            `Write it as ONE text message of 1-3 short sentences in ${language}, in your own personality and ` +
            `speaking style, like a real text. May use one or two emoji. Keep it tasteful, no explicit content.\n` +
            (lang === "vi" ? `In Vietnamese you are a girl talking to your partner: call yourself "em" and the user "anh", never the other way round.\n` : "") +
            `Answer as JSON: {"message": string, "nickname": string or null}.`;

        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 0.9,
                max_tokens: 200,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: `(You and the user just reached bond level ${lv}.)` },
                ],
            }),
        });
        if (!r.ok) return json({ error: `provider ${r.status}` }, 502);
        const out = JSON.parse((await r.json())?.choices?.[0]?.message?.content ?? "{}");
        const message = typeof out.message === "string" ? out.message.trim() : "";
        if (!message) return json({ error: "empty" }, 502);
        const nickname = lv === 3 && typeof out.nickname === "string" ? out.nickname.trim().slice(0, 40) : null;

        // First writer wins: a double tap must not produce two moments.
        const { error: insErr } = await admin.from("bond_moments")
            .insert({ user_id: uid, character_id, level: lv, message, nickname });
        if (insErr) {
            const { data: again } = await admin.from("bond_moments").select("message, nickname")
                .eq("user_id", uid).eq("character_id", character_id).eq("level", lv).maybeSingle();
            return json({ ...(again ?? { message, nickname }), level: lv, existing: true });
        }
        await admin.from("conversation").insert({
            character_id, user_id: uid, message, is_agent: true, is_seen: false,
        });
        return json({ message, nickname, level: lv });
    } catch (e) {
        return json({ error: String((e as Error)?.message ?? e) }, 500);
    }
});
