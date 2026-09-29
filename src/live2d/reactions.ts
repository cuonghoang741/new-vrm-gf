import type { TouchPart } from "../components/VRMViewer";
import type { Emotion, Live2DConfig, Live2DEffect, Live2DReaction } from "./types";

/**
 * Her mood, read from a chat reply.
 *
 * fi005's chat returns an `emotion` field; TrueMate's does not, and changing
 * the production prompt for every character to add one is not worth it for
 * this. Replies lean on emoji, which read the same in every language, so they
 * carry most of the signal; a few words cover the rest.
 */
const SIGNALS: [Emotion, RegExp][] = [
    ["love", /❤️|❤|💕|💖|💗|💓|💞|😍|🥰|😘|\blove you\b|yêu anh|yêu em/giu],
    ["shy", /😳|🙈|☺️|🫣|>\/\/\/<|\bblush/giu],
    ["sad", /😢|😭|🥺|😞|😔|💔|\bsad\b|buồn/giu],
    ["angry", /😠|😡|💢|🤬/gu],
    ["pouty", /😤|😒|🙄|\bhmph\b|hứ/giu],
    ["surprised", /😲|😮|😱|🤯|‼️|\bwow\b|\bwhoa\b/giu],
    ["playful", /😜|😝|😛|😏|😉|🤭|😋|\bhehe\b/giu],
    ["happy", /😊|😄|😁|😆|🙂|😃|✨|🎉|🌸|\bhaha\b|\byay\b/giu],
];

export function inferEmotion(text: string): Emotion {
    let best: Emotion = "neutral";
    let bestScore = 0;
    for (const [emotion, re] of SIGNALS) {
        const score = (text.match(re) ?? []).length;
        if (score > bestScore) { best = emotion; bestScore = score; }
    }
    return best;
}

const EFFECT: Partial<Record<Emotion, Live2DEffect>> = {
    love: "hearts",
    happy: "sparkle",
    shy: "blush",
    sad: "tears",
    angry: "anger",
    pouty: "sweat",
    surprised: "question",
    playful: "music",
};

export const effectFor = (emotion: Emotion): Live2DEffect | null => EFFECT[emotion] ?? null;

/** The character's own motion/expression for an emotion, from her emotion_map. */
export function reactionFor(config: Live2DConfig, emotion: Emotion): Live2DReaction | null {
    return config.emotionMap[emotion] ?? null;
}

/**
 * Which body part a Live2D tap counts as, for the touch quota and XP.
 *
 * Several models only define a Body hit area, and it covers her head too, so
 * a tap there cannot say "head" by itself. Her head sits in the top third of
 * the screen for every model at the scale used here, so that decides it.
 */
export function partForTap(areas: string[], y: number, height: number): TouchPart | null {
    if (!areas.length) return null;
    if (areas.some((a) => /head|face/i.test(a))) return "head";
    if (height > 0 && y / height < 0.38) return "head";
    return "belly";
}

/** How she answers a touch there, independent of what the server says. */
export function touchResponse(part: TouchPart): { emotions: Emotion[]; effects: Live2DEffect[] } {
    if (part === "head" || part === "face") {
        return { emotions: ["happy", "shy", "love"], effects: ["blush", "music", "hearts"] };
    }
    return { emotions: ["surprised", "shy", "pouty"], effects: ["question", "sweat"] };
}

export const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
