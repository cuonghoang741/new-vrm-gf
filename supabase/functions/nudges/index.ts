// Edge function: nudges
//
// She texts first. The app has no push server, so she writes her "I miss you"
// lines ahead of time and the phone delivers them as local notifications while
// the app is closed.
//
//   { action: "prepare", character_id, lang }
//     Three lines for 4 h, 22 h and 3 days away, in her persona and language,
//     picking up on the last things you talked about. Reuses an undelivered set
//     younger than 12 h instead of writing a new one.
//   { action: "deliver", id }
//     The user opened one: write it into the conversation as her message, once.
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
const DELAYS = [4, 22, 72];
const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
        const body = await req.json();
        const url = Deno.env.get("SUPABASE_URL") ?? "";
        const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        });
        const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
        const { data: auth } = await user.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return json({ error: "unauthorized" }, 401);

        if (body.action === "deliver") {
            const { data: n } = await admin.from("nudges").select("*").eq("id", body.id).eq("user_id", uid).maybeSingle();
            if (!n) return json({ error: "not found" }, 404);
            if (n.delivered_at) return json({ ok: true, already: true });
            // Claim it first, so two opens cannot both write it.
            const { data: claimed } = await admin.from("nudges").update({ delivered_at: new Date().toISOString() })
                .eq("id", n.id).is("delivered_at", null).select("id");
            if (claimed?.length) {
                await admin.from("conversation").insert({
                    character_id: n.character_id, user_id: uid, message: n.text, is_agent: true, is_seen: false,
                });
            }
            return json({ ok: true });
        }

        const characterId = body.character_id;
        if (!characterId) return json({ error: "bad request" }, 400);
        const since = new Date(Date.now() - 12 * 3600_000).toISOString();
        const { data: fresh } = await admin.from("nudges").select("id, text, delay_hours")
            .eq("user_id", uid).eq("character_id", characterId).is("delivered_at", null)
            .eq("lang", String(body.lang ?? "en")).gte("created_at", since).order("delay_hours");
        if (fresh && fresh.length >= DELAYS.length) return json({ nudges: fresh });

        const [{ data: ch }, { data: recent }, { data: nick }] = await Promise.all([
            admin.from("characters").select("name, description, instruction").eq("id", characterId).maybeSingle(),
            admin.from("conversation").select("message, is_agent").eq("user_id", uid).eq("character_id", characterId)
                .order("created_at", { ascending: false }).limit(8),
            admin.from("bond_moments").select("nickname").eq("user_id", uid).eq("character_id", characterId).eq("level", 3).maybeSingle(),
        ]);
        if (!ch) return json({ error: "not found" }, 404);
        const lang = body.lang as string;
        const language = LANGS[lang] ?? "English";
        const talk = (recent ?? []).reverse()
            .map((m) => `${m.is_agent ? ch.name : "User"}: ${String(m.message).slice(0, 160)}`).join("\n");

        const system =
            `You are ${ch.name}, an anime companion in a mobile app.\n` +
            `Your persona:\n${ch.description ?? ""}\n${(ch.instruction ?? "").slice(0, 1200)}\n\n` +
            (talk ? `The last things you two said:\n${talk}\n\n` : "") +
            (nick?.nickname ? `You call the user "${nick.nickname}".\n` : "") +
            `The user has left the app. Write three short texts you would send them first, as push notifications, ` +
            `in ${language}, in your own voice: one for ${DELAYS[0]} hours later, one for ${DELAYS[1]} hours later, ` +
            `one for ${DELAYS[2] / 24} days later. Each at most 90 characters, natural texting, may reference what you ` +
            `talked about, playful or longing depending on how long it has been. No explicit content. ` +
            (lang === "vi" ? `In Vietnamese call yourself "em" and the user "anh". ` : "") +
            `Answer as JSON: {"texts": [string, string, string]}.`;
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
            body: JSON.stringify({
                model: "gpt-4o-mini", temperature: 0.95, max_tokens: 250,
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: system }, { role: "user", content: "(Write the three texts.)" }],
            }),
        });
        if (!r.ok) return json({ error: `provider ${r.status}` }, 502);
        const out = JSON.parse((await r.json())?.choices?.[0]?.message?.content ?? "{}");
        const texts: string[] = Array.isArray(out.texts) ? out.texts.map((t: unknown) => String(t).trim().slice(0, 140)).filter(Boolean) : [];
        if (texts.length < DELAYS.length) return json({ error: "empty" }, 502);

        // The old undelivered set is superseded, so it can never be delivered later.
        await admin.from("nudges").delete().eq("user_id", uid).eq("character_id", characterId).is("delivered_at", null);
        const { data: rows } = await admin.from("nudges")
            .insert(DELAYS.map((h, i) => ({ user_id: uid, character_id: characterId, text: texts[i], delay_hours: h, lang: String(lang ?? "en") })))
            .select("id, text, delay_hours");
        return json({ nudges: rows ?? [] });
    } catch (e) {
        return json({ error: String((e as Error)?.message ?? e) }, 500);
    }
});
