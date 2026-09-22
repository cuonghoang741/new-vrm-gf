import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import LockIcon from "../../components/icons/LockIcon";
import { ACCENT } from "./theme";

/**
 * Full-screen gate over the scene when a `become_nude` action lands for a
 * non-PRO user.
 *
 * Renders last in PlayScreen's tree and at zIndex 500 so nothing floats over
 * it — the point is that the content underneath stays unreadable, and a
 * bubble or sheet drawn on top would defeat that.
 */
export function SensitiveOverlay({
    visible,
    onUpgrade,
    onDismiss,
}: {
    visible: boolean;
    onUpgrade: () => void;
    /** Closes the gate AND reverts the model — see PlayScreen's handler. */
    onDismiss: () => void;
}) {
    const { t } = useTranslation();
    if (!visible) return null;

    return (
        <BlurView intensity={65} tint="dark" style={[StyleSheet.absoluteFill, styles.scrim]}>
            <View style={styles.center}>
                <View style={styles.iconRing}>
                    <LockIcon size={40} color={ACCENT} />
                </View>
                <Text style={styles.title}>{t("play.sensitive_title")}</Text>
                <Text style={styles.body}>{t("play.sensitive_body")}</Text>
                <Pressable style={styles.cta} onPress={onUpgrade}>
                    <Text style={styles.ctaText}>{t("play.unlock_pro")}</Text>
                </Pressable>
                <Pressable style={styles.dismiss} onPress={onDismiss}>
                    <Text style={styles.dismissText}>{t("play.dismiss")}</Text>
                </Pressable>
            </View>
        </BlurView>
    );
}

const styles = StyleSheet.create({
    /**
     * The gate carried no colour of its own and leaned entirely on BlurView.
     * On Android expo-blur cannot blur the WebView/GL surface the scene draws
     * into, so it came out all but transparent — the one thing this overlay
     * exists to prevent. An opaque scrim does the hiding; the blur is now only
     * the extra depth it adds on iOS.
     */
    scrim: { zIndex: 500, backgroundColor: "rgba(10, 6, 20, 0.94)" },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
    iconRing: {
        backgroundColor: "rgba(255, 107, 157, 0.18)",
        padding: 20,
        borderRadius: 100,
        marginBottom: 20,
    },
    title: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "800",
        textAlign: "center",
        marginBottom: 12,
    },
    body: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 16,
        textAlign: "center",
        lineHeight: 22,
        marginBottom: 30,
    },
    cta: {
        backgroundColor: ACCENT,
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 30,
        shadowColor: ACCENT,
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    dismiss: { marginTop: 20, padding: 10 },
    dismissText: { color: "rgba(255,255,255,0.4)", fontSize: 14 },
});
