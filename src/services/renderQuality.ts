import * as SecureStore from "expo-secure-store";

/**
 * 3D render quality, remembered across launches.
 *
 * Defaults to `high` deliberately: the scene is the product, and a phone that
 * cannot hold it is rarer than a person who would notice it being soft. The
 * lower settings exist for people who hit heat or battery on a long session.
 *
 * The levers live in `assets/index.html` (`window.setRenderQuality`): pixel
 * ratio and a frame cap. Antialiasing is fixed when the WebGL context is
 * created and cannot be toggled without rebuilding the renderer, so it stays on
 * at every level.
 */
export type RenderQuality = 0 | 1 | 2;

export const QUALITY_KEY = "render_quality";
export const DEFAULT_QUALITY: RenderQuality = 0;

/** i18n keys for the three options, indexed by value. */
export const QUALITY_LABELS = ["set.q_high", "set.q_balanced", "set.q_saver"] as const;

let cached: RenderQuality | null = null;
const listeners = new Set<(q: RenderQuality) => void>();

export function subscribeQuality(fn: (q: RenderQuality) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Last known value without touching storage — for the first render. */
export function qualityNow(): RenderQuality {
    return cached ?? DEFAULT_QUALITY;
}

export async function loadQuality(): Promise<RenderQuality> {
    if (cached !== null) return cached;
    try {
        const raw = await SecureStore.getItemAsync(QUALITY_KEY);
        const n = Number(raw);
        cached = raw !== null && n >= 0 && n <= 2 ? (n as RenderQuality) : DEFAULT_QUALITY;
    } catch {
        cached = DEFAULT_QUALITY;
    }
    return cached;
}

export async function setQuality(q: RenderQuality): Promise<void> {
    cached = q;
    listeners.forEach((fn) => fn(q));
    try {
        await SecureStore.setItemAsync(QUALITY_KEY, String(q));
    } catch {
        // A lost preference is a soft failure: the scene still renders.
    }
}
