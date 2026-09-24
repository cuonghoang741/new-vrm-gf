import crashlytics from "@react-native-firebase/crashlytics";

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
            await crashlytics().setCrashlyticsCollectionEnabled(true);
        } catch (e) {
            console.warn("[crashlytics] enable:", e);
        }
    },

    /**
     * Force a native crash, to prove the pipeline end to end. The console only
     * opens its dashboard after the first report arrives.
     */
    testCrash() {
        crashlytics().log("manual test crash from settings");
        crashlytics().crash();
    },
    /** Called once the user is known, so a crash report has someone attached. */
    async identify(userId: string | null, isPro: boolean) {
        try {
            if (userId) await crashlytics().setUserId(userId);
            await crashlytics().setAttribute("pro", String(isPro));
        } catch { /* reporting must never break the app */ }
    },

    /** Breadcrumb. Shows up in the log of the next crash. */
    log(message: string) {
        try { crashlytics().log(message); } catch { }
    },

    /** A JS error worth a report, with the screen it came from. */
    record(error: unknown, where?: string) {
        try {
            if (where) crashlytics().log(where);
            crashlytics().recordError(
                error instanceof Error ? error : new Error(String(error))
            );
        } catch { }
    },

    async setCharacter(id: string | null, name?: string) {
        try {
            await crashlytics().setAttributes({
                character_id: id ?? "",
                character_name: name ?? "",
            });
        } catch { }
    },
};
