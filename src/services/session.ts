import * as SecureStore from "expo-secure-store";

/**
 * Session / launch tracking — the foundation for the Yuuki-style ad scenario:
 *
 *  - **First session**  → splash shows the `inter_splash` interstitial.
 *  - **Returning session** (2nd cold start onward) → the Welcome-back screen
 *    (with a native ad) is shown instead of the splash interstitial.
 *  - **Resume from background** is handled separately by `AdsProvider`
 *    (App Open / `inter_welcome_back`), NOT here.
 *
 * Persisted with expo-secure-store (the app's existing store). All reads are
 * failure-tolerant: on any error we behave as a brand-new install.
 */
const K_LAUNCH_COUNT = "session_launch_count";
const K_LAST_OPEN_AT = "session_last_open_at";
const K_PREV_OPEN_AT = "session_prev_open_at";

let _launchCount = 0;
let _isReturning = false;
let _prevOpenAt: number | null = null;
let _ready = false;

async function getInt(key: string): Promise<number | null> {
    try {
        const v = await SecureStore.getItemAsync(key);
        if (v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

/**
 * Call ONCE at cold start (before deciding splash vs welcome-back). Reads the
 * previous launch count, then bumps it. After this resolves, the synchronous
 * getters below are valid for the rest of the session.
 */
export async function markAppOpened(): Promise<void> {
    const prevCount = (await getInt(K_LAUNCH_COUNT)) ?? 0;
    _prevOpenAt = await getInt(K_LAST_OPEN_AT);
    _isReturning = prevCount > 0; // opened at least once before → returning
    _launchCount = prevCount + 1;
    _ready = true;

    const now = Date.now();
    try {
        if (_prevOpenAt != null) {
            await SecureStore.setItemAsync(K_PREV_OPEN_AT, String(_prevOpenAt));
        }
        await SecureStore.setItemAsync(K_LAUNCH_COUNT, String(_launchCount));
        await SecureStore.setItemAsync(K_LAST_OPEN_AT, String(now));
    } catch {
        /* best-effort */
    }
}

/** True on the very first cold start of a fresh install. */
export function isFirstSession(): boolean {
    return _ready && _launchCount <= 1;
}

/** True from the 2nd cold start onward (drives the Welcome-back screen). */
export function isReturningSession(): boolean {
    return _isReturning;
}

/** How many times the app has been cold-started (1 on first launch). */
export function getLaunchCount(): number {
    return _launchCount;
}

/** Epoch ms of the previous session's open, or null on the first launch. */
export function getPreviousOpenAt(): number | null {
    return _prevOpenAt;
}

/** Whether markAppOpened() has resolved yet. */
export function isSessionReady(): boolean {
    return _ready;
}
