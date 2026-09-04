import { Platform } from "react-native";
import mobileAds, {
    MaxAdContentRating,
} from "react-native-google-mobile-ads";
import {
    getTrackingPermissionsAsync,
    requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import * as SecureStore from "expo-secure-store";

/**
 * Frequency caps / timeouts — same numbers as girlx's AdCaps defaults, so the
 * two apps behave identically for a reviewer comparing them.
 */
const COLD_START_GRACE_MS = 20_000; // no interstitial in the first 20s after launch
const MIN_FULLSCREEN_GAP_MS = 30_000; // min gap between ANY two full-screen ads
const MAX_INTERSTITIALS_PER_SESSION = 5;
const MAX_INTERSTITIALS_PER_DAY = 15;
/**
 * The app must have been backgrounded at least this long before coming back
 * counts as a "resume" worth an App Open ad. Without it, a two-second app
 * switch — or returning from a permission dialog — earns a full-screen ad.
 */
export const RESUME_THRESHOLD_MS = 45_000;
/** Load-failure backoff: attempt N waits retryBaseDelay * N (matches Yuuki). */
export const AD_RETRY_BASE_DELAY_MS = 5_000;
export const AD_MAX_LOAD_RETRIES = 3;

const K_DAY_COUNT = "ads_day_interstitials";
const K_DAY_STAMP = "ads_day_stamp";

function todayStamp(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

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

    // ----- Frequency caps (interstitial) -----------------------------------
    private startedAt = Date.now();
    private lastFullscreenAt = 0;
    private sessionInterstitials = 0;
    private dayInterstitials = 0;
    private dayStamp = todayStamp();

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
                await this.loadDayCount();
                this.startedAt = Date.now();
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

    // ----- Frequency caps ---------------------------------------------------
    private async loadDayCount() {
        try {
            const stamp = await SecureStore.getItemAsync(K_DAY_STAMP);
            const today = todayStamp();
            if (stamp === today) {
                const n = Number(await SecureStore.getItemAsync(K_DAY_COUNT));
                this.dayInterstitials = Number.isFinite(n) ? n : 0;
                this.dayStamp = today;
            } else {
                this.dayInterstitials = 0;
                this.dayStamp = today;
                await SecureStore.setItemAsync(K_DAY_STAMP, today);
                await SecureStore.setItemAsync(K_DAY_COUNT, "0");
            }
        } catch {
            this.dayInterstitials = 0;
        }
    }

    /** All the guards for an auto (non-user-initiated) interstitial. */
    canShowInterstitial(): boolean {
        if (this.fullscreenAdShowing) return false;
        // Cold-start grace: nothing in the first 20s after launch.
        if (Date.now() - this.startedAt < COLD_START_GRACE_MS) return false;
        // Min gap after ANY full-screen ad (interstitial / rewarded / app-open).
        if (Date.now() - this.lastFullscreenAt < MIN_FULLSCREEN_GAP_MS) return false;
        if (this.sessionInterstitials >= MAX_INTERSTITIALS_PER_SESSION) return false;
        if (this.dayInterstitials >= MAX_INTERSTITIALS_PER_DAY) return false;
        return true;
    }

    /** Call when an interstitial actually showed. */
    registerInterstitialShown() {
        this.sessionInterstitials++;
        this.lastFullscreenAt = Date.now();
        // Roll the day if needed, then bump + persist.
        const today = todayStamp();
        if (today !== this.dayStamp) {
            this.dayStamp = today;
            this.dayInterstitials = 0;
        }
        this.dayInterstitials++;
        SecureStore.setItemAsync(K_DAY_STAMP, this.dayStamp).catch(() => {});
        SecureStore.setItemAsync(K_DAY_COUNT, String(this.dayInterstitials)).catch(() => {});
    }

    /** Call when a rewarded / app-open ad showed, so the full-screen gap applies. */
    registerFullScreenShown() {
        this.lastFullscreenAt = Date.now();
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
