import { NativeAd } from "react-native-google-mobile-ads";

/**
 * A tiny cache of already-loaded native ads, keyed by ad unit.
 *
 * Exists for handovers where the ad has to be on screen the instant something
 * happens — the language screen swaps its second unit in the moment the user
 * taps a language, and requesting only then means a skeleton sits there for a
 * second or two first.
 *
 * A native ad is single-use: [takePreloadedNative] removes what it returns, and
 * the caller owns destroying it.
 */

type Entry = { ad: NativeAd; loadedAt: number };

const cache = new Map<string, Entry>();
const inFlight = new Set<string>();

/**
 * Google expires a native ad about an hour after load. Treat anything older as
 * stale rather than handing back an ad that will refuse to render.
 */
const TTL_MS = 50 * 60 * 1000;

/**
 * Request an ad for `adUnitId` and hold it until someone takes it.
 *
 * Safe to call repeatedly: a unit already cached or already loading is left
 * alone. Failures are swallowed — a preload is an optimisation, and the
 * consumer falls back to requesting one itself.
 */
export function preloadNative(adUnitId: string): void {
    if (!adUnitId) return;
    if (inFlight.has(adUnitId)) return;

    const existing = cache.get(adUnitId);
    if (existing && Date.now() - existing.loadedAt < TTL_MS) return;

    inFlight.add(adUnitId);
    NativeAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: false })
        .then((ad) => {
            inFlight.delete(adUnitId);
            // A newer ad may have been cached while this was in flight.
            const current = cache.get(adUnitId);
            if (current) {
                ad.destroy();
                return;
            }
            cache.set(adUnitId, { ad, loadedAt: Date.now() });
        })
        .catch(() => {
            inFlight.delete(adUnitId);
        });
}

/** Take the cached ad for a unit, or null. The caller then owns it. */
export function takePreloadedNative(adUnitId: string): NativeAd | null {
    const entry = cache.get(adUnitId);
    if (!entry) return null;
    cache.delete(adUnitId);

    if (Date.now() - entry.loadedAt >= TTL_MS) {
        entry.ad.destroy();
        return null;
    }
    return entry.ad;
}

/** Drop everything held — for a PRO upgrade, where no ad should remain. */
export function clearPreloadedNatives(): void {
    for (const { ad } of cache.values()) ad.destroy();
    cache.clear();
}
