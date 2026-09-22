import {
    AppOpenAd,
    InterstitialAd,
    AdEventType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../config/ads";
import { AdsManager } from "./AdsManager";
import { analyticsService } from "./AnalyticsService";

/**
 * The cold-start splash ad: `open_splash` (App Open) with `inter_splash`
 * (interstitial) as the fallback.
 *
 * Both units are in the scenario, but only ONE ad is ever shown per launch —
 * two full-screen ads before the user has seen a single screen is a policy
 * finding, not a second impression. App Open is preferred because it is the
 * format Google designed for exactly this moment; the interstitial only runs
 * when App Open has nothing to serve.
 *
 * The resume ad in AdsProvider deliberately does NOT cover cold start (a cold
 * start emits no background→foreground transition), so the two never collide.
 *
 * Everything here is time-boxed. An ad that has not loaded within
 * [LOAD_TIMEOUT_MS] is abandoned rather than held on to — a splash that waits
 * on a network round-trip is a launch the user reads as a crash.
 */

/** How long to wait for EACH format to load before giving up on it. */
const LOAD_TIMEOUT_MS = 2500;

export type SplashAdResult = "app_open" | "interstitial" | "none";

/** Cold start happens once per process; a second call is a no-op. */
let alreadyRan = false;

/**
 * Set once the boot screen has given up waiting for us.
 *
 * Without this the ad still arrives — just late, on top of whatever screen the
 * app moved on to. That is exactly what happened on a fresh install: the first
 * launch shows the ATT prompt, `AdsManager.init()` awaits the user's answer,
 * and by the time they tap Allow the splash is long gone. An App Open ad
 * landing over the language picker is a policy finding, not a late impression.
 */
let abandoned = false;

/** Called by the boot screen when it stops waiting. Nothing is shown after. */
export function abandonSplashAd() {
    abandoned = true;
}

/** Reset hook for tests — the module-level latches above are process-wide. */
export function __resetSplashAdForTests() {
    alreadyRan = false;
    abandoned = false;
}

/**
 * Show the splash ad, if any. Resolves when the ad is closed, or immediately
 * when none can be served. Never rejects: the caller is the boot path.
 *
 * @param isPro PRO users never see it (checked by the caller, which owns the
 *              subscription state, so this stays free of React).
 */
export async function showSplashAd(
    isPro: boolean,
    /**
     * Called the instant an ad is actually on screen. The boot screen uses it
     * to drop its watchdog: the deadline exists to stop a *wait* from wedging
     * the launch, and once the user is looking at an ad they are not stuck.
     */
    onPresent?: () => void
): Promise<SplashAdResult> {
    if (alreadyRan) return "none";
    alreadyRan = true;
    if (isPro) return "none";

    try {
        await AdsManager.init();
        if (abandoned) return "none";
        if (AdsManager.isFullscreenAdShowing) return "none";

        const appOpen = await loadAppOpen();
        if (abandoned) return "none";
        if (appOpen.ad) {
            onPresent?.();
            await present(appOpen.ad, "app_open", "open_splash");
            return "app_open";
        }
        // A timeout means the network, not the fill, is the problem — trying a
        // second format would just spend the budget twice and leave the user
        // staring at the boot screen for 5s. Only a fast, definite "no ad"
        // earns the fallback.
        if (appOpen.reason === "timeout") return "none";

        const interstitial = await loadInterstitial();
        if (abandoned) return "none";
        if (interstitial.ad) {
            onPresent?.();
            await present(interstitial.ad, "interstitial", "inter_splash");
            // Keep the session/day interstitial caps honest — this one counts.
            AdsManager.registerInterstitialShown();
            return "interstitial";
        }
    } catch {
        /* boot path: an ad failure must never block the app */
    }
    return "none";
}

type Loadable = AppOpenAd | InterstitialAd;

/** Why a load ended — "timeout" is the one the caller treats differently. */
type LoadResult<T> = { ad: T | null; reason?: "error" | "timeout" };

function loadWithTimeout<T extends Loadable>(
    ad: T,
    format: "app_open" | "interstitial",
    placement: string
): Promise<LoadResult<T>> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: LoadResult<T>) => {
            if (settled) return;
            settled = true;
            unsubLoaded();
            unsubError();
            clearTimeout(timer);
            resolve(value);
        };

        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
            analyticsService.logAdLoaded(format, placement);
            finish({ ad });
        });
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
            analyticsService.logAdLoadFailed(
                format,
                placement,
                error?.code ?? error?.message
            );
            finish({ ad: null, reason: "error" });
        });
        const timer = setTimeout(() => {
            analyticsService.logAdSkipped(format, placement, "load_timeout");
            finish({ ad: null, reason: "timeout" });
        }, LOAD_TIMEOUT_MS);

        try {
            ad.load();
        } catch {
            finish({ ad: null, reason: "error" });
        }
    });
}

function loadAppOpen(): Promise<LoadResult<AppOpenAd>> {
    const ad = AppOpenAd.createForAdRequest(AdUnits.appOpenSplash, {
        requestNonPersonalizedAdsOnly: false,
    });
    return loadWithTimeout(ad, "app_open", "open_splash");
}

function loadInterstitial(): Promise<LoadResult<InterstitialAd>> {
    const ad = InterstitialAd.createForAdRequest(AdUnits.interstitialSplash, {
        requestNonPersonalizedAdsOnly: false,
    });
    return loadWithTimeout(ad, "interstitial", "inter_splash");
}

/** Present a loaded ad and resolve once it is off screen. */
function present(
    ad: Loadable,
    format: "app_open" | "interstitial",
    placement: string
): Promise<void> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            unsubOpened();
            unsubClosed();
            unsubError();
            AdsManager.setFullscreenAdShowing(false);
            resolve();
        };

        const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () =>
            analyticsService.logAdImpression(format, placement)
        );
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
            analyticsService.logAdDismissed(format, placement);
            finish();
        });
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);

        AdsManager.setFullscreenAdShowing(true);
        // The full-screen gap is cross-format: nothing else fires for 30s after.
        AdsManager.registerFullScreenShown();
        // No opaque overlay here, unlike the resume ad. That overlay exists to
        // hide app data behind the ad; behind this one is the boot screen —
        // a logo and a progress bar — and painting it dark would only add a
        // colour flash to the first second of every launch.
        try {
            ad.show();
        } catch {
            finish();
        }
    });
}
