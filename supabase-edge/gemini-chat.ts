// @ts-nocheck - This file runs in Deno Edge Runtime, not browser/Vite
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_STREAM_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:streamGenerateContent";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Hardcoded Telegram Credentials to match client service
const TELEGRAM_BOT_TOKEN = '8014102522:AAG5vWRg3UGi7phtyQmoEWygwSOcDrak9vs';
const TELEGRAM_CHAT_ID = '-5289533975';

async function sendTelegramError(error: string, context: string) {
    try {
        const message = `<b>🚨 GEMINI API ERROR</b>\n\nContext: ${context}\nError: ${error}`;
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    let requestBody: any = {};

    try {
        const clientIdHeader = req.headers.get('X-Client-Id') || req.headers.get('x-client-id') || '';
        const authHeader = req.headers.get('Authorization') || '';
        const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
            global: {
                headers: {
                    Authorization: authHeader,
                    ...clientIdHeader ? { 'X-Client-Id': clientIdHeader } : {}
                }
            }
        });
        const body = await req.json();
        requestBody = body;
        const { message, character_id, user_id, client_id, conversation_history } = body;

        if (!message || !character_id) {
            return new Response(JSON.stringify({
                error: "Missing required fields: message and character_id"
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

        // Build conversation contents
        const contents = [];
        if (Array.isArray(conversation_history) && conversation_history.length > 0) {
            for (const msg of conversation_history) {
                const text = msg?.parts?.[0]?.text || '';
                if (text) contents.push({
                    role: msg.role === 'model' ? 'model' : 'user',
                    parts: [{ text }]
                });
            }
        }
        contents.push({ role: 'user', parts: [{ text: message }] });

        // Check for Pro subscription
        let isPro = false;
        const bodyIsPro = body.is_pro;
        if (typeof bodyIsPro === 'boolean') {
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

        // Build system instruction
        let systemInstructionText = '';
        if (characterInstruction) systemInstructionText = characterInstruction;
        systemInstructionText += `\n\n[User Status: ${isPro ? 'Pro' : 'Free'}]`;
        systemInstructionText += `\n\nIf a user requests nude photos, say you can provide them if they are a pro member. Or, if the user is already a pro member, simply say it's suggestive and that you're nude.`;
        if (currentMemory) {
            systemInstructionText = systemInstructionText
                ? `${systemInstructionText}\n\n## Previous Memory/Context:\n${currentMemory}`
                : `## Previous Memory/Context:\n${currentMemory}`;
        }

        const geminiRequestBody: any = { contents };
        if (systemInstructionText) {
            geminiRequestBody.systemInstruction = { parts: [{ text: systemInstructionText }] };
        }

        // Save user message to DB before streaming
        const userMsgData: any = {
            character_id,
            message,
            is_agent: false,
            is_seen: true
        };
        if (user_id) userMsgData.user_id = user_id;
        if (client_id) userMsgData.client_id = client_id;
        try {
            await supabaseClient.from('conversation').insert(userMsgData);
        } catch { }

        const contextInfo = `User: ${user_id || client_id || 'Unknown'}\nCharacter: ${character_id}`;

        // Call Gemini streaming endpoint
        const geminiResponse = await fetch(
            `${GEMINI_STREAM_URL}?alt=sse&key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(geminiRequestBody)
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            await sendTelegramError(`${geminiResponse.status} - ${errorText}`, contextInfo);
            return new Response(JSON.stringify({
                error: `Gemini API error: ${geminiResponse.status}`,
                details: errorText
            }), {
                status: geminiResponse.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Transform Gemini SSE stream into our own SSE stream
        let fullResponse = '';
        const geminiReader = geminiResponse.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = '';

        const stream = new ReadableStream({
            async pull(controller) {
                try {
                    const { done, value } = await geminiReader.read();
                    if (done) {
                        // Send DONE event
                        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                        controller.close();

                        // Background: save AI message to DB and update memory
                        const cleanedResponse = fullResponse.trimEnd();
                        if (cleanedResponse) {
                            const bgTask = (async () => {
                                try {
                                    const aiMessageData: any = {
                                        character_id,
                                        message: cleanedResponse,
                                        is_agent: true,
                                        is_seen: false
                                    };
                                    if (user_id) aiMessageData.user_id = user_id;
                                    if (client_id) aiMessageData.client_id = client_id;
                                    await supabaseClient.from('conversation').insert(aiMessageData);
                                } catch (e) {
                                    console.error('[gemini-chat] Failed to save AI message:', e);
                                }
                                // Fire-and-forget memory update
                                try {
                                    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/update-memory`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            Authorization: authHeader
                                        },
                                        body: JSON.stringify({
                                            character_id,
                                            user_id,
                                            client_id,
                                            message,
                                            agent_reply: cleanedResponse
                                        })
                                    }).catch(() => { });
                                } catch { }
                            })();
                            try {
                                EdgeRuntime.waitUntil(bgTask);
                            } catch {
                                // EdgeRuntime.waitUntil may not be available in all environments
                                bgTask.catch(() => { });
                            }
                        }
                        return;
                    }

                    // Decode chunk and process SSE lines
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (!jsonStr || jsonStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (text) {
                                    fullResponse += text;
                                    controller.enqueue(
                                        encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`)
                                    );
                                }
                            } catch {
                                // Skip unparseable lines
                            }
                        }
                    }
                } catch (err) {
                    console.error('[gemini-chat] Stream error:', err);
                    controller.error(err);
                }
            },
            cancel() {
                geminiReader.cancel();
            }
        });

        return new Response(stream, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        });

    } catch (error: any) {
        try {
            const contextInfo = `Request Body: ${JSON.stringify(requestBody).substring(0, 200)}...`;
            await sendTelegramError(error?.message || String(error), contextInfo);
        } catch { }

        return new Response(JSON.stringify({
            error: error?.message || String(error)
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
