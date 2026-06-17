import { Platform } from "react-native";
import mobileAds, {
    MaxAdContentRating,
} from "react-native-google-mobile-ads";
import {
    getTrackingPermissionsAsync,
    requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";

/**
 * Central coordinator for all AdMob ads. Implements the policy-required
 * safeguards that span multiple ad units:
 *
 *  - Single init of the Mobile Ads SDK (+ iOS ATT request).
 *  - Global "fullscreen ad showing" lock so we never show two fullscreen ads
 *    back-to-back (interstitial / rewarded / app-open never overlap).
 *  - "Suppress next resume ad" window: callers about to leave the app for a
 *    non-content surface (IAP, external browser, sign-in, permission dialog…)
 *    suppress the App Open ad that would otherwise fire on return.
 *  - A tiny overlay state (loading screen before interstitial, opaque screen
 *    behind app-open) consumed by <AdOverlay/> rendered at the app root.
 */

type OverlayState = {
    /** Show a "loading ad…" screen (before an interstitial appears). */
    loading: boolean;
    /** Show an opaque screen (behind the app-open ad so app data isn't visible). */
    opaque: boolean;
};

type Listener = (state: OverlayState) => void;

class AdsManagerClass {
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    /** True while ANY fullscreen ad (interstitial/rewarded/app-open) is on screen. */
    private fullscreenAdShowing = false;

    /** Resume/App-open ad is suppressed until this timestamp (ms). */
    private suppressResumeUntil = 0;

    private overlay: OverlayState = { loading: false, opaque: false };
    private listeners = new Set<Listener>();

    // ----- Init -------------------------------------------------------------
    init(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            try {
                // iOS App Tracking Transparency — ask before init for personalized ads.
                if (Platform.OS === "ios") {
                    const { status } = await getTrackingPermissionsAsync();
                    if (status === "undetermined") {
                        await requestTrackingPermissionsAsync();
                    }
                }

                await mobileAds().setRequestConfiguration({
                    maxAdContentRating: MaxAdContentRating.PG,
                    tagForChildDirectedTreatment: false,
                    tagForUnderAgeOfConsent: false,
                });

                await mobileAds().initialize();
                this.initialized = true;
            } catch (e) {
                console.warn("[AdsManager] init error:", e);
            }
        })();
        return this.initPromise;
    }

    get isInitialized() {
        return this.initialized;
    }

    // ----- Fullscreen lock --------------------------------------------------
    get isFullscreenAdShowing() {
        return this.fullscreenAdShowing;
    }

    setFullscreenAdShowing(value: boolean) {
        this.fullscreenAdShowing = value;
    }

    // ----- App Open / resume suppression ------------------------------------
    /**
     * Call right before leaving the app for a non-content surface (IAP popup,
     * external browser, OAuth sign-in, permission dialog…). The App Open ad
     * that would normally fire when the user returns is skipped.
     */
    suppressNextResumeAd(durationMs = 60_000) {
        this.suppressResumeUntil = Date.now() + durationMs;
    }

    /** Returns true (and clears the flag) if the next resume ad must be skipped. */
    consumeResumeSuppression(): boolean {
        if (Date.now() < this.suppressResumeUntil) {
            this.suppressResumeUntil = 0;
            return true;
        }
        return false;
    }

    // ----- Overlay state (for <AdOverlay/>) ---------------------------------
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.overlay);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getOverlay(): OverlayState {
        return this.overlay;
    }

    private setOverlay(patch: Partial<OverlayState>) {
        this.overlay = { ...this.overlay, ...patch };
        this.listeners.forEach((l) => l(this.overlay));
    }

    showLoadingOverlay() {
        this.setOverlay({ loading: true });
    }

    hideLoadingOverlay() {
        this.setOverlay({ loading: false });
    }

    showOpaqueOverlay() {
        this.setOverlay({ opaque: true });
    }

    hideOpaqueOverlay() {
        this.setOverlay({ opaque: false });
    }
}

export const AdsManager = new AdsManagerClass();
