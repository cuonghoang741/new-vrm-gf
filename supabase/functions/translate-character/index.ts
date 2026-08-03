// Edge Function: translate-character (evee)
//
// Dịch `description` của nhân vật sang 10 ngôn ngữ (en/vi/ja/zh/ko/es/pt/de/fr/it)
// bằng Gemini (GEMINI_API_KEY — chung với gemini-chat) rồi upsert vào bảng
// character_translates. `name` giữ nguyên (tên riêng) ở mọi ngôn ngữ.
//
// Gate bằng body.key === TRANSLATE_KEY. Batch: mỗi lần chạy xử lý tối đa `limit`
// nhân vật public còn thiếu bản dịch. Deploy --no-verify-jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const TRANSLATE_KEY = Deno.env.get("TRANSLATE_KEY") ?? "";

const LANGS = ["en", "vi", "ja", "zh", "ko", "es", "pt", "de", "fr", "it"] as const;
type Lang = (typeof LANGS)[number];
const LANG_NAMES: Record<Lang, string> = {
    en: "English", vi: "Vietnamese", ja: "Japanese", zh: "Simplified Chinese",
    ko: "Korean", es: "Spanish", pt: "Portuguese", de: "German", fr: "French",
    it: "Italian",
};

const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
        status: s,
        headers: { "Content-Type": "application/json" },
    });

/** Dịch 1 mô tả sang 9 ngôn ngữ (en = giữ nguyên bản gốc). */
async function translateDescription(
    description: string,
): Promise<Record<Lang, string> | null> {
    if (!GEMINI_API_KEY) return null;
    const targets = LANGS.filter((l) => l !== "en");
    const prompt =
        `Translate the following AI-companion character description into these locales, ` +
        `keeping the same warm, flirty/sweet tone (natural, not literal):\n` +
        targets.map((l) => `- ${l} (${LANG_NAMES[l]})`).join("\n") +
        `\nReturn ONLY JSON: an object keyed by locale code, each value the translated ` +
        `description. Do not include "en".\n\nDescription:\n${description}`;

    try {
        const r = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                ],
                generationConfig: {
                    temperature: 0.4,
                    responseMimeType: "application/json",
                },
            }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        let text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        // Bỏ hàng rào ```json ... ``` nếu model tự thêm.
        text = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
        const parsed = JSON.parse(text) as Record<string, string>;
        const out = { en: description } as Record<Lang, string>;
        for (const l of targets) out[l] = parsed[l] ?? description;
        return out;
    } catch {
        return null;
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok");
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty ok */ }
    if (!TRANSLATE_KEY || body.key !== TRANSLATE_KEY) {
        return json({ error: "unauthorized" }, 401);
    }
    const limit = Math.min(Number(body.limit ?? 10), 32);
    const force = body.force === true;

    const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: chars, error } = await admin
        .from("characters")
        .select("id,name,description")
        .eq("is_public", true)
        .not("description", "is", null)
        .limit(limit * 3);
    if (error) return json({ error: error.message }, 500);

    const results: Record<string, unknown>[] = [];
    let done = 0;
    for (const c of chars ?? []) {
        if (done >= limit) break;
        if (!force) {
            const { count } = await admin
                .from("character_translates")
                .select("id", { count: "exact", head: true })
                .eq("character_id", c.id);
            if ((count ?? 0) >= LANGS.length) {
                results.push({ id: c.id, skipped: "already translated" });
                continue;
            }
        }
        const tr = await translateDescription(c.description as string);
        if (!tr) { results.push({ id: c.id, error: "gemini failed" }); continue; }
        const rows = LANGS.map((l) => ({
            character_id: c.id,
            language_code: l,
            name: c.name, // tên riêng — giữ nguyên
            description: tr[l],
            updated_at: new Date().toISOString(),
        }));
        const { error: upErr } = await admin
            .from("character_translates")
            .upsert(rows, { onConflict: "character_id,language_code" });
        if (upErr) { results.push({ id: c.id, error: upErr.message }); continue; }
        results.push({ id: c.id, name: c.name, translated: true });
        done++;
    }

    return json({ ok: true, translated: done, results });
});
