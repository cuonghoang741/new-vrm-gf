import { useCallback, useEffect, useRef } from "react";
import {
    InterstitialAd,
    AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import {
    AdsManager,
    AD_RETRY_BASE_DELAY_MS,
    AD_MAX_LOAD_RETRIES,
} from "../services/AdsManager";
import { useSubscription } from "../contexts/SubscriptionContext";
import { analyticsService } from "../services/AnalyticsService";

/** Minimum gap between two interstitials (anti-spam, policy rule 7/8). */
const MIN_INTERVAL_MS = 4 * 60 * 1000;
/** How long the "loading ad…" screen shows before the ad appears (rule 1/3). */
const LOADING_SCREEN_MS = 700;

// Shared across all hook instances so the frequency cap is global.
let lastShownAt = 0;

/** Only one interstitial spot today (after a call ends); named for analytics. */
const PLACEMENT = "after_call";

/**
 * Interstitial shown only on a user-action screen transition (here: after a
 * call ends). Always preloaded; if not ready it is skipped and the caller's
 * onDone() runs immediately so the user never waits (rule 15). After the ad
 * closes onDone() always runs (rule 16 — proceed, never flash back).
 */
export function useInterstitialAd() {
    const { isPro } = useSubscription();
    const adRef = useRef<InterstitialAd | null>(null);
    const loadedRef = useRef(false);
    const retriesRef = useRef(0);
    const loadRef = useRef<() => void>(() => {});

    const load = useCallback(() => {
        const ad = InterstitialAd.createForAdRequest(AdUnits.interstitial, {
            requestNonPersonalizedAdsOnly: false,
        });
        adRef.current = ad;
        loadedRef.current = false;

        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
            loadedRef.current = true;
            retriesRef.current = 0;
            analyticsService.logAdLoaded("interstitial", PLACEMENT);
        });
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
            loadedRef.current = false;
            analyticsService.logAdLoadFailed(
                "interstitial",
                PLACEMENT,
                error?.code ?? error?.message
            );
            // Backoff retry: attempt N waits base*N (matches Yuuki).
            if (retriesRef.current < AD_MAX_LOAD_RETRIES) {
                retriesRef.current += 1;
                setTimeout(() => loadRef.current(), AD_RETRY_BASE_DELAY_MS * retriesRef.current);
            }
        });
        ad.load();

        return () => {
            unsubLoaded();
            unsubError();
        };
    }, []);
    loadRef.current = load;

    useEffect(() => {
        if (isPro) return; // PRO never sees ads
        const cleanup = load();
        return cleanup;
    }, [isPro, load]);

    /**
     * Show the interstitial then run onDone. Falls through to onDone immediately
     * when the ad can't/shouldn't show (PRO, capped, not loaded, another
     * fullscreen ad on screen).
     */
    const showInterstitial = useCallback(
        async (onDone?: () => void) => {
            const done = () => onDone?.();

            const skip = (reason: string) => {
                analyticsService.logAdSkipped("interstitial", PLACEMENT, reason);
                return done();
            };

            if (isPro) return skip("pro");
            if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return skip("too_soon");
            // Cold-start grace + full-screen gap + session/day caps + no-overlap.
            if (!AdsManager.canShowInterstitial()) return skip("capped");

            const ad = adRef.current;
            if (!ad || !loadedRef.current) {
                // Not ready — don't block the user.
                skip("not_loaded");
                return;
            }

            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                AdsManager.setFullscreenAdShowing(false);
                AdsManager.hideLoadingOverlay();
                lastShownAt = Date.now();
                done();
                load(); // preload next
            };

            const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
                AdsManager.hideLoadingOverlay();
                analyticsService.logAdImpression("interstitial", PLACEMENT);
            });
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
                unsubOpened();
                unsubClosed();
                unsubError();
                analyticsService.logAdDismissed("interstitial", PLACEMENT);
                finish();
            });
            const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
                unsubOpened();
                unsubClosed();
                unsubError();
                finish();
            });

            // Show the brief loading screen, then present the ad (rule 1/3).
            AdsManager.setFullscreenAdShowing(true);
            AdsManager.registerInterstitialShown(); // bump session/day caps + gap
            AdsManager.showLoadingOverlay();
            setTimeout(() => {
                try {
                    ad.show();
                } catch {
                    finish();
                }
            }, LOADING_SCREEN_MS);
        },
        [isPro, load]
    );

    return { showInterstitial };
}
