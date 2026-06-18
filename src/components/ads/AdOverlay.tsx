import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { AdsManager } from "../../services/AdsManager";

/**
 * Root-level overlay driven by AdsManager:
 *  - `loading`: a "loading ad…" screen shown briefly before an interstitial
 *    appears (policy rule 1/3 — no abrupt ad).
 *  - `opaque`: a solid screen shown behind the App Open ad so app data is not
 *    visible through/around it (rule 17).
 *
 * Render once at the app root, above the navigator.
 */
export function AdOverlay() {
    const [state, setState] = useState(AdsManager.getOverlay());

    useEffect(() => AdsManager.subscribe(setState), []);

    if (!state.loading && !state.opaque) return null;

    return (
        <View style={styles.fill} pointerEvents="auto">
            {state.loading && (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.text}>Loading ad…</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    fill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#0a0a1a",
        zIndex: 9999,
        elevation: 9999,
    },
    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    text: {
        marginTop: 14,
        color: "rgba(255,255,255,0.7)",
        fontSize: 14,
    },
});
