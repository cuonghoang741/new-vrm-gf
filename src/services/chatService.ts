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
     * Save user message to DB and call Gemini edge function via streaming
     */
    streamMessage(
        message: string,
        characterId: string,
        userId: string,
        conversationHistory: ChatMessage[],
        onChunk: (text: string, fullText: string) => void
    ): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
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

                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                if (!token) throw new Error("No session");

                const body = {
                    message,
                    character_id: characterId,
                    user_id: userId,
                    conversation_history: geminiHistory,
                };

                const xhr = new XMLHttpRequest();
                const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
                if (!supabaseUrl) throw new Error("No SUPABASE_URL");

                xhr.open('POST', `${supabaseUrl}/functions/v1/${EDGE_FUNCTION_URL}`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                let seenBytes = 0;
                let fullText = "";

                xhr.onreadystatechange = () => {
                    if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
                        const newText = xhr.responseText.substring(seenBytes);
                        seenBytes = xhr.responseText.length;

                        if (newText) {
                            const lines = newText.split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const dataStr = line.replace('data: ', '').trim();
                                    if (dataStr === '[DONE]') {
                                        resolve(fullText);
                                        return;
                                    }
                                    if (dataStr) {
                                        try {
                                            const parsed = JSON.parse(dataStr);
                                            if (parsed.token) {
                                                fullText += parsed.token;
                                                onChunk(parsed.token, fullText);
                                            }
                                        } catch (e) {
                                            // Handle split JSON chunks or non-JSON data
                                        }
                                    }
                                }
                            }
                        }

                        if (xhr.readyState === XMLHttpRequest.DONE) {
                            resolve(fullText);
                        }
                    }
                };

                xhr.onerror = () => reject(new Error('Network request failed'));
                xhr.send(JSON.stringify(body));
            } catch (err) {
                reject(err);
            }
        });
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
