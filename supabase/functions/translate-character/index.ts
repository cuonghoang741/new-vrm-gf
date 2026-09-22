// Edge Function: translate-character (evee)
//
// Dịch `description` của nhân vật sang 10 ngôn ngữ (en/vi/ja/zh/ko/es/pt/de/fr/it)
// bằng Gemini (GEMINI_API_KEY — chung với gemini-chat) rồi upsert vào bảng
// character_translates. `name` giữ nguyên (tên riêng) ở mọi ngôn ngữ.
//
// Hai cách gọi:
//   - Batch (cron/script): body.key === TRANSLATE_KEY. Mỗi lần xử lý tối đa
//     `limit` nhân vật public còn thiếu bản dịch. Giữ nguyên như trước.
//   - CMS: JWT của admin (profiles.is_admin) + body.character_id → dịch lại
//     đúng nhân vật đó (luôn ghi đè). Không cần TRANSLATE_KEY: nhét khoá chung
//     vào CMS là lộ nó cho bất kỳ ai mở devtools.
// Deploy --no-verify-jwt (tự kiểm quyền bên trong; OPTIONS preflight phải qua được).

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

// CMS gọi từ trình duyệt → cần CORS, kể cả cho preflight OPTIONS.
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
        status: s,
        headers: { ...cors, "Content-Type": "application/json" },
    });

/** Gọi OpenAI khi Gemini hỏng — cùng đường lui mà gemini-chat đang dùng. */
async function translateViaOpenAI(prompt: string): Promise<string | null> {
    const key = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!key) return null;
    try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4,
                response_format: { type: "json_object" },
            }),
        });
        if (!r.ok) {
            console.error("[translate] OpenAI HTTP", r.status, (await r.text()).slice(0, 400));
            return null;
        }
        const j = await r.json();
        return j?.choices?.[0]?.message?.content ?? null;
    } catch (e) {
        console.error("[translate] OpenAI threw", String(e));
        return null;
    }
}

/** Dịch 1 mô tả sang 9 ngôn ngữ (en = giữ nguyên bản gốc). */
async function translateDescription(
    description: string,
): Promise<Record<Lang, string> | null> {
    const targets = LANGS.filter((l) => l !== "en");
    const prompt =
        `Translate the following AI-companion character description into these locales, ` +
        `keeping the same warm, flirty/sweet tone (natural, not literal):\n` +
        targets.map((l) => `- ${l} (${LANG_NAMES[l]})`).join("\n") +
        `\nReturn ONLY JSON: an object keyed by locale code, each value the translated ` +
        `description. Do not include "en".\n\nDescription:\n${description}`;

    try {
        let text = "";
        if (GEMINI_API_KEY) {
            const r = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    // No safetySettings override: BLOCK_NONE needs allow-listed
                    // access and the request was being rejected outright, which is
                    // why every translation silently failed.
                    generationConfig: {
                        temperature: 0.4,
                        responseMimeType: "application/json",
                    },
                }),
            });
            if (r.ok) {
                const j = await r.json();
                text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
            } else {
                console.error("[translate] Gemini HTTP", r.status, (await r.text()).slice(0, 400));
            }
        }
        // Gemini vắng mặt hoặc trả rỗng → OpenAI, y như gemini-chat.
        if (!text.trim()) text = (await translateViaOpenAI(prompt)) ?? "";
        if (!text.trim()) return null;
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

/** Người gọi có phải admin không (JWT → uid → profiles.is_admin). */
async function isAdminCaller(req: Request): Promise<boolean> {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return false;
    const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
    );
    const { data } = await asUser.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) return false;
    const db = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: prof } = await db.from("profiles").select("is_admin").eq("id", uid).maybeSingle();
    return prof?.is_admin === true;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty ok */ }

    const byKey = !!TRANSLATE_KEY && body.key === TRANSLATE_KEY;
    const byAdmin = !byKey && (await isAdminCaller(req));
    if (!byKey && !byAdmin) {
        return json({ error: "unauthorized" }, 401);
    }

    const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Chế độ một nhân vật (CMS): dịch lại đúng nhân vật này, luôn ghi đè ──
    if (typeof body.character_id === "string" && body.character_id) {
        const { data: c, error: cErr } = await admin
            .from("characters")
            .select("id,name,description")
            .eq("id", body.character_id)
            .maybeSingle();
        if (cErr) return json({ error: cErr.message }, 500);
        if (!c) return json({ error: "character not found" }, 404);
        if (!c.description) return json({ error: "Nhân vật chưa có description (bản gốc tiếng Anh) để dịch" }, 400);
        const tr = await translateDescription(c.description as string);
        if (!tr) return json({ error: "Dịch thất bại (Gemini và OpenAI đều không trả kết quả)" }, 502);
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
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ ok: true, translated: 1, rows });
    }

    // Batch chỉ cho người cầm TRANSLATE_KEY — admin CMS luôn đi đường một nhân vật.
    if (!byKey) return json({ error: "character_id required" }, 400);

    const limit = Math.min(Number(body.limit ?? 10), 32);
    const force = body.force === true;

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
