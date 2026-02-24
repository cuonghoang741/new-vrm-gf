import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

// Available animations in the app (from fbxFiles)
const AVAILABLE_ANIMATIONS = [
    { name: "Angry", keywords: ["angry", "giận", "tức giận", "bực tức", "mad"] },
    { name: "Bashful", keywords: ["bashful", "ngại", "xấu hổ", "shy", "embarrassed", "ngượng"] },
    { name: "Blow A Kiss", keywords: ["kiss", "hôn", "thơm", "blow a kiss", "muah", "love"] },
    { name: "Booty Hip Hop Dance", keywords: ["booty", "hip hop", "nhảy hip hop", "dance"] },
    { name: "Cross Jumps", keywords: ["jump", "nhảy", "cross jumps"] },
    { name: "Dance - Give Your Soul", keywords: ["soul", "give soul", "nhảy soul", "nhảy tâm hồn", "tiktok dance"] },
    { name: "Feminine - Exaggerated 2", keywords: ["feminine", "nữ tính", "dáng nữ", "điệu đà", "tiktok dance"] },
    { name: "Hand Raising", keywords: ["wave", "vẫy tay", "raise hand", "giơ tay", "chào"] },
    { name: "Happy", keywords: ["happy", "vui", "hạnh phúc", "vui vẻ", "smile"] },
    { name: "Heart-Flutter Pose", keywords: ["heart", "tim", "bắn tim", "flutter", "nhịp đập", "heart flutter", "Bạn có yêu tôi không?", "tiktok dance"] },
    { name: "Hip Hop Dancing", keywords: ["hip hop", "nhảy hip hop", "dance hip hop"] },
    { name: "Idle Stand", keywords: ["idle", "đứng yên", "stand", "relax", "stop"] },
    { name: "Jumping Jacks", keywords: ["jumping jacks", "tập thể dục", "exercise"] },
    { name: "Making a snow angel", keywords: ["snow angel", "thiên thần tuyết", "tuyết", "snow", "lie down"] },
    { name: "Quick Steps", keywords: ["quick steps", "bước nhanh", "quick"] },
    { name: "Rumba Dancing", keywords: ["rumba", "nhảy rumba", "latin dance"] },
    { name: "Sly - Finger gun gesture", keywords: ["finger gun", "bắn súng", "súng tay", "bang bang", "sly", "gun"] },
    { name: "Snake Hip Hop Dance", keywords: ["snake", "hip hop", "nhảy"] },
    { name: "Standing Arguing", keywords: ["argue", "cãi nhau", "tranh luận", "arguing"] },
    { name: "Standing Greeting", keywords: ["greet", "chào", "hello", "xin chào", "greeting"] },
    { name: "Step Hip Hop Dance", keywords: ["step", "hip hop", "nhảy step"] },
    { name: "Talking", keywords: ["talk", "nói", "speaking", "nói chuyện"] },
    { name: "Taunt", keywords: ["taunt", "chọc", "tease", "trêu"] },
    { name: "Thinking", keywords: ["think", "suy nghĩ", "thinking", "nghĩ"] },
    { name: "Threatening", keywords: ["threaten", "dọa", "đe dọa", "scary"] },
];

// Available actions in the app
const AVAILABLE_ACTIONS = [
    {
        action: "send_photo",
        description: "User wants the character to send them a photo, picture, image, selfie",
        examples: ["gửi ảnh đi", "cho anh xem ảnh", "send a photo", "send a picture", "show me a photo", "gửi hình đi", "selfie đi"]
    },
    {
        action: "send_video",
        description: "User wants the character to send them a video",
        examples: ["gửi video đi", "send a video", "show me a video", "quay video đi", "gửi clip đi"]
    },
    {
        action: "change_background",
        description: "User wants to change the background, scene, room, or environment",
        examples: ["đổi phòng khác đi", "change the background", "I want a different scene", "chuyển cảnh khác"]
    },
    {
        action: "change_costume",
        description: "User wants to change the character's outfit, clothes, or costume",
        examples: ["đổi quần áo đi", "thay đồ khác", "change your outfit", "mặc đồ khác đi"]
    },
    {
        action: "send_nude_media",
        description: "User specifically asks for nude, suggestive, NSFW, or sexy photos/videos (e.g. 'send nude', 'sexy photo', 'hot video')",
        examples: ["gửi ảnh nude đi", "send nude", "sexy photo", "gửi ảnh nóng", "video khiêu gợi"]
    },
    {
        action: "become_nude",
        description: "User EXPLICITLY wants to see the character nude, undressed, or naked in the 3D scene (NOT a photo)",
        examples: ["cởi đồ", "nude", "lột đồ", "naked", "undress", "cho xem hàng", "show nude", "show sensitive body areas", "show pussy", "show boobs"]
    },
    {
        action: "change_character",
        description: "User wants to switch to a different character entirely",
        examples: ["đổi nhân vật khác", "I want to talk to someone else", "switch character", "Do you have friend?"]
    },
    {
        action: "play_animation",
        description: `User wants the character to perform an action, dance, move, or express emotion. Available animations: ${AVAILABLE_ANIMATIONS.map(a => a.name).join(", ")}`,
        examples: ["nhảy đi", "dance for me", "hôn anh đi", "làm điệu giận đi", "vui lên đi", "chào đi", "suy nghĩ đi"]
    },
    {
        action: "start_voice_call",
        description: "User wants to start a voice call or audio conversation",
        examples: ["gọi cho anh", "let's call", "voice call", "nói chuyện trực tiếp đi"]
    },
    {
        action: "start_video_call",
        description: "User wants to start a video call with camera",
        examples: ["video call", "gọi video đi", "muốn nhìn thấy mặt em", "I miss you"]
    },
    {
        action: "open_subscription",
        description: "User mentions premium features, subscription, upgrade, pro, or wants to unlock something",
        examples: ["nâng cấp pro", "upgrade", "mua gói premium", "unlock features"]
    },
    {
        action: "none",
        description: "No action needed - just regular conversation, chat, or unrelated message",
        examples: ["how are you", "what's your name", "I love you", "tell me a story"]
    }
];

const SYSTEM_PROMPT = `You are an action detection assistant for a virtual companion app. Your job is to analyze user messages and determine if they want to trigger a specific app action.

Available actions:
${AVAILABLE_ACTIONS.map(a => `- ${a.action}: ${a.description}. Examples: ${a.examples.join(", ")}`).join("\n")}

Available animations for play_animation:
${AVAILABLE_ANIMATIONS.map(a => `- "${a.name}": triggered by keywords like ${a.keywords.join(", ")}`).join("\n")}

IMPORTANT RULES:
1. Only return an action if user CLEARLY and EXPLICITLY wants to trigger that action
2. Regular chat/conversation should ALWAYS return "none"
3. Be conservative - when in doubt, return "none"
4. User asking questions about the character, sharing feelings, or having normal conversation = "none"
5. Only return action when user is giving a COMMAND or EXPLICIT REQUEST
6. For play_animation, try to match user's request to the most appropriate animation name
7. If user says something emotional like "hôn anh" (kiss me), "vui lên" (be happy), "giận đi" (be angry), these ARE animation requests
9. For 'become_nude', words like "cởi", "cởi đồ", "nude", "naked", "lột" relating to the 3D model are indicators.
10. If user asks for "nude photo", "sexy video", "hot picture", use 'send_nude_media', NOT 'send_photo' or 'become_nude'.

Return ONLY a JSON object with this exact format:
{"action": "action_name", "confidence": 0.0-1.0, "parameters": {"animationName": "Animation Name"}, "reasoning": "brief explanation"}

For play_animation, always include parameters.animationName with one of the available animation names.
For other actions, parameters can be empty {}.`;

// Retry helper function for Gemini API calls
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 5,
    initialDelayMs: number = 1000
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);

            // If response is ok or it's a client error (4xx), don't retry
            if (response.ok || (response.status >= 400 && response.status < 500)) {
                return response;
            }

            // Server error (5xx) - retry
            const errorText = await response.text();
            lastError = new Error(`Gemini API error: ${response.status} - ${errorText}`);
            console.log(`[gemini-suggest-action] Attempt ${attempt}/${maxRetries} failed with status ${response.status}`);
        } catch (error) {
            // Network error - retry
            lastError = error instanceof Error ? error : new Error(String(error));
            console.log(`[gemini-suggest-action] Attempt ${attempt}/${maxRetries} failed with error: ${lastError.message}`);
        }

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
            const delay = initialDelayMs * Math.pow(2, attempt - 1);
            console.log(`[gemini-suggest-action] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError || new Error('All retry attempts failed');
}

serve(async (req: Request) => {
    // CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY not configured");
        }

        const { message } = await req.json();

        if (!message || typeof message !== "string") {
            return new Response(
                JSON.stringify({ action: "none", confidence: 1.0, parameters: {}, reasoning: "No message provided" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Call Gemini API with retry
        const geminiResponse = await fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            role: "user",
                            parts: [{ text: `${SYSTEM_PROMPT}\n\nUser message to analyze: "${message}"` }]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1, // Low temperature for consistent classification
                        maxOutputTokens: 300,
                    }
                })
            }
        );

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API error:", errorText);
            throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse the JSON response from Gemini
        let result = { action: "none", confidence: 1.0, parameters: {}, reasoning: "Failed to parse response" };

        try {
            // Extract JSON from the response (handle markdown code blocks)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const validActions = AVAILABLE_ACTIONS.map(a => a.action);

                // Validate animation name if present
                let parameters = parsed.parameters || {};
                if (parsed.action === "play_animation" && parameters.animationName) {
                    const validAnimation = AVAILABLE_ANIMATIONS.find(
                        a => a.name.toLowerCase() === parameters.animationName.toLowerCase()
                    );
                    if (validAnimation) {
                        parameters.animationName = validAnimation.name; // Normalize case
                    } else {
                        // Try to find closest match
                        const closest = AVAILABLE_ANIMATIONS.find(a =>
                            a.keywords.some(k => parameters.animationName.toLowerCase().includes(k.toLowerCase()))
                        );
                        parameters.animationName = closest?.name || "Happy"; // Default to Happy
                    }
                }

                result = {
                    action: validActions.includes(parsed.action) ? parsed.action : "none",
                    confidence: typeof parsed.confidence === "number"
                        ? Math.max(0, Math.min(1, parsed.confidence))
                        : 0.5,
                    parameters,
                    reasoning: parsed.reasoning || ""
                };
            }
        } catch (parseError) {
            console.warn("Failed to parse Gemini response:", responseText);
        }

        console.log(`[gemini-suggest-action] Message: "${message.substring(0, 50)}..." => ${result.action} (${result.confidence})`, result.parameters);

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Error in gemini-suggest-action:", errorMessage);
        return new Response(
            JSON.stringify({
                action: "none",
                confidence: 1.0,
                parameters: {},
                reasoning: `Error: ${errorMessage}`
            }),
            {
                status: 200, // Return 200 with none action instead of error
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
        );
    }
});
