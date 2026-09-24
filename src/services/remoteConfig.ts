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
};

export type AdFlag =
    | "ads_banner_enabled"
    | "ads_interstitial_enabled"
    | "ads_native_enabled"
    | "ads_rewarded_enabled"
    | "ads_app_open_enabled";

let ready = false;

export async function initRemoteConfig(): Promise<void> {
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

/** The master switch and the per-format one both have to be on. */
export function adsAllowed(flag: AdFlag): boolean {
    return bool("ads_enabled") && bool(flag);
}

/** Which chat edge function this build talks to, and how. */
export const chatV2Enabled = () => bool("chat_v2_enabled");
export const chatInlinePhotoEnabled = () => bool("chat_inline_photo_enabled");
export const chatSafeMode = () => bool("chat_safe_mode");

export const interstitialMinGapMs = () => num("ads_interstitial_min_gap_seconds") * 1000;
export const interstitialMaxPerDay = () => num("ads_interstitial_max_per_day");
