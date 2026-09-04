import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Android hardware / gesture back.
 *
 * `handler` returns true when it consumed the press; returning false lets the
 * system do its default thing, which on the root screen means leaving the app.
 *
 * Why this exists: the navigator renders exactly one screen at a time (the
 * conditional stack in AppNavigator), so there is never anything to pop and
 * every back press fell straight through to the OS — mid-onboarding included.
 *
 * No-op on iOS, which has no global back button.
 */
export function useAndroidBack(handler: () => boolean, enabled = true) {
    useEffect(() => {
        if (Platform.OS !== "android" || !enabled) return;
        const sub = BackHandler.addEventListener("hardwareBackPress", handler);
        return () => sub.remove();
    }, [handler, enabled]);
}
