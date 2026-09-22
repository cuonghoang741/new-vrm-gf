import React, { ReactNode, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { AppOpenAd, AdEventType } from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager, RESUME_THRESHOLD_MS } from "../services/AdsManager";
import { markResumed, setResumeAdShower } from "../services/resumeGate";
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
    const loadedAtRef = useRef(0);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    /** When the app last went to background — gates the resume ad. */
    const backgroundedAtRef = useRef<number>(0);

    // Google App Open ads expire ~4h after load; a stale one fails to present,
    // so we discard and reload it instead of showing (matches Yuuki's 4h expiry).
    const APP_OPEN_EXPIRY_MS = 4 * 60 * 60 * 1000;

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
                loadedAtRef.current = Date.now();
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

        /** Resolves once the ad has closed, or immediately if none can show. */
        const showIfPossible = (): Promise<void> => new Promise<void>((resolve) => {
            if (isProRef.current) return resolve();
            if (AdsManager.isFullscreenAdShowing) return resolve();

            const ad = adRef.current;
            if (!ad || !loadedRef.current) {
                load(); // not ready — preload for next time
                return resolve();
            }
            // Expired (loaded > 4h ago) → discard and reload, don't show a stale ad.
            if (Date.now() - loadedAtRef.current > APP_OPEN_EXPIRY_MS) {
                load();
                return resolve();
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
                resolve();
            };
            const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
            const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);

            AdsManager.setFullscreenAdShowing(true);
            AdsManager.registerFullScreenShown(); // full-screen gap applies cross-type
            AdsManager.showOpaqueOverlay();
            try {
                ad.show();
            } catch {
                finish();
            }
        });

        const init = async () => {
            await AdsManager.init();
            if (!mounted) return;
            load();
        };
        init();
        setResumeAdShower(showIfPossible);

        const sub = AppState.addEventListener("change", (next) => {
            const prev = appStateRef.current;
            appStateRef.current = next;

            if (prev === "active" && next.match(/inactive|background/)) {
                backgroundedAtRef.current = Date.now();
                return;
            }

            const cameToForeground =
                prev.match(/inactive|background/) && next === "active";
            if (!cameToForeground) return;

            // Only a real absence earns an ad. A two-second app switch, or
            // returning from a permission / billing dialog, does not.
            const away = Date.now() - backgroundedAtRef.current;
            if (away < RESUME_THRESHOLD_MS) return;

            // PRO sees no ad, so the screen would be a tap that costs them
            // something and gives nothing — its own ad card renders empty for
            // them. Send them straight back in.
            if (isProRef.current) return;
            // Coming back from an IAP sheet, a browser or a permission dialog
            // is not "returning to the app"; the suppression flag marks those,
            // and interrupting them there is exactly what it exists to stop.
            if (AdsManager.consumeResumeSuppression()) return;

            // No ad here. Raise the flag and let the navigator put the
            // welcome-back screen up; its CTA is what plays the ad. Firing one
            // the instant someone returns is the interruption people quit over.
            markResumed();
        });

        return () => {
            mounted = false;
            setResumeAdShower(null);
            sub.remove();
        };
    }, []);

    return <>{children}</>;
}
