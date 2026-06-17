import { useCallback, useEffect, useRef } from "react";
import {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager } from "../services/AdsManager";

/** Max time to wait for a rewarded ad to load after the user opts in. */
const LOAD_TIMEOUT_MS = 8000;

/**
 * Rewarded ad. The user explicitly opts in (must be triggered from a clearly
 * labelled "Watch an ad" control — policy rule 50/56). `show()` resolves
 * `true` only if the user actually earned the reward (rule 57).
 *
 * Always preloads; if not ready when the user taps, a short loading screen is
 * shown while it loads (the user chose to wait), capped by LOAD_TIMEOUT_MS.
 */
export function useRewardedAd(adUnitId: string = AdUnits.rewarded) {
    const adRef = useRef<RewardedAd | null>(null);
    const loadedRef = useRef(false);

    const buildAndLoad = useCallback(() => {
        const ad = RewardedAd.createForAdRequest(adUnitId, {
            requestNonPersonalizedAdsOnly: false,
        });
        adRef.current = ad;
        loadedRef.current = false;

        const unsubLoaded = ad.addAdEventListener(
            RewardedAdEventType.LOADED,
            () => {
                loadedRef.current = true;
            }
        );
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
            loadedRef.current = false;
        });
        ad.load();

        return () => {
            unsubLoaded();
            unsubError();
        };
    }, [adUnitId]);

    useEffect(() => {
        const cleanup = buildAndLoad();
        return cleanup;
    }, [buildAndLoad]);

    const present = useCallback(
        (ad: RewardedAd, resolve: (earned: boolean) => void) => {
            let earned = false;
            let settled = false;

            const cleanup = () => {
                unsubEarned();
                unsubClosed();
                unsubError();
            };
            const settle = (value: boolean) => {
                if (settled) return;
                settled = true;
                cleanup();
                AdsManager.setFullscreenAdShowing(false);
                AdsManager.hideLoadingOverlay();
                buildAndLoad(); // preload next
                resolve(value);
            };

            const unsubEarned = ad.addAdEventListener(
                RewardedAdEventType.EARNED_REWARD,
                () => {
                    earned = true;
                }
            );
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () =>
                settle(earned)
            );
            const unsubError = ad.addAdEventListener(AdEventType.ERROR, () =>
                settle(false)
            );

            AdsManager.setFullscreenAdShowing(true);
            AdsManager.hideLoadingOverlay();
            try {
                ad.show();
            } catch {
                settle(false);
            }
        },
        [buildAndLoad]
    );

    /** Show the rewarded ad. Resolves true only if the reward was earned. */
    const show = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            // Never stack two fullscreen ads.
            if (AdsManager.isFullscreenAdShowing) return resolve(false);

            const ad = adRef.current;
            if (ad && loadedRef.current) {
                present(ad, resolve);
                return;
            }

            // Not ready yet — wait briefly while it loads (user opted in).
            const pending = adRef.current ?? null;
            if (!pending) {
                buildAndLoad();
            }
            const waitAd = adRef.current;
            if (!waitAd) return resolve(false);

            AdsManager.showLoadingOverlay();
            let done = false;
            const finish = (cb: () => void) => {
                if (done) return;
                done = true;
                unsubL();
                unsubE();
                clearTimeout(timer);
                cb();
            };

            const unsubL = waitAd.addAdEventListener(
                RewardedAdEventType.LOADED,
                () => finish(() => present(waitAd, resolve))
            );
            const unsubE = waitAd.addAdEventListener(AdEventType.ERROR, () =>
                finish(() => {
                    AdsManager.hideLoadingOverlay();
                    resolve(false);
                })
            );
            const timer = setTimeout(
                () =>
                    finish(() => {
                        AdsManager.hideLoadingOverlay();
                        resolve(false);
                    }),
                LOAD_TIMEOUT_MS
            );
        });
    }, [present, buildAndLoad]);

    return { show };
}
