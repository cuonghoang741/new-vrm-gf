/**
 * "The user just came back after a real absence."
 *
 * Returning from the background used to fire an App Open ad straight into the
 * user's face before they had touched anything. That is the moment they are
 * least willing to be interrupted, and an ad nobody asked for is the one people
 * quit over. So the resume now raises this flag instead: the navigator shows
 * the welcome-back screen, and the ad only plays once they press its CTA — an
 * ad they chose to walk through, at a break they chose to take.
 *
 * Deliberately a module-level store rather than context: `AdsProvider` sets it
 * from an `AppState` listener that lives outside React's tree, and the
 * navigator reads it on the next render.
 */

let pending = false;
/** Set while the welcome-back screen owes the user an ad on its CTA. */
let adOwed = false;
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach((fn) => fn());
}

export function subscribeResume(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Called on a genuine background → foreground return past the threshold. */
export function markResumed(): void {
    if (pending) return;
    pending = true;
    adOwed = true;
    emit();
}

export function isResumePending(): boolean {
    return pending;
}

/** The welcome-back screen is done; go back to the app. */
export function clearResume(): void {
    if (!pending) return;
    pending = false;
    emit();
}

/**
 * True once per resume, for the CTA that should play the ad. Clearing it here
 * means a second tap (or a re-render) never shows two ads.
 */
export function consumeResumeAd(): boolean {
    if (!adOwed) return false;
    adOwed = false;
    return true;
}

/**
 * The App Open ad instance lives in `AdsProvider`, which owns its preloading
 * and expiry. It registers the presenter here so the welcome-back CTA can play
 * it without the two components knowing about each other.
 */
let shower: (() => Promise<void>) | null = null;

export function setResumeAdShower(fn: (() => Promise<void>) | null): void {
    shower = fn;
}

/** Plays the resume ad if one is owed. Resolves when it closes, or at once. */
export async function playResumeAd(): Promise<void> {
    if (!consumeResumeAd() || !shower) return;
    try {
        await shower();
    } catch {
        // A failed ad must never block the way back into the app.
    }
}
