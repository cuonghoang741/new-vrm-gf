import { supabase } from "../config/supabase";

const EDGE_FUNCTION_URL = "gemini-chat";

export interface ChatMessage {
    id: string;
    role: "user" | "model";
    text: string;
    createdAt: Date;
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
            .select("id, message, is_agent, created_at")
            .eq("character_id", characterId)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (error) {
            console.error("Failed to load chat history:", error);
            return [];
        }

        return (data as ConversationRow[])
            .reverse()
            .map((row) => ({
                id: row.id,
                role: row.is_agent ? ("model" as const) : ("user" as const),
                text: row.message,
                createdAt: new Date(row.created_at),
            }));
    },

    /**
     * Save user message to DB and call Gemini edge function
     */
    async sendMessage(
        message: string,
        characterId: string,
        userId: string,
        conversationHistory: ChatMessage[]
    ): Promise<{ response: string; unseenCount: number }> {
        // Save user message
        await supabase.from("conversation").insert({
            character_id: characterId,
            user_id: userId,
            message,
            is_agent: false,
            is_seen: true,
        });

        // Build Gemini conversation history
        const geminiHistory = conversationHistory.slice(-20).map((msg) => ({
            role: msg.role === "model" ? "model" : "user",
            parts: [{ text: msg.text }],
        }));

        const { data, error } = await supabase.functions.invoke(
            EDGE_FUNCTION_URL,
            {
                body: {
                    message,
                    character_id: characterId,
                    user_id: userId,
                    conversation_history: geminiHistory,
                },
            }
        );

        if (error) {
            throw new Error(error.message ?? "Failed to send message");
        }

        return {
            response: data?.response ?? "...",
            unseenCount: data?.unseen_count ?? 0,
        };
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
};
