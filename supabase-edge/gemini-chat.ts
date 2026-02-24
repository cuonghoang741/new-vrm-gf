import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Hardcoded Telegram Credentials to match client service
const TELEGRAM_BOT_TOKEN = '8014102522:AAG5vWRg3UGi7phtyQmoEWygwSOcDrak9vs';
const TELEGRAM_CHAT_ID = '-5289533975';
const TELEGRAM_MESSAGE_THREAD_ID = '1';

async function sendTelegramError(error: string, context: string) {
    try {
        const message = `<b>🚨 GEMINI API ERROR</b>\n\nContext: ${context}\nError: ${error}`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                // message_thread_id: TELEGRAM_MESSAGE_THREAD_ID,
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
        const { message, character_id, user_id, client_id, conversation_history } = body;

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
            contents
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

        systemInstructionText += `\n\nIf a user requests nude photos, say you can provide them if they are a pro member. Or, if the user is already a pro member, simply say it's suggestive and that you're nude.`;

        if (currentMemory) systemInstructionText = systemInstructionText ? `${systemInstructionText}\n\n## Previous Memory/Context:\n${currentMemory}` : `## Previous Memory/Context:\n${currentMemory}`;

        if (systemInstructionText) geminiRequestBody.systemInstruction = {
            parts: [
                {
                    text: systemInstructionText
                }
            ]
        };

        // Context info for error reporting
        const contextInfo = `User: ${user_id || client_id || 'Unknown'}\nCharacter: ${character_id}`;

        const geminiResponse = await fetchWithRetry(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(geminiRequestBody)
        }, 1, 1000, contextInfo);

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();

            // Send Telegram Notification for API level errors (after retries returned non-ok)
            await sendTelegramError(`${geminiResponse.status} - ${errorText}`, contextInfo);

            return new Response(JSON.stringify({
                error: `Gemini API error: ${geminiResponse.status}`,
                details: errorText
            }), {
                status: geminiResponse.status,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            });
        }
        const geminiData = await geminiResponse.json();
        let responseText = '';
        try {
            const candidate = geminiData.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.text) responseText = candidate.content.parts[0].text;
            else throw new Error('Unexpected Gemini response structure');
        } catch (error: any) {
            // Send Telegram Notification for parsing errors
            await sendTelegramError(`Parsing Error: ${error?.message || String(error)}\nData: ${JSON.stringify(geminiData)}`, contextInfo);

            return new Response(JSON.stringify({
                error: 'Failed to parse Gemini response',
                details: JSON.stringify(geminiData)
            }), {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            });
        }
        const cleanedResponse = responseText.trimEnd();
        // Save AI message
        const aiMessageData = {
            character_id,
            message: cleanedResponse,
            is_agent: true,
            is_seen: false
        };
        if (user_id) aiMessageData.user_id = user_id;
        if (client_id) aiMessageData.client_id = client_id;
        try {
            await supabaseClient.from('conversation').insert(aiMessageData);
        } catch { }
        // Fire-and-forget async memory update
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
