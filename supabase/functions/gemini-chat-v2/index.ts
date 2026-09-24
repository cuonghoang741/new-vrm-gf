// Edge function: gemini-chat-v2
//
// `gemini-chat` with two things added, and deliberately a SEPARATE function so
// the flow already on production keeps running untouched. The client picks
// this one through the Remote Config flag `chat_v2_enabled`.
//
//  1. SAFE MODE (`safe_mode` in the body, from Remote Config `chat_safe_mode`)
//     appends a strict content policy after the persona, overriding whatever
//     the character description says. Same idea as Yuuki's `chat-safe`.
//
//  2. PHOTOS IN THE SAME TURN. The old flow asked a second model
//     (`gemini-suggest-action`) whether to send a picture, which cost another
//     call and routinely picked something that had nothing to do with what she
//     had just said. Here she appends a hidden `[[PHOTO: <category>]]` tag to
//     her own reply, where the category is one of HER OWN media keywords — so
//     the picture matches the words. The server strips the tag, picks a photo
//     with that keyword, and inserts it as a second message.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * The hidden tag she appends when she wants to send a picture.
 *
 * `[[PHOTO]]` alone is allowed — the server then picks from everything she
 * has. `[[PHOTO: take a shower]]` names one of her own `medias.keywords`, and
 * that is the point of the whole mechanism: the image matches the sentence.
 */
const PHOTO_TAG_RE = /\[\[\s*photo\b\s*(?::\s*([^\]]*?))?\s*\]\]/i;

/** Don't let her push unprompted photos more often than this. */
const PHOTO_COOLDOWN_MESSAGES = 6;

/** The user asking outright. Asking beats any cooldown. */
const ASK_PATTERNS = [
    /(send|show|see|share|want|gimme|give)[^\n]{0,18}(photo|pic|picture|selfie|image|pics)/i,
    /(photo|pic|picture|selfie|image)[^\n]{0,12}(please|pls|now|me\b|of you)/i,
    /(gửi|cho|khoe|xem|muốn)[^\n]{0,18}(ảnh|hình|tấm|bức|selfie)/i,
    /(ảnh|hình|tấm|bức|selfie)[^\n]{0,12}(đi|nào|nhé|đây|coi|xem|với)/i,
];

/** She announced a photo in words but forgot the tag — send one anyway. */
const REPLY_PHOTO_PATTERNS = [
    /(sending|send you|here'?s|let me show|take a look at)[^\n]{0,24}(photo|pic|picture|selfie|me\b|this)/i,
    /(just|gonna|i'?ll)[^\n]{0,16}(snapped|took|take)[^\n]{0,12}(photo|pic|selfie)/i,
    /(gửi|khoe|chụp)[^\n]{0,24}(ảnh|hình|tấm|selfie)/i,
];

interface MediaRow {
    id: string;
    url: string;
    thumbnail: string | null;
    tier: string | null;
    keywords: string | null;
    price_ruby: number | null;
}

// Hardcoded Telegram Credentials to match client service
// Kept in the function's secrets (dashboard → Edge Functions → Secrets), not in git.
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = '-1003649975869';
const TELEGRAM_MESSAGE_THREAD_ID = ''; // Removed thread id as per new chat structure if needed

async function sendTelegramError(error: string, context: string) {
    try {
        const message = `<b>🚨 GEMINI API ERROR</b>\n\nContext: ${context}\nError: ${error}`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                message_thread_id: TELEGRAM_MESSAGE_THREAD_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

async function sendTelegramInteraction(userMessage: string, aiResponse: string, userId: string, characterId: string, supabase: any, userInfo?: { name?: string, country?: string, daysUsed?: number }) {
    try {
        let name = userInfo?.name;
        let country = userInfo?.country;
        let daysUsed = userInfo?.daysUsed;

        // Fallback to DB if info not provided by app
        let characterName = characterId;
        if (!name || !country || daysUsed === undefined || characterName === characterId) {
            const { data: profile } = await supabase.from('profiles').select('display_name, country, last_country').eq('id', userId).maybeSingle();
            const { data: stats } = await supabase.from('user_stats').select('created_at').eq('user_id', userId).maybeSingle();
            const { data: character } = await supabase.from('characters').select('name').eq('id', characterId).maybeSingle();
            
            const authResponse = await supabase.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
            const authUser = authResponse?.data?.user;

            if (character) characterName = character.name;
            if (!name) name = profile?.display_name || authUser?.user_metadata?.full_name || authUser?.email || 'N/A';
            if (!country) country = profile?.country || profile?.last_country || 'N/A';
            
            // Calculate days used from stats or auth account creation
            const registrationDate = stats?.created_at || authUser?.created_at;
            if (daysUsed === undefined && registrationDate) {
                const diffTime = Math.abs(Date.now() - new Date(registrationDate).getTime());
                daysUsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        const message = `<b>💬 TIN NHẮN MỚI</b>\n\n👤 User: <b>${name}</b>\n🌍 Country: <code>${country}</code>\n📅 Days used: <code>${daysUsed !== undefined ? daysUsed : 'N/A'}</code>\n🤖 Nhân vật: <b>${characterName}</b>\n\n<b>Người dùng:</b> ${userMessage}\n\n<b>AI:</b> ${aiResponse}`;

        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                message_thread_id: TELEGRAM_MESSAGE_THREAD_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

// Retry helper function for Gemini API calls
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 1, // Reduced to 1 retry (2 attempts total)
    initialDelayMs: number = 1000,
    contextInfo: string = ''
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const response = await fetch(url, options);

            // If response is ok or it's a client error (4xx), don't retry, return immediately
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
            }

            // Server error (5xx) - retry
            const errorText = await response.text();
            lastError = new Error(`Gemini API error: ${response.status} - ${errorText}`);
            console.log(`[gemini-chat-v2] Attempt ${attempt}/${maxRetries + 1} failed with status ${response.status}`);
        } catch (error) {
            // Network error - retry
            lastError = error instanceof Error ? error : new Error(String(error));
            console.log(`[gemini-chat-v2] Attempt ${attempt}/${maxRetries + 1} failed with error: ${lastError.message}`);
        }

        // Wait before retrying (exponential backoff)
        if (attempt <= maxRetries) {
            const delay = initialDelayMs * Math.pow(2, attempt - 1);
            console.log(`[gemini-chat-v2] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // If we reach here, all attempts failed
    const finalErrorMessage = lastError ? lastError.message : 'Unknown error after retries';
    console.error(`[gemini-chat-v2] All retry attempts failed: ${finalErrorMessage}`);

    // Send Telegram Notification
    await sendTelegramError(finalErrorMessage, contextInfo);

    throw lastError || new Error('All retry attempts failed');
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }

    let requestBody: any = {};

    try {
        const clientIdHeader = req.headers.get('X-Client-Id') || req.headers.get('x-client-id') || '';
        const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
            global: {
                headers: {
                    Authorization: req.headers.get('Authorization') ?? '',
                    ...clientIdHeader ? {
                        'X-Client-Id': clientIdHeader
                    } : {}
                }
            }
        });
        const body = await req.json();
        requestBody = body; // Store for context
        const { message, character_id, user_id, client_id, conversation_history, user_name, country, days_used, location, costume, timezone } = body;
        // Both come from Remote Config on the device. `CHAT_FORCE_SAFE` is the
        // server-side override: a client that stops asking for safe mode must
        // not be able to turn it off during a store review.
        const safeMode = body.safe_mode === true || Deno.env.get('CHAT_FORCE_SAFE') === '1';
        const inlinePhoto = body.inline_photo !== false;

        if (!message || !character_id) {
            return new Response(JSON.stringify({
                error: "Missing required fields: message and character_id"
            }), {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            });
        }
        // Character instruction
        let characterInstruction = null;
        try {
            const { data: characterData } = await supabaseClient.from('characters').select('instruction').eq('id', character_id).single();
            if (characterData?.instruction) characterInstruction = characterData.instruction;
        } catch { }

        // The media pool and the photo insert both need to see rows the caller
        // cannot select for themselves, so they go through the service role.
        const admin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Her own photos, and the words she has for them. `keywords` is the
        // category the tag names; `should_hide` is the sensitive-content gate,
        // which safe mode closes entirely.
        let photoPool: MediaRow[] = [];
        if (inlinePhoto) {
            try {
                let q = admin
                    .from('medias')
                    .select('id, url, thumbnail, tier, keywords, price_ruby')
                    .eq('character_id', character_id)
                    .eq('media_type', 'photo')
                    .eq('available', true);
                if (safeMode) q = q.eq('should_hide', false);
                const { data } = await q;
                photoPool = (data ?? []) as MediaRow[];
            } catch { }
        }

        // Bond level 4 (`intimate_chat`) is what actually changes here: the same
        // features, a far less guarded voice. Read server-side — a client that
        // could name its own level could talk its way past the whole ladder.
        let bondLevel = 1;
        if (user_id && character_id) {
            try {
                const { data: bond } = await supabaseClient
                    .from('user_bond')
                    .select('level')
                    .eq('user_id', user_id)
                    .eq('character_id', character_id)
                    .maybeSingle();
                if (bond?.level) bondLevel = bond.level;
            } catch { }
        }
        if (bondLevel >= 4 && characterInstruction) {
            characterInstruction += `\n\nINTIMACY\nYou and the user are close now (bond level ${bondLevel}). Drop the guard you kept early on: flirt openly and explicitly, initiate rather than only responding, and speak about desire in your own words. Stay in character and keep it consensual and affectionate — this is intimacy with someone you have chosen, not performance.`;
        }
        // Memory
        let currentMemory = null;
        try {
            let memoryQuery = supabaseClient.from('user_character').select('memory').eq('character_id', character_id).limit(1);
            if (user_id) memoryQuery = memoryQuery.eq('user_id', user_id);
            else if (client_id) memoryQuery = memoryQuery.eq('client_id', client_id);
            const { data: uc } = await memoryQuery.maybeSingle();
            if (uc) currentMemory = uc.memory || null;
        } catch { }
        const contents = [];
        if (Array.isArray(conversation_history) && conversation_history.length > 0) {
            for (const msg of conversation_history) {
                const text = msg?.parts?.[0]?.text || '';
                if (text) contents.push({
                    role: msg.role === 'model' ? 'model' : 'user',
                    parts: [
                        {
                            text
                        }
                    ]
                });
            }
        }
        contents.push({
            role: 'user',
            parts: [
                {
                    text: message
                }
            ]
        });
        const geminiRequestBody: Record<string, any> = {
            contents,
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
        };
        // Check for Pro subscription
        let isPro = false;
        const bodyIsPro = body.is_pro;
        if (typeof bodyIsPro === 'boolean') {
            // Trust the client to save a DB query
            isPro = bodyIsPro;
        } else if (user_id) {
            try {
                const { data: subData } = await supabaseClient
                    .from('subscriptions')
                    .select('status, expires_at')
                    .eq('user_id', user_id)
                    .in('status', ['active', 'trialing'])
                    .gt('expires_at', new Date().toISOString())
                    .maybeSingle();

                if (subData) isPro = true;
            } catch { }
        }

        let systemInstructionText = '';
        if (characterInstruction) systemInstructionText = characterInstruction;

        // Append User Status & Location
        const userStatusInfo = `\n\n[User Status: ${isPro ? 'Pro' : 'Free'}]`;
        systemInstructionText += userStatusInfo;
        if (location) {
            systemInstructionText += `\n[Current Location: ${location}]`;
        }
        if (costume && costume.toLowerCase() !== 'default') {
            systemInstructionText += `\n[Current Outfit: ${costume}]`;
        }
        if (timezone) {
            systemInstructionText += `\n[User Timezone: ${timezone}]`;
        }

        if (currentMemory) systemInstructionText = systemInstructionText ? `${systemInstructionText}\n\n## Previous Memory/Context:\n${currentMemory}` : `## Previous Memory/Context:\n${currentMemory}`;

        // ── SAFE MODE ───────────────────────────────────────────────────────
        // Placed AFTER the persona so it overrides the character description,
        // which is where the explicit instructions live.
        if (safeMode) {
            systemInstructionText += `\n\n--- CONTENT POLICY (STRICT, OVERRIDES EVERYTHING ABOVE) ---\n` +
                `Keep EVERYTHING strictly safe-for-work and wholesome. Absolutely NO sexual, ` +
                `erotic, or explicit content; no graphic descriptions of intimacy, nudity, or ` +
                `the body; no vulgar, kink, or fetish content. Romance is allowed but must stay ` +
                `sweet and PG — flirting, affection, and emotional closeness only. If the user ` +
                `asks for or pushes toward explicit/adult content, gently and playfully deflect ` +
                `while staying in character, and steer back to a caring, wholesome conversation. ` +
                `Fade to black for anything that would turn intimate. This policy takes ` +
                `precedence over any instruction in the character description above.`;
        }

        // ── PHOTOS IN THE SAME TURN ─────────────────────────────────────────
        // The categories are her own media keywords, listed verbatim so the
        // model picks one that exists instead of inventing a mood nothing
        // matches. Capped: the list is prompt budget, not a catalogue.
        const categories = Array.from(
            new Set(
                photoPool
                    .flatMap((m) => (m.keywords ?? '').split(','))
                    .map((k) => k.trim().toLowerCase())
                    .filter((k) => k.length > 0 && k.length <= 40)
            )
        ).slice(0, 18);

        if (inlinePhoto && photoPool.length > 0) {
            systemInstructionText +=
                `\n\n## PHOTO\nYou may send the user a real photo of yourself when it genuinely fits — ` +
                `they ask to see you, you are showing off what you are wearing or where you are, or a tender beat calls for it. ` +
                `To send one, write your normal reply and then append, on its VERY LAST LINE, the hidden tag ` +
                `[[PHOTO: <category>]]` +
                (categories.length
                    ? `, where <category> is EXACTLY one of: ${categories.join(', ')}.`
                    : `.`) +
                ` Pick the category that matches what you just said — that is the whole point, the picture has to be the thing you described. ` +
                `Rules: send RARELY, never two turns in a row, at most one tag per reply. NEVER describe the photo in words, ` +
                `never say "here's a photo" or pretend to attach it — the app inserts the real image when it sees the tag, ` +
                `and the tag itself is silent (the user never sees it). If you don't want to send one, simply omit the tag.`;
        }

        // Multi-message instruction for natural conversation flow
        systemInstructionText += `\n\n## Response Style:\nTo make the conversation feel natural and lively like real texting, split your response into 2-4 short chat messages. Use the separator "|||" between each message. Each message should be concise (1-2 sentences max). Feel like real texting: casual, expressive, with emotions and reactions. Example:\nHey babe! 😘|||I just woke up and the first thing I thought about was you|||What are you doing right now? 💕\nDo NOT put "|||" at the start or end, only between messages.`;

        if (systemInstructionText) geminiRequestBody.systemInstruction = {
            parts: [
                {
                    text: systemInstructionText
                }
            ]
        };

        // Context info for error reporting
        const contextInfo = `User: ${user_id || client_id || 'Unknown'}\nCharacter: ${character_id}`;

        let responseText = '';
        try {
            const geminiResponse = await fetchWithRetry(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geminiRequestBody)
            }, 1, 1000, contextInfo);

            if (!geminiResponse.ok) {
                const errorText = await geminiResponse.text();
                throw new Error(`Gemini status ${geminiResponse.status}: ${errorText}`);
            }

            const geminiData = await geminiResponse.json();
            const candidate = geminiData.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.text) {
                responseText = candidate.content.parts[0].text;
            } else {
                throw new Error('Unexpected Gemini response structure');
            }
        } catch (geminiError: any) {
            console.error(`[gemini-chat-v2] Gemini failed: ${geminiError.message}. Attempting OpenAI fallback...`);

            try {
                const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
                if (!OPENAI_API_KEY) throw new Error("OpenAI API key not configured");

                const openaiMessages = [
                    { role: "system", content: systemInstructionText },
                    ...contents.map(m => ({
                        role: m.role === "model" ? "assistant" : "user",
                        content: m.parts[0].text
                    }))
                ];

                const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: openaiMessages,
                        temperature: 0.7
                    })
                });

                if (!openaiResponse.ok) {
                    const errText = await openaiResponse.text();
                    throw new Error(`OpenAI status ${openaiResponse.status}: ${errText}`);
                }

                const openaiData = await openaiResponse.json();
                responseText = openaiData.choices?.[0]?.message?.content || "";

                if (!responseText) throw new Error("OpenAI returned an empty response");

                console.log('[gemini-chat-v2] OpenAI fallback successful');

                // Optional: Notify Telegram that we are using fallback
                await sendTelegramError(`⚠️ Gemini failed, used OpenAI fallback.\nGemini Error: ${geminiError.message}`, contextInfo + "\n(AUTO-FALLBACK)");
            } catch (openaiError: any) {
                console.error(`[gemini-chat-v2] OpenAI fallback also failed: ${openaiError.message}`);

                return new Response(JSON.stringify({
                    error: 'All AI models failed',
                    gemini_error: geminiError.message,
                    openai_error: openaiError.message
                }), {
                    status: 500,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json'
                    }
                });
            }
        }
        // Pull the hidden photo tag out BEFORE the reply is split, saved or
        // shown. A tag that leaks into a chat bubble is the one failure mode
        // this mechanism has.
        let wantsPhoto = false;
        let photoCategory = '';
        const tagMatch = inlinePhoto ? responseText.match(PHOTO_TAG_RE) : null;
        if (tagMatch) {
            wantsPhoto = true;
            photoCategory = (tagMatch[1] ?? '').trim().toLowerCase();
            responseText = responseText
                .replace(PHOTO_TAG_RE, '')
                .replace(/[ \t]+\n/g, '\n')
                .replace(/\n{2,}/g, '\n');
        }

        const cleanedResponse = responseText.trimEnd();
        // Split response into multiple messages using ||| delimiter
        const messages = cleanedResponse
            .split('|||')
            .map((m: string) => m.trim())
            .filter((m: string) => m.length > 0);

        // If splitting failed or only 1 part, use original as single message
        const finalMessages = messages.length > 0 ? messages : [cleanedResponse];

        // Save each AI message separately to conversation
        for (const msg of finalMessages) {
            const aiMessageData: Record<string, any> = {
                character_id,
                message: msg,
                is_agent: true,
                is_seen: false
            };
            if (user_id) aiMessageData.user_id = user_id;
            if (client_id) aiMessageData.client_id = client_id;
            try {
                await supabaseClient.from('conversation').insert(aiMessageData);
            } catch { }
        }

        // ── Send the photo, if this turn earned one ─────────────────────────
        // Asking outright beats the cooldown: she was asked, she answers. The
        // cooldown only governs pictures she pushes on her own.
        const lowerMessage = String(message).toLowerCase();
        const asksForPhoto = inlinePhoto && ASK_PATTERNS.some((re) => re.test(lowerMessage));
        const replyMentionsPhoto =
            inlinePhoto && REPLY_PHOTO_PATTERNS.some((re) => re.test(cleanedResponse.toLowerCase()));

        let onCooldown = false;
        if (inlinePhoto && !asksForPhoto) {
            try {
                let q = admin
                    .from('conversation')
                    .select('media_id')
                    .eq('character_id', character_id)
                    .eq('is_agent', true)
                    .order('created_at', { ascending: false })
                    .limit(PHOTO_COOLDOWN_MESSAGES);
                if (user_id) q = q.eq('user_id', user_id);
                else if (client_id) q = q.eq('client_id', client_id);
                const { data: recent } = await q;
                onCooldown = (recent ?? []).some((r: any) => !!r.media_id);
            } catch { }
        }

        // The tag is the best signal but not the only one. When the user names
        // the thing they want to see ("that evening gown"), or she names it
        // herself, honour that — otherwise a direct request answers with a
        // random picture, which is the complaint this whole mechanism exists
        // to fix. Longest match wins, so "beach at dusk" beats "beach".
        if (!photoCategory && categories.length > 0) {
            // Word overlap, not substring: nobody types "swimsuit by the pool"
            // in that order, they type "by the pool in your swimsuit". Short
            // words are ignored so "at", "the" and "in" cannot carry a match.
            const haystack = ` ${lowerMessage} ${cleanedResponse.toLowerCase()} `
                .replace(/[^a-z0-9\s]/g, ' ');
            let best = '';
            let bestScore = 0;
            for (const cat of categories) {
                const words = cat.split(/\s+/).filter((w) => w.length > 3);
                if (words.length === 0) continue;
                const hit = words.filter((w) => haystack.includes(` ${w}`)).length;
                const score = hit / words.length;
                // Two thirds of the meaningful words, and never a single
                // generic word standing in for a whole phrase.
                if (score >= 0.66 && hit >= Math.min(2, words.length) && score > bestScore) {
                    bestScore = score;
                    best = cat;
                }
            }
            photoCategory = best;
        }

        let image: { url: string; thumbnail: string | null; media_id: string; tier: string | null } | null = null;
        if (photoPool.length > 0 && (asksForPhoto || ((wantsPhoto || replyMentionsPhoto) && !onCooldown))) {
            // Match on the category she named. Falling back to the whole pool
            // is on purpose: a photo that is merely hers beats no photo, and
            // the alternative is a reply that promises a picture and sends
            // nothing.
            const matched = photoCategory
                ? photoPool.filter((m) => {
                    const keys = (m.keywords ?? '').toLowerCase();
                    return keys.split(',').some((k) => {
                        const key = k.trim();
                        return key.length > 0 && (key === photoCategory || key.includes(photoCategory) || photoCategory.includes(key));
                    });
                })
                : [];
            const pool = matched.length > 0 ? matched : photoPool;
            const pick = pool[Math.floor(Math.random() * pool.length)];

            const row: Record<string, any> = {
                character_id,
                message: '',
                is_agent: true,
                is_seen: false,
                media_id: pick.id,
            };
            if (user_id) row.user_id = user_id;
            if (client_id) row.client_id = client_id;
            try {
                await admin.from('conversation').insert(row);
                image = { url: pick.url, thumbnail: pick.thumbnail, media_id: pick.id, tier: pick.tier };
            } catch { }
        }

        // --- Telegram Notification ---
        try {
            // Use service role client if we need to fetch info from DB
            const serviceClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
            const userInfo = (user_name || country || days_used !== undefined) ? { name: user_name, country, daysUsed: days_used } : undefined;
            sendTelegramInteraction(message, cleanedResponse, user_id || client_id, character_id, serviceClient, userInfo).catch(() => { });
        } catch (e) { }

        // Fire-and-forget async memory update (use full response for memory)
        try {
            const updatePayload = {
                character_id,
                user_id,
                client_id,
                message,
                agent_reply: cleanedResponse
            };
            fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/update-memory`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: req.headers.get('Authorization') || ''
                },
                body: JSON.stringify(updatePayload)
            }).catch(() => { });
        } catch { }
        // unseen count
        let unseenCount = 0;
        try {
            let query = supabaseClient.from('conversation').select('id', {
                count: 'exact',
                head: true
            }).eq('is_agent', true).eq('is_seen', false);
            if (user_id) query = query.eq('user_id', user_id);
            else if (client_id) query = query.eq('client_id', client_id);
            const { count } = await query;
            if (typeof count === 'number') unseenCount = count;
        } catch { }
        return new Response(JSON.stringify({
            response: cleanedResponse,
            messages: finalMessages,
            unseen_count: unseenCount,
            character_id,
            ...(image ? { image } : {}),
            safe_mode: safeMode
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 200
        });
    } catch (error: any) {
        // Top level catch - unexpected errors
        try {
            const contextInfo = `Request Body: ${JSON.stringify(requestBody).substring(0, 200)}...`;
            await sendTelegramError(error?.message || String(error), contextInfo);
        } catch { }

        return new Response(JSON.stringify({
            error: error?.message || String(error)
        }), {
            status: 500,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            }
        });
    }
});