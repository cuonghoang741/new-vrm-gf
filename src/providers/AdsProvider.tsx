import React, { ReactNode, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { AppOpenAd, AdEventType } from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager } from "../services/AdsManager";
import { useSubscription } from "../contexts/SubscriptionContext";

/**
 * Initializes the Mobile Ads SDK and manages the App Open (resume) ad.
 *
 * Policy safeguards:
 *  - Never shown to PRO users.
 *  - Skipped on the first activation (cold start already shows the splash).
 *  - Skipped when suppressed by a prior `suppressNextResumeAd()` (IAP, external
 *    browser, OAuth, permission dialog…) — rule 18/19.
 *  - Never overlaps another fullscreen ad.
 *  - An opaque screen is shown behind the ad so app data isn't visible (rule 17).
 */
export function AdsProvider({ children }: { children: ReactNode }) {
    const { isPro } = useSubscription();
    const isProRef = useRef(isPro);
    isProRef.current = isPro;

    const adRef = useRef<AppOpenAd | null>(null);
    const loadedRef = useRef(false);
    const firstActivationRef = useRef(true);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        let mounted = true;

        const load = () => {
            const ad = AppOpenAd.createForAdRequest(AdUnits.appOpen, {
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
        };

        const showIfPossible = () => {
            if (isProRef.current) return;
            if (AdsManager.isFullscreenAdShowing) return;
            // Skip if a prior action (IAP / browser / permission) suppressed it.
            if (AdsManager.consumeResumeSuppression()) return;

            const ad = adRef.current;
            if (!ad || !loadedRef.current) {
                load(); // not ready — preload for next time
                return;
            }

            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                unsubClosed();
                unsubError();
                AdsManager.setFullscreenAdShowing(false);
                AdsManager.hideOpaqueOverlay();
                load(); // preload next
            };
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
            const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);

            AdsManager.setFullscreenAdShowing(true);
            AdsManager.showOpaqueOverlay();
            try {
                ad.show();
            } catch {
                finish();
            }
        };

        const init = async () => {
            await AdsManager.init();
            if (!mounted) return;
            load();
        };
        init();

        const sub = AppState.addEventListener("change", (next) => {
            const prev = appStateRef.current;
            appStateRef.current = next;

            const cameToForeground =
                prev.match(/inactive|background/) && next === "active";
            if (!cameToForeground) return;

            if (firstActivationRef.current) {
                firstActivationRef.current = false;
                return; // don't show on the very first activation
            }
            showIfPossible();
        });

        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);

    return <>{children}</>;
}
