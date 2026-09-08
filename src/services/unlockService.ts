import { supabase } from "../config/supabase";

/** Asset families a one-time rewarded unlock applies to. */
export type UnlockType = "character" | "costume" | "background";

const TABLE = "user_unlocks";

/**
 * Permanent "watch one rewarded ad, keep it forever" unlocks for free assets,
 * persisted in `public.user_unlocks` and mirroring Yuuki's UnlockService.
 *
 * The rule: switching to a free character/outfit/scene the user has never used
 * costs one rewarded ad. Every switch after that is instant. Charging on every
 * switch — which is what the gate did before — made the quick switcher
 * something to avoid.
 *
 * PRO assets are not handled here; they keep their own paywall. PRO
 * subscribers bypass this entirely, decided by the caller.
 *
 * The server is the only durable store. The in-memory cache is exactly that —
 * a cache — and a restart re-reads it. Nothing is written to the device: an
 * unlock belongs to the account, not to an install.
 *
 * Failure-tolerant throughout, like the rest of the boot path: if Supabase is
 * unreachable the cache stays empty and the app still runs. An unlock earned
 * while a write fails is queued in memory and retried on the next load.
 */

let cache = new Set<string>();
/** Earned but not yet written. In memory only; a restart drops it. */
let pending = new Set<string>();
let loadedForUser: string | null = null;
const listeners = new Set<() => void>();

/**
 * How many assets may be let through in one run because no ad could be served.
 * Yuuki's `nofill_unlocks_per_session`, same default.
 *
 * Without a cap, a user with no ad fill unlocks the entire catalogue; with
 * zero, our own no-fill blocks a feature they did nothing wrong to reach.
 */
const NO_FILL_GRANTS_PER_SESSION = 1;
let noFillGrants = 0;

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

/**
 * Read every unlock row for the signed-in user into the cache. Never throws.
 *
 * Repeats the round-trip only when the signed-in user changes; a failure
 * clears that marker so the next call retries.
 */
export async function loadUnlocks(userId?: string | null): Promise<void> {
    if (!userId) return;
    if (loadedForUser === userId) return;
    loadedForUser = userId;

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select("asset_type, asset_id")
            .eq("user_id", userId);
        if (error) throw error;

        const next = new Set<string>();
        for (const row of data ?? []) next.add(k(row.asset_type as UnlockType, row.asset_id));
        // Anything earned this run but not yet written stays usable.
        for (const key of pending) next.add(key);
        cache = next;
        notify();

        await flushPending(userId);
    } catch {
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
    return cache.has(k(type, id));
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

/** True while a no-fill failure may still be forgiven this run. */
export function canGrantOnNoFill(): boolean {
    return noFillGrants < NO_FILL_GRANTS_PER_SESSION;
}

/**
 * Spend one no-fill pass. Returns false once the run's budget is used up, in
 * which case the caller must block rather than hand the asset over.
 */
export function consumeNoFillGrant(): boolean {
    if (!canGrantOnNoFill()) return false;
    noFillGrants++;
    return true;
}

/** Record a genuinely earned unlock: cache first, then the server. */
export async function markUnlocked(
    type: UnlockType,
    id: string,
    userId?: string | null
): Promise<void> {
    const key = k(type, id);
    if (cache.has(key)) return;

    // Cache first so the UI updates even with no network. The user watched the
    // ad; they have earned it whether or not we can write it down.
    cache.add(key);
    notify();

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
