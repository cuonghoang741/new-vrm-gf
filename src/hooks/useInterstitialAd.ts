import { useCallback, useEffect, useRef } from "react";
import {
    InterstitialAd,
    AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager } from "../services/AdsManager";
import { useSubscription } from "../contexts/SubscriptionContext";

/** Minimum gap between two interstitials (anti-spam, policy rule 7/8). */
const MIN_INTERVAL_MS = 4 * 60 * 1000;
/** How long the "loading ad…" screen shows before the ad appears (rule 1/3). */
const LOADING_SCREEN_MS = 700;

// Shared across all hook instances so the frequency cap is global.
let lastShownAt = 0;

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

    const load = useCallback(() => {
        const ad = InterstitialAd.createForAdRequest(AdUnits.interstitial, {
            requestNonPersonalizedAdsOnly: false,
        });
        adRef.current = ad;
        loadedRef.current = false;

        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
            loadedRef.current = true;
        });
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
            loadedRef.current = false;
        });
        ad.load();

        return () => {
            unsubLoaded();
            unsubError();
        };
    }, []);

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

            if (isPro) return done();
            if (AdsManager.isFullscreenAdShowing) return done();
            if (Date.now() - lastShownAt < MIN_INTERVAL_MS) return done();

            const ad = adRef.current;
            if (!ad || !loadedRef.current) {
                // Not ready — don't block the user.
                done();
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
            });
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
                unsubOpened();
                unsubClosed();
                unsubError();
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
