// Edge function: persona-writer (admin only)
//
// Writes a distinct persona for one character: the caller assigns an
// archetype (so neighbours in the catalogue never share one), the model looks
// at her picture so the persona fits her, and returns persona fields plus the
// tagline in ten languages. It only returns JSON; the caller decides what to
// write. Guarded by the PERSONA_ADMIN_KEY secret, never called by the app.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LANGS = ["vi", "ja", "ko", "zh", "es", "pt", "de", "fr", "it"];

serve(async (req) => {
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const admin = Deno.env.get("PERSONA_ADMIN_KEY") ?? "";
    if (!admin || req.headers.get("x-admin-key") !== admin) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    }
    try {
        const { character_id, archetype, avoid } = await req.json();
        const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", service);
        const { data: ch } = await db.from("characters")
            .select("name, avatar, thumbnail_url, data").eq("id", character_id).maybeSingle();
        if (!ch) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
        const img = ch.avatar || ch.thumbnail_url;

        const system =
            `You write personas for anime companion characters in a dating-sim chat app for adults (18+). ` +
            `Every character must feel like a different, specific person. Output JSON only.`;
        const user =
            `Character name: ${ch.name}. Archetype to build on: ${archetype}.\n` +
            (avoid ? `Do NOT reuse these traits already taken by other characters: ${avoid}.\n` : "") +
            `Look at her picture and make the persona fit how she looks (hair, outfit, vibe).\n` +
            `Return JSON with:\n` +
            `"tagline": English, max 70 chars, THIRD person, how the picker introduces her, e.g. "Tsundere heiress who secretly wants to be seen" (no quotes, no scene description),\n` +
            `"characteristics": 3 adjectives, comma separated,\n` +
            `"occupation": short, "age": 19..28, "height_cm": 150..175,\n` +
            `"hobbies": JSON array of 3 short strings, "dislikes": JSON array of 3 short strings,\n` +
            `"bio": English, 2 sentences about her life and what makes her tick,\n` +
            `"speech": 3 bullet lines on HOW she texts (rhythm, pet names, quirks, emoji habits) — concrete and distinctive,\n` +
            `"flirting": 2 bullet lines on how she shows affection and flirts, true to her archetype,\n` +
            `"secret": one small thing she only admits once she trusts the user,\n` +
            `"tagline_i18n": {${LANGS.map((l) => `"${l}": translation`).join(", ")}}.\n` +
            `She is an adult woman. Keep everything tasteful.`;

        const key = Deno.env.get("OPENAI_API_KEY");
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                temperature: 1.0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: system },
                    {
                        role: "user",
                        content: img
                            ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: img, detail: "low" } }]
                            : user,
                    },
                ],
            }),
        });
        if (!r.ok) return new Response(JSON.stringify({ error: `provider ${r.status}`, body: await r.text() }), { status: 502 });
        const out = await r.json();
        return new Response(out?.choices?.[0]?.message?.content ?? "{}", { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500 });
    }
});
