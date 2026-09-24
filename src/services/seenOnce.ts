import * as SecureStore from "expo-secure-store";

/**
 * "Has this person ever pressed that?" — one bit per control, kept on device.
 *
 * Used for the discovery dot on the character button: the dot is not a
 * notification, it is an introduction, so it has to disappear the first time
 * the button is used and never come back. That state belongs to the device,
 * not the account: someone who already knows where the button is does not need
 * telling again on the same phone, and it is not worth a round trip.
 *
 * Reads are cached in memory, so a control can ask on every render.
 */
const cache = new Map<string, boolean>();

const key = (id: string) => `seen_once_${id}`;

/** Resolves true once the control has been used at least once. */
export async function hasSeen(id: string): Promise<boolean> {
    const known = cache.get(id);
    if (known !== undefined) return known;
    try {
        const v = (await SecureStore.getItemAsync(key(id))) === "1";
        cache.set(id, v);
        return v;
    } catch {
        // No store, no dot: better to hide an introduction than to show one
        // forever to someone who has already dismissed it.
        cache.set(id, true);
        return true;
    }
}

/** Synchronous read of what `hasSeen` has already resolved. */
export function seenNow(id: string): boolean | undefined {
    return cache.get(id);
}

export async function markSeen(id: string): Promise<void> {
    if (cache.get(id) === true) return;
    cache.set(id, true);
    try {
        await SecureStore.setItemAsync(key(id), "1");
    } catch {
        // The dot is gone for this session either way.
    }
}
