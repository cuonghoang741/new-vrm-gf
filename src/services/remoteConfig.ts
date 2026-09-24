import remoteConfig from "@react-native-firebase/remote-config";

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
        await remoteConfig().setDefaults(DEFAULTS as any);
        await remoteConfig().setConfigSettings({
            // A kill switch nobody can reach for an hour is not a kill switch.
            // One minute is the shortest Firebase will serve without throttling
            // a busy app.
            minimumFetchIntervalMillis: 60_000,
            fetchTimeMillis: 8_000,
        });
        await remoteConfig().fetchAndActivate();
        ready = true;
    } catch (e) {
        // Keep the defaults; never let this block start-up.
        console.warn("[remoteConfig]", e);
    }
}

function bool(key: keyof typeof DEFAULTS): boolean {
    if (!ready) return DEFAULTS[key] as boolean;
    try {
        return remoteConfig().getValue(key).asBoolean();
    } catch {
        return DEFAULTS[key] as boolean;
    }
}

function num(key: keyof typeof DEFAULTS): number {
    if (!ready) return DEFAULTS[key] as number;
    try {
        const n = remoteConfig().getValue(key).asNumber();
        return Number.isFinite(n) && n > 0 ? n : (DEFAULTS[key] as number);
    } catch {
        return DEFAULTS[key] as number;
    }
}

/** The master switch and the per-format one both have to be on. */
export function adsAllowed(flag: AdFlag): boolean {
    return bool("ads_enabled") && bool(flag);
}

export const interstitialMinGapMs = () => num("ads_interstitial_min_gap_seconds") * 1000;
export const interstitialMaxPerDay = () => num("ads_interstitial_max_per_day");
