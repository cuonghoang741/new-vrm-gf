import { NativeModules } from "react-native";
/**
 * Resolve the native module lazily, and only once.
 *
 * A binary built before Remote Config was added has the JS package but not the
 * native module, and react-native-firebase throws a hard "[runtime not ready]"
 * error on first use. The kill switch must never be the thing that kills the
 * app, so a missing module leaves every flag at its default — which is ON.
 */
let mod: any;

function rc(): any | null {
    if (mod === undefined) {
        // Check the native side is there BEFORE touching the JS package:
        // react-native-firebase throws from the module's own getters, and a
        // throw inside a require is not something every JS runtime unwinds
        // the same way.
        mod = null;
        try {
            if (NativeModules.RNFBConfigModule) {
                mod = require("@react-native-firebase/remote-config").default;
            }
        } catch {
            mod = null;
        }
    }
    try {
        return mod ? mod() : null;
    } catch {
        return null;
    }
}

/**
 * Firebase Remote Config, used as a kill switch for ads.
 *
 * Every flag defaults to ON, and the defaults below are what the app runs on
 * until the first fetch lands — so a Firebase outage, a cold start with no
 * network, or a typo'd key can never accidentally turn the business off. The
 * switch only ever takes something away, deliberately, from the console.
 *
 * Values are edited in Firebase (or through the CMS's Remote Config page,
 * which talks to the `remote-config` edge function).
 */
const DEFAULTS = {
    ads_enabled: true,
    ads_banner_enabled: true,
    ads_interstitial_enabled: true,
    ads_native_enabled: true,
    ads_rewarded_enabled: true,
    ads_app_open_enabled: true,
    ads_interstitial_min_gap_seconds: 120,
    ads_interstitial_max_per_day: 6,
    /**
     * The splash's interstitial fallback, used when the App Open ad does not
     * fill. OFF by default: App Open is the format built for app launch, and
     * an interstitial the moment the app opens is the placement Google's
     * interstitial guidance tells publishers not to use. Kept switchable
     * rather than deleted because the ad scenario asks for it.
     */
    ads_splash_interstitial_enabled: false,
    /**
     * Comma-separated `placement` names that never render an ad, e.g.
     * "signin,splash". This is the switch to use when AdMob flags a single
     * placement, so it can be removed without a release.
     *
     * The default blocks the two banners that sit on screens with no content
     * of their own, the sign-in screen and the boot/loading screen. Login and
     * loading screens are the standard examples of pages AdMob does not want
     * ads on, and a banner next to the sign-in buttons also invites the
     * accidental tap it counts as invalid traffic.
     */
    ads_blocked_placements: "signin,splash",
    /**
     * Route chat through `gemini-chat-v2` — the version that sends her photos
     * in the same turn. Off falls back to `gemini-chat`, which is what is on
     * production today and stays untouched.
     */
    chat_v2_enabled: true,
    /** Photos in the chat turn at all. Independent of which function is used. */
    chat_inline_photo_enabled: true,
    /**
     * The one flag here that is OFF by default. Turning it on pins every reply
     * to a strict SFW policy that overrides the character description — for a
     * store review, or a region, or the day something goes wrong.
     */
    chat_safe_mode: false,
    /**
     * Makes the flash sale testable. The offer normally opens once per day per
     * device and never for an account that has bought anything — both correct
     * in production and both a wall in QA, where the tester gets one attempt a
     * day and a tester who has ever purchased gets none at all. On, the window
     * reopens every time the paywall is closed.
     *
     * OFF by default, and it only relaxes WHEN the offer is shown — the price
     * behind it is still whatever the store will actually honour.
     */
    flash_sale_test_mode: false,
    /**
     * The onboarding questionnaire. Off sends a new account straight to the
     * play screen.
     *
     * Onboarding is not only a questionnaire: it is where the first character
     * is granted, and `isOnboarded` is read from the database as "owns a
     * character". Skipping it therefore grants one instead of dropping the
     * account on a play screen with nothing to open — see
     * `grantStarterCharacter`.
     */
    onboarding_enabled: true,
    /**
     * Which character that skip grants. Empty picks the first the catalogue
     * returns, which is `characters.order` ascending — so the default can be
     * changed from the CMS without touching this value at all.
     */
    onboarding_default_character_id: "",
};

export type AdFlag =
    | "ads_banner_enabled"
    | "ads_interstitial_enabled"
    | "ads_native_enabled"
    | "ads_rewarded_enabled"
    | "ads_app_open_enabled";

let ready = false;
let initPromise: Promise<void> | null = null;

/** Idempotent: every caller awaits the same first fetch. */
export function initRemoteConfig(): Promise<void> {
    if (!initPromise) initPromise = runInit();
    return initPromise;
}

/**
 * Resolves once the first fetch has landed, or after `timeoutMs`, whichever
 * comes first; the boolean says which.
 *
 * Flags are read straight from `DEFAULTS` until the fetch returns, which is
 * fine for a kill switch — it defaults to the business staying on — but not
 * for anything routing a first launch, where the fetch and the decision race
 * and the decision usually wins. Callers in that position wait here instead.
 */
export function whenRemoteConfigReady(timeoutMs = 2500): Promise<boolean> {
    return Promise.race([
        initRemoteConfig().then(() => ready),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(ready), timeoutMs)),
    ]);
}

async function runInit(): Promise<void> {
    try {
        const c = rc();
        if (!c) return;
        await c.setDefaults(DEFAULTS as any);
        await c.setConfigSettings({
            // A kill switch nobody can reach for an hour is not a kill switch.
            // One minute is the shortest Firebase will serve without throttling
            // a busy app.
            minimumFetchIntervalMillis: 60_000,
            fetchTimeMillis: 8_000,
        });
        await c.fetchAndActivate();
        ready = true;
    } catch (e) {
        // Keep the defaults; never let this block start-up.
        console.warn("[remoteConfig]", e);
    }
}

function bool(key: keyof typeof DEFAULTS): boolean {
    if (!ready) return DEFAULTS[key] as boolean;
    try {
        return rc()?.getValue(key).asBoolean() ?? (DEFAULTS[key] as boolean);
    } catch {
        return DEFAULTS[key] as boolean;
    }
}

function num(key: keyof typeof DEFAULTS): number {
    if (!ready) return DEFAULTS[key] as number;
    try {
        const n = rc()?.getValue(key).asNumber() ?? NaN;
        return Number.isFinite(n) && n > 0 ? n : (DEFAULTS[key] as number);
    } catch {
        return DEFAULTS[key] as number;
    }
}

function str(key: keyof typeof DEFAULTS): string {
    if (!ready) return DEFAULTS[key] as string;
    try {
        return rc()?.getValue(key).asString() ?? (DEFAULTS[key] as string);
    } catch {
        return DEFAULTS[key] as string;
    }
}

/** The master switch and the per-format one both have to be on. */
export function adsAllowed(flag: AdFlag): boolean {
    return bool("ads_enabled") && bool(flag);
}

/** False when this placement is listed in `ads_blocked_placements`. */
export function placementAllowed(placement: string): boolean {
    const blocked = str("ads_blocked_placements")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    return !blocked.includes(placement);
}

export const splashInterstitialEnabled = () =>
    adsAllowed("ads_interstitial_enabled") && bool("ads_splash_interstitial_enabled");

/** Which chat edge function this build talks to, and how. */
export const chatV2Enabled = () => bool("chat_v2_enabled");
export const chatInlinePhotoEnabled = () => bool("chat_inline_photo_enabled");
export const chatSafeMode = () => bool("chat_safe_mode");
export const flashSaleTestMode = () => bool("flash_sale_test_mode");

/** Whether a new account is asked the onboarding questions at all. */
export const onboardingEnabled = () => bool("onboarding_enabled");
export const onboardingDefaultCharacterId = () =>
    str("onboarding_default_character_id").trim();

export const interstitialMinGapMs = () => num("ads_interstitial_min_gap_seconds") * 1000;
export const interstitialMaxPerDay = () => num("ads_interstitial_max_per_day");
