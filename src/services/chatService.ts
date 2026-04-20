import { supabase } from "../config/supabase";
import { analyticsService } from "./AnalyticsService";

const EDGE_FUNCTION_URL = "gemini-chat";

export interface ChatMessage {
    id: string;
    role: "user" | "model";
    text: string;
    createdAt: Date;
    mediaUrl?: string;
    mediaType?: "image" | "video";
    mediaTier?: string;
}

export interface SuggestedAction {
    action: string;
    confidence: number;
    parameters: { animationName?: string };
    reasoning: string;
}

interface ConversationRow {
    id: string;
    message: string;
    is_agent: boolean;
    created_at: string;
}

export const chatService = {
    /**
     * Load recent conversation history from DB
     */
    async loadHistory(
        characterId: string,
        userId: string,
        limit = 30
    ): Promise<ChatMessage[]> {
        const { data, error } = await supabase
            .from("conversation")
            .select(`
                id, 
                message, 
                is_agent, 
                created_at,
                media_id,
                medias:media_id (url, media_type, tier)
            `)
            .eq("character_id", characterId)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) {
            console.error("Failed to load chat history:", error);
            return [];
        }

        return (data as any[])
            .reverse()
            .map((row) => ({
                id: row.id,
                role: row.is_agent ? ("model" as const) : ("user" as const),
                text: row.message,
                createdAt: new Date(row.created_at),
                mediaUrl: row.medias?.url,
                mediaType: row.medias?.media_type === "photo" ? "image" : (row.medias?.media_type === "video" ? "video" : undefined),
                mediaTier: row.medias?.tier,
            }));
    },

    /**
     * Send a message and get AI response (multi-message format).
     * The edge function handles saving both user and AI messages to DB,
     * so we only need to save the user message here for immediate UI feedback.
     */
    async sendMessage(
        message: string,
        characterId: string,
        userId: string,
        conversationHistory: ChatMessage[],
        isPro?: boolean,
        userInfo?: { userName?: string; country?: string; daysUsed?: number }
    ): Promise<{ messages: string[]; response: string; unseenCount: number }> {
        // Save user message to DB
        await supabase.from("conversation").insert({
            character_id: characterId,
            user_id: userId,
            message,
            is_agent: false,
            is_seen: true,
        });

        // Build Gemini conversation history (last 20 messages)
        const geminiHistory = conversationHistory.slice(-20).map((msg) => ({
            role: msg.role === "model" ? "model" : "user",
            parts: [{ text: msg.text }],
        }));

        const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION_URL, {
            body: {
                message,
                character_id: characterId,
                user_id: userId,
                conversation_history: geminiHistory,
                is_pro: isPro,
                user_name: userInfo?.userName,
                country: userInfo?.country,
                days_used: userInfo?.daysUsed,
            },
        });

        if (error) throw error;

        // supabase.functions.invoke may return a string if content-type isn't detected correctly
        let parsed = data;
        if (typeof data === "string") {
            try { parsed = JSON.parse(data); } catch { parsed = { response: data, messages: [data] }; }
        }

        console.log("[chatService] AI response:", parsed);

        // Log internal analytics
        analyticsService.logSendMessage(characterId, message.length);

        // Edge function returns: { response, messages, unseen_count, character_id }
        return {
            messages: parsed?.messages ?? [parsed?.response ?? ""],
            response: parsed?.response ?? "",
            unseenCount: parsed?.unseen_count ?? 0,
        };
    },

    /**
     * Save a completed message (e.g. from a voice call transcript) directly to DB
     */
    async saveCallMessage(message: string, characterId: string, userId: string, isAgent: boolean) {
        if (!message || !characterId || !userId) return;
        try {
            await supabase.from("conversation").insert({
                character_id: characterId,
                user_id: userId,
                message,
                is_agent: isAgent,
                is_seen: true,
            });
        } catch (e) {
            console.error("Failed to save call message:", e);
        }
    },

    /**
     * Call gemini-suggest-action to determine what VRM action to perform
     */
    async suggestAction(message: string): Promise<SuggestedAction> {
        try {
            const { data, error } = await supabase.functions.invoke(
                "gemini-suggest-action",
                { body: { message } }
            );

            if (error || !data) {
                return { action: "none", confidence: 1, parameters: {}, reasoning: "" };
            }

            // Log analytics for action
            if (data.action && data.action !== 'none') {
                analyticsService.logActionSuggested(data.action, data.confidence || 0, data.parameters);
            }

            return {
                action: data.action ?? "none",
                confidence: data.confidence ?? 0,
                parameters: data.parameters ?? {},
                reasoning: data.reasoning ?? "",
            };
        } catch {
            return { action: "none", confidence: 1, parameters: {}, reasoning: "" };
        }
    },

    /**
     * Mark messages as seen
     */
    async markAsSeen(characterId: string, userId: string) {
        await supabase
            .from("conversation")
            .update({ is_seen: true })
            .eq("character_id", characterId)
            .eq("user_id", userId)
            .eq("is_agent", true)
            .eq("is_seen", false);
    },

    /**
     * Fetch a random media asset for a character
     */
    async fetchRandomMedia(characterId: string, type: "image" | "video" | "nude", isPro: boolean): Promise<{ id: string; url: string; type: "image" | "video"; tier: string } | null> {
        try {
            let query = supabase
                .from("medias")
                .select("id, url, media_type, tier")
                .eq("character_id", characterId)
                .eq("available", true);

            if (type === "nude") {
                // Filter for specific keywords in content_type or url
                const keywords = ["uncensored", "nude", "masturbate", "show boobs", "show_boobs", "sexy", "hentai", "xxx"];
                const orFilter = keywords.map(k => `content_type.ilike.%${k}%,url.ilike.%${k}%`).join(",");
                query = query.or(orFilter);
                
                // If no special keywords match, we'll try to find any pro photo as fallback in the return logic
            } else {
                const dbType = type === "image" ? "photo" : "video";
                query = query.eq("media_type", dbType);
                
                // If not pro, filter for free media only
                if (!isPro) {
                    query = query.eq("tier", "free");
                }
            }

            const { data, error } = await query;

            if (error || !data || data.length === 0) {
                // FALLBACK for NUDE: if no keywords match, try to find ANY pro photo for this character
                if (type === "nude") {
                    const { data: fallbackPro } = await supabase
                        .from("medias")
                        .select("id, url, media_type, tier")
                        .eq("character_id", characterId)
                        .eq("available", true)
                        .eq("media_type", "photo")
                        .eq("tier", "pro");
                    
                    if (fallbackPro && fallbackPro.length > 0) {
                        const random = fallbackPro[Math.floor(Math.random() * fallbackPro.length)];
                        return {
                            id: random.id,
                            url: random.url,
                            type: "image",
                            tier: random.tier,
                        };
                    }
                }

                // Fallback for regular images if no free ones found
                if (!isPro && type !== "nude") {
                    const { data: proFallback } = await supabase
                        .from("medias")
                        .select("id, url, media_type, tier")
                        .eq("character_id", characterId)
                        .eq("available", true)
                        .eq("media_type", type === "image" ? "photo" : "video")
                        .eq("tier", "pro")
                        .limit(5);
                    
                    if (proFallback && proFallback.length > 0) {
                        const random = proFallback[Math.floor(Math.random() * proFallback.length)];
                        return {
                            id: random.id,
                            url: random.url,
                            type: (random.media_type === "photo" ? "image" : "video") as "image" | "video",
                            tier: random.tier,
                        };
                    }
                }
                return null;
            }

            const random = data[Math.floor(Math.random() * data.length)];
            return {
                id: random.id,
                url: random.url,
                type: (random.media_type === "photo" ? "image" : "video") as "image" | "video",
                tier: random.tier,
            };
        } catch (e) {
            console.error("Failed to fetch random media:", e);
            return null;
        }
    },

    /**
     * Save a media message directly to DB
     */
    async saveMediaMessage(characterId: string, userId: string, mediaId: string) {
        if (!characterId || !userId || !mediaId) return;
        try {
            await supabase.from("conversation").insert({
                character_id: characterId,
                user_id: userId,
                media_id: mediaId,
                message: "", // Saved as independent media message without caption
                is_agent: true,
                is_seen: true,
            });
        } catch (e) {
            console.error("Failed to save media message:", e);
        }
    },
};
