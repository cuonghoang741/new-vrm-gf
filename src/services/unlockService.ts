import * as SecureStore from "expo-secure-store";

/** Asset families a one-time rewarded unlock applies to. */
export type UnlockType = "character" | "costume" | "background";

const KEY = "ad_unlocks_v1";

/**
 * Permanent "watch one rewarded ad, keep it forever" unlocks for free assets.
 *
 * The rule this encodes: switching to a free character/outfit/scene the user
 * has never used costs one rewarded ad. Every switch after that is instant.
 * Charging an ad on every switch — which is what the gate did before — made
 * the quick switcher unusable and taught people to avoid it.
 *
 * PRO assets are not handled here; they keep their own paywall. PRO
 * subscribers bypass this entirely, checked by the caller.
 *
 * State is local, in SecureStore. Yuuki persists the same thing in a
 * `user_unlocks` table so it follows the account across devices; doing that
 * here needs a schema change, and this gate also has to work before sign-in,
 * so local is the honest starting point. The tradeoff is real: a reinstall
 * resets what the user has unlocked.
 */

let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

const k = (type: UnlockType, id: string) => `${type}|${id}`;

function notify() {
    listeners.forEach((l) => l());
}

/** Re-render any open picker the moment something unlocks. */
export function subscribeUnlocks(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Read the stored set once. Safe to call repeatedly. */
export async function loadUnlocks(): Promise<void> {
    if (cache) return;
    try {
        const raw = await SecureStore.getItemAsync(KEY);
        cache = new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
        // A failed read must not block the app: start empty and let the user
        // unlock again rather than hard-failing the picker.
        cache = new Set<string>();
    }
    notify();
}

export function isUnlocked(type: UnlockType, id: string): boolean {
    return cache?.has(k(type, id)) ?? false;
}

/**
 * Does picking this cost an ad right now?
 *
 * `isPro` is passed in rather than read here so a mid-session upgrade takes
 * effect on the caller's next render without this module knowing about
 * subscriptions.
 */
export function requiresAd(
    type: UnlockType,
    id: string | null | undefined,
    isPro: boolean
): boolean {
    if (isPro || !id) return false;
    return !isUnlocked(type, id);
}

/** Record a genuinely earned unlock. */
export async function markUnlocked(type: UnlockType, id: string): Promise<void> {
    if (!cache) cache = new Set<string>();
    if (cache.has(k(type, id))) return;
    cache.add(k(type, id));
    notify();
    try {
        await SecureStore.setItemAsync(KEY, JSON.stringify([...cache]));
    } catch {
        // Kept for the session even if the write failed — the user watched the
        // ad, so they have earned it regardless of whether we could persist it.
    }
}

/**
 * Mark something the app chose for the user, not something they picked. The
 * boot character and default background must never sit behind an ad on a
 * fresh install.
 */
export async function autoUnlock(type: UnlockType, id: string | null | undefined): Promise<void> {
    if (id) await markUnlocked(type, id);
}
