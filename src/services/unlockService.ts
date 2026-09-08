import * as SecureStore from "expo-secure-store";
import { supabase } from "../config/supabase";

/** Asset families a one-time rewarded unlock applies to. */
export type UnlockType = "character" | "costume" | "background";

const KEY = "ad_unlocks_v1";
const TABLE = "user_unlocks";

/**
 * Permanent "watch one rewarded ad, keep it forever" unlocks for free assets.
 *
 * The rule: switching to a free character/outfit/scene the user has never used
 * costs one rewarded ad. Every switch after that is instant. Charging on every
 * switch — which is what the gate did before — made the quick switcher
 * something to avoid.
 *
 * PRO assets are not handled here; they keep their own paywall. PRO
 * subscribers bypass this entirely, decided by the caller.
 *
 * Storage is two-tier, and deliberately so:
 *
 *  - `user_unlocks` in Supabase is the record of truth, so unlocks follow the
 *    account onto a new device or a reinstall.
 *  - SecureStore mirrors it, because this gate also runs *before* sign-in and
 *    must keep working offline. Anything earned while signed out, or while the
 *    write failed, is replayed to the server on the next successful load.
 *
 * Every server call is failure-tolerant. A user who watched an ad has earned
 * the unlock whether or not we managed to write it down.
 */

let cache: Set<string> | null = null;
/** Earned but not yet written to the server — replayed on the next load. */
let pending = new Set<string>();
let loadedForUser: string | null = null;
const listeners = new Set<() => void>();

const k = (type: UnlockType, id: string) => `${type}|${id}`;
const split = (key: string) => {
    const i = key.indexOf("|");
    return { asset_type: key.slice(0, i), asset_id: key.slice(i + 1) };
};

function notify() {
    listeners.forEach((l) => l());
}

/** Re-render any open picker the moment something unlocks. */
export function subscribeUnlocks(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

async function persistLocal() {
    try {
        await SecureStore.setItemAsync(KEY, JSON.stringify([...(cache ?? [])]));
    } catch {
        /* kept in memory for this session regardless */
    }
}

/**
 * Load the local mirror, then merge the server's rows on top and flush
 * anything that was earned offline.
 *
 * Safe to call repeatedly; the server round-trip only repeats when the signed
 * in user changes.
 */
export async function loadUnlocks(userId?: string | null): Promise<void> {
    if (!cache) {
        try {
            const raw = await SecureStore.getItemAsync(KEY);
            cache = new Set<string>(raw ? JSON.parse(raw) : []);
        } catch {
            cache = new Set<string>();
        }
        notify();
    }

    if (!userId || loadedForUser === userId) return;
    loadedForUser = userId;

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select("asset_type, asset_id")
            .eq("user_id", userId);
        if (error) throw error;

        let added = false;
        for (const row of data ?? []) {
            const key = k(row.asset_type as UnlockType, row.asset_id);
            if (!cache.has(key)) {
                cache.add(key);
                added = true;
            }
        }
        if (added) {
            notify();
            await persistLocal();
        }

        // Push up anything earned while signed out or while a write failed.
        await flushPending(userId);
    } catch {
        // Offline or RLS said no — the local mirror still drives the UI.
        loadedForUser = null;
    }
}

async function flushPending(userId: string) {
    if (pending.size === 0) return;
    const rows = [...pending].map((key) => ({ user_id: userId, ...split(key) }));
    try {
        const { error } = await supabase
            .from(TABLE)
            .upsert(rows, { onConflict: "user_id,asset_type,asset_id", ignoreDuplicates: true });
        if (error) throw error;
        pending = new Set();
    } catch {
        /* retried on the next load */
    }
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

/** Record a genuinely earned unlock, locally first and then on the server. */
export async function markUnlocked(
    type: UnlockType,
    id: string,
    userId?: string | null
): Promise<void> {
    if (!cache) cache = new Set<string>();
    const key = k(type, id);
    if (cache.has(key)) return;

    // Local first: the UI must update even if the network is down.
    cache.add(key);
    notify();
    await persistLocal();

    if (!userId) {
        pending.add(key);
        return;
    }
    try {
        const { error } = await supabase
            .from(TABLE)
            .upsert([{ user_id: userId, asset_type: type, asset_id: id }], {
                onConflict: "user_id,asset_type,asset_id",
                ignoreDuplicates: true,
            });
        if (error) throw error;
    } catch {
        pending.add(key);
    }
}

/**
 * Mark something the app chose for the user, not something they picked. The
 * boot character and default background must never sit behind an ad on a
 * fresh install.
 */
export async function autoUnlock(
    type: UnlockType,
    id: string | null | undefined,
    userId?: string | null
): Promise<void> {
    if (id) await markUnlocked(type, id, userId);
}
