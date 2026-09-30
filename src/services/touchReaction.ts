import { supabase } from "../config/supabase";
import { currentLang } from "../i18n";
import { chatSafeMode } from "./remoteConfig";
import type { TouchPart } from "../components/VRMViewer";
import type { Emotion } from "../live2d/types";

export type TouchLine = { line: string; emotion: Emotion };

/** Give up and use a stock line after this long; she has already reacted. */
const TIMEOUT_MS = 4500;
/** At most one generated line this often. Faster touches get a stock line. */
const MIN_GAP_MS = 3000;
let lastAt = 0;

/**
 * Her own line for a touch, from the `touch-reaction` function: written for
 * her personality, where she was touched, and how close the two of you are
 * (read on the server). Null when throttled, offline or slow, so the caller
 * shows its stock line instead.
 */
export async function fetchTouchLine(opts: {
    characterId: string;
    part?: TouchPart;
    action?: "pat" | "hug" | "flowers" | "poke";
    /** Her preview: always a first meeting, whatever the bond. */
    preview?: boolean;
}): Promise<TouchLine | null> {
    const now = Date.now();
    if (now - lastAt < MIN_GAP_MS) return null;
    lastAt = now;
    try {
        const call = supabase.functions.invoke("touch-reaction", {
            body: {
                character_id: opts.characterId,
                part: opts.part,
                action: opts.action,
                lang: currentLang(),
                safe_mode: chatSafeMode(),
                preview: !!opts.preview,
            },
        });
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS));
        const res = await Promise.race([call, timeout]);
        if (!res || res.error) return null;
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        return data?.line ? { line: String(data.line), emotion: (data.emotion ?? "happy") as Emotion } : null;
    } catch {
        return null;
    }
}
