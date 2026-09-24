import type { FirebaseCrashlyticsTypes } from "@react-native-firebase/crashlytics";

/**
 * Resolve the native module lazily, and only once.
 *
 * A binary built before Crashlytics was added — every build already in
 * someone's hands, and the iOS dev client on this machine — has the JS package
 * but not the native module, and react-native-firebase throws a hard
 * "[runtime not ready]" error the first time it is called. Reporting must
 * never be the thing that takes the app down, so a missing module is simply a
 * no-op here.
 */
let mod: (() => FirebaseCrashlyticsTypes.Module) | null | undefined;

function client(): FirebaseCrashlyticsTypes.Module | null {
    if (mod === undefined) {
        try {
            mod = require("@react-native-firebase/crashlytics").default;
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
 * Crashlytics, wrapped so the rest of the app never imports it directly.
 *
 * Native crashes are captured by the SDK on its own. What this adds is the
 * context that makes a stack trace answerable: which user, which character,
 * and the JS errors that never reach the native layer at all.
 */
export const crash = {
    /**
     * Turn collection on.
     *
     * react-native-firebase ships `firebase_crashlytics_collection_enabled`
     * as **false** in the manifest — it wants the app to decide, so NDK
     * support can be wired first. `firebase.json` flips that at build time;
     * this is the runtime belt to its braces, and the only thing that works on
     * a binary built before that file existed. Without it the SDK is linked,
     * initialised, and silently reports nothing — which is why the Firebase
     * console keeps showing the "add the SDK" instructions.
     */
    async enable() {
        try {
            await client()?.setCrashlyticsCollectionEnabled(true);
        } catch (e) {
            console.warn("[crashlytics] enable:", e);
        }
    },

    /**
     * Force a native crash, to prove the pipeline end to end. The console only
     * opens its dashboard after the first report arrives.
     */
    testCrash() {
        const c = client();
        if (!c) return;
        c.log("manual test crash from settings");
        c.crash();
    },
    /** Called once the user is known, so a crash report has someone attached. */
    async identify(userId: string | null, isPro: boolean) {
        try {
            if (userId) await client()?.setUserId(userId);
            await client()?.setAttribute("pro", String(isPro));
        } catch { /* reporting must never break the app */ }
    },

    /** Breadcrumb. Shows up in the log of the next crash. */
    log(message: string) {
        try { client()?.log(message); } catch { }
    },

    /** A JS error worth a report, with the screen it came from. */
    record(error: unknown, where?: string) {
        try {
            if (where) client()?.log(where);
            client()?.recordError(
                error instanceof Error ? error : new Error(String(error))
            );
        } catch { }
    },

    async setCharacter(id: string | null, name?: string) {
        try {
            await client()?.setAttributes({
                character_id: id ?? "",
                character_name: name ?? "",
            });
        } catch { }
    },
};
