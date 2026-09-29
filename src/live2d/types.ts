/**
 * A Live2D character's rendering config, stored in `characters.data.live2d`.
 *
 * These rows are `available = false` so builds without Live2D never list them
 * (see supabase/migrations/20260929140000_live2d_characters.sql); builds that
 * can render them read `data.model_type` and `data.live2d_listed` instead.
 */
export type Live2DReaction = { exp?: string; motion?: string };

export type Emotion =
    | "happy" | "love" | "shy" | "sad" | "angry" | "surprised" | "playful" | "pouty" | "neutral";

export type Live2DEffect =
    | "hearts" | "sparkle" | "anger" | "sweat" | "tears" | "music" | "question" | "blush";

export type Live2DConfig = {
    modelUrl: string;
    scale: number;
    offsetX: number;
    offsetY: number;
    emotionMap: Partial<Record<Emotion, Live2DReaction>>;
    actionMap: Record<string, Live2DReaction>;
};

/** Null for a VRM character, or for a row whose Live2D config is unusable. */
export function parseLive2d(data: any): Live2DConfig | null {
    if (!data || data.model_type !== "live2d") return null;
    const l = data.live2d ?? {};
    if (typeof l.model_url !== "string" || !l.model_url) return null;
    return {
        modelUrl: l.model_url,
        scale: Number(l.scale) || 1,
        offsetX: Number(l.offset_x) || 0,
        offsetY: Number(l.offset_y) || 0,
        emotionMap: l.emotion_map ?? {},
        actionMap: l.action_map ?? {},
    };
}

/** Whether a catalogue row is a Live2D character, for badges and filters. */
export const isLive2dRow = (row: { data?: any } | null | undefined) =>
    row?.data?.model_type === "live2d";
