import { useCallback, useEffect, useRef } from "react";
import {
    RewardedAd,
    RewardedAdEventType,
    AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager } from "../services/AdsManager";
import { analyticsService } from "../services/AnalyticsService";

/** Outcome of a gated rewarded show — see [useRewardedAd.showForGate]. */
export type RewardedOutcome = "earned" | "dismissed" | "unavailable";

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
export function useRewardedAd(
    adUnitId: string = AdUnits.rewarded,
    /** Where in the app the user opted in — shows up on every ad event. */
    placement: string = "unknown"
) {
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
                analyticsService.logAdLoaded("rewarded", placement);
            }
        );
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
            loadedRef.current = false;
            analyticsService.logAdLoadFailed(
                "rewarded",
                placement,
                error?.code ?? error?.message
            );
        });
        ad.load();

        return () => {
            unsubLoaded();
            unsubError();
        };
    }, [adUnitId, placement]);

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
                (reward: any) => {
                    earned = true;
                    analyticsService.logAdRewardEarned(
                        placement,
                        reward?.type,
                        reward?.amount
                    );
                }
            );
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
                analyticsService.logAdDismissed("rewarded", placement);
                settle(earned);
            });
            const unsubError = ad.addAdEventListener(AdEventType.ERROR, () =>
                settle(false)
            );

            AdsManager.setFullscreenAdShowing(true);
            AdsManager.registerFullScreenShown(); // full-screen gap applies cross-type
            AdsManager.hideLoadingOverlay();
            analyticsService.logAdImpression("rewarded", placement);
            try {
                ad.show();
            } catch {
                settle(false);
            }
        },
        [buildAndLoad, placement]
    );

    /**
     * Same as [show] but says *why* it failed, which a feature gate needs:
     * "unavailable" means we could not put an ad in front of the user (no fill,
     * SDK down, another full-screen ad up), so the gate should let them through
     * rather than block a feature on our own inability to serve. "dismissed"
     * means the user saw it and backed out — that one blocks.
     */
    const showForGate = useCallback((): Promise<RewardedOutcome> => {
        return new Promise((resolve) => {
            if (AdsManager.isFullscreenAdShowing) {
                analyticsService.logAdSkipped("rewarded", placement, "overlap");
                return resolve("unavailable");
            }
            if (!adRef.current) buildAndLoad();
            const ad = adRef.current;
            if (!ad) {
                analyticsService.logAdSkipped("rewarded", placement, "not_loaded");
                return resolve("unavailable");
            }

            const run = () => present(ad, (earned) => resolve(earned ? "earned" : "dismissed"));
            if (loadedRef.current) return run();

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
            const unsubL = ad.addAdEventListener(RewardedAdEventType.LOADED, () =>
                finish(run)
            );
            const unsubE = ad.addAdEventListener(AdEventType.ERROR, () =>
                finish(() => {
                    AdsManager.hideLoadingOverlay();
                    analyticsService.logAdSkipped("rewarded", placement, "load_error");
                    resolve("unavailable");
                })
            );
            const timer = setTimeout(
                () =>
                    finish(() => {
                        AdsManager.hideLoadingOverlay();
                        analyticsService.logAdSkipped("rewarded", placement, "load_timeout");
                        resolve("unavailable");
                    }),
                LOAD_TIMEOUT_MS
            );
        });
    }, [present, buildAndLoad, placement]);

    /** Show the rewarded ad. Resolves true only if the reward was earned. */
    const show = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            // Never stack two fullscreen ads.
            if (AdsManager.isFullscreenAdShowing) {
                analyticsService.logAdSkipped("rewarded", placement, "overlap");
                return resolve(false);
            }

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
            if (!waitAd) {
                analyticsService.logAdSkipped("rewarded", placement, "not_loaded");
                return resolve(false);
            }

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
                    analyticsService.logAdSkipped("rewarded", placement, "load_error");
                    resolve(false);
                })
            );
            const timer = setTimeout(
                () =>
                    finish(() => {
                        AdsManager.hideLoadingOverlay();
                        analyticsService.logAdSkipped("rewarded", placement, "load_timeout");
                        resolve(false);
                    }),
                LOAD_TIMEOUT_MS
            );
        });
    }, [present, buildAndLoad, placement]);

    return { show, showForGate };
}
