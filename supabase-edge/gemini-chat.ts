import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Hardcoded Telegram Credentials to match client service
const TELEGRAM_BOT_TOKEN = '8626302744:AAG_mIQj8pu3g9thuE7kC7fd0Jq1abA0UjE';
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
        if (!name || !country || daysUsed === undefined) {
            const { data: profile } = await supabase.from('profiles').select('display_name, country').eq('id', userId).maybeSingle();
            const { data: stats } = await supabase.from('user_stats').select('created_at').eq('user_id', userId).maybeSingle();
            const { data: authUser } = await supabase.auth.admin.getUserById(userId).then(res => res.data).catch(() => ({ user: null }));

            if (!name) name = profile?.display_name || authUser?.user?.email || 'N/A';
            if (!country) country = profile?.country || 'N/A';
            if (daysUsed === undefined && stats?.created_at) {
                daysUsed = Math.floor((Date.now() - new Date(stats.created_at).getTime()) / (1000 * 60 * 60 * 24));
            }
        }

        const message = `<b>💬 TIN NHẮN MỚI</b>\n\n👤 User: <b>${name}</b>\n🌍 Country: <code>${country}</code>\n📅 Days used: <code>${daysUsed || 0}</code>\n🤖 Nhân vật: <code>${characterId}</code>\n\n<b>Người dùng:</b> ${userMessage}\n\n<b>AI:</b> ${aiResponse}`;

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
            console.log(`[gemini-chat] Attempt ${attempt}/${maxRetries + 1} failed with status ${response.status}`);
        } catch (error) {
            // Network error - retry
            lastError = error instanceof Error ? error : new Error(String(error));
            console.log(`[gemini-chat] Attempt ${attempt}/${maxRetries + 1} failed with error: ${lastError.message}`);
        }

        // Wait before retrying (exponential backoff)
        if (attempt <= maxRetries) {
            const delay = initialDelayMs * Math.pow(2, attempt - 1);
            console.log(`[gemini-chat] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // If we reach here, all attempts failed
    const finalErrorMessage = lastError ? lastError.message : 'Unknown error after retries';
    console.error(`[gemini-chat] All retry attempts failed: ${finalErrorMessage}`);

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
                    Authorization: req.headers.get('Authorization'),
                    ...clientIdHeader ? {
                        'X-Client-Id': clientIdHeader
                    } : {}
                }
            }
        });
        const body = await req.json();
        requestBody = body; // Store for context
        const { message, character_id, user_id, client_id, conversation_history, user_name, country, days_used } = body;

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
        const geminiRequestBody = {
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

        // Append User Status
        const userStatusInfo = `\n\n[User Status: ${isPro ? 'Pro' : 'Free'}]`;
        systemInstructionText += userStatusInfo;

        if (currentMemory) systemInstructionText = systemInstructionText ? `${systemInstructionText}\n\n## Previous Memory/Context:\n${currentMemory}` : `## Previous Memory/Context:\n${currentMemory}`;

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
            console.error(`[gemini-chat] Gemini failed: ${geminiError.message}. Attempting OpenAI fallback...`);

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

                console.log('[gemini-chat] OpenAI fallback successful');

                // Optional: Notify Telegram that we are using fallback
                await sendTelegramError(`⚠️ Gemini failed, used OpenAI fallback.\nGemini Error: ${geminiError.message}`, contextInfo + "\n(AUTO-FALLBACK)");
            } catch (openaiError: any) {
                console.error(`[gemini-chat] OpenAI fallback also failed: ${openaiError.message}`);

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
            character_id
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