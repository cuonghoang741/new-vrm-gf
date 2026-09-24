import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import { useTranslation } from "react-i18next";
import LockIcon from "../../components/icons/LockIcon";
import type { SurfaceTokens } from "../../theme/surface";
import { ACCENT } from "./theme";

/**
 * Full-screen gate over the scene when a `become_nude` action lands for a
 * non-PRO user.
 *
 * Renders last in PlayScreen's tree and at zIndex 500 so nothing floats over
 * it — the point is that the content underneath stays unreadable, and a
 * bubble or sheet drawn on top would defeat that.
 *
 * The hiding is NOT this component's job any more. The scene blurs itself —
 * `setPreviewBlur` inside the WebView for the 3D canvas, `blurRadius` on the
 * 2D art — which is the only thing that works on Android, where expo-blur
 * cannot touch a GL surface. This used to compensate with a 94%-opaque scrim,
 * which hid the scene by deleting it. Now it is a light veil, and the message
 * sits on its own glass so it stays readable over whatever is behind.
 */
export function SensitiveOverlay({
    visible,
    surface,
    onUpgrade,
    onDismiss,
}: {
    visible: boolean;
    /** Palette for the card, from the scene behind it. */
    surface: SurfaceTokens;
    onUpgrade: () => void;
    /** Closes the gate AND reverts the model — see PlayScreen's handler. */
    onDismiss: () => void;
}) {
    const { t } = useTranslation();
    if (!visible) return null;

    return (
        <BlurView intensity={28} tint="dark" style={[StyleSheet.absoluteFill, styles.scrim]}>
            <View style={styles.center}>
                <Card surface={surface}>
                    <View style={styles.iconRing}>
                        <LockIcon size={40} color={ACCENT} />
                    </View>
                    <Text style={[styles.title, { color: surface.icon }]}>
                        {t("play.sensitive_title")}
                    </Text>
                    <Text style={[styles.body, { color: surface.muted }]}>
                        {t("play.sensitive_body")}
                    </Text>
                    <Pressable style={styles.cta} onPress={onUpgrade}>
                        <Text style={styles.ctaText}>{t("play.unlock_pro")}</Text>
                    </Pressable>
                    <Pressable style={styles.dismiss} onPress={onDismiss}>
                        <Text style={[styles.dismissText, { color: surface.muted }]}>
                            {t("play.dismiss")}
                        </Text>
                    </Pressable>
                </Card>
            </View>
        </BlurView>
    );
}

/**
 * The message's own surface. Liquid glass where the platform has it, a tinted
 * pane from the surface tokens everywhere else — the same pair every other
 * control that floats over the scene uses.
 */
function Card({ surface, children }: { surface: SurfaceTokens; children: React.ReactNode }) {
    if (isLiquidGlassSupported) {
        return (
            <LiquidGlassView style={[styles.card, styles.cardEdge]} effect="regular" tintColor={surface.glass}>
                {children}
            </LiquidGlassView>
        );
    }
    return (
        <View style={[styles.card, styles.cardEdge, { backgroundColor: surface.glass }]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    /**
     * Barely there. The scene is already blurred at the source and the card
     * carries its own glass and edge, so this is only a hint of depth behind
     * the dialog — it is not what hides anything. It has come down 0.94 →
     * 0.38 → 0.15 → 0.05 as each of those jobs moved to where it belonged.
     */
    scrim: { zIndex: 500, backgroundColor: "rgba(10, 6, 20, 0.05)" },
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
    /** The pink edge is what separates the card from the scene now. */
    cardEdge: { borderWidth: 1.5, borderColor: "rgba(255, 61, 127, 0.75)" },
    card: {
        width: "100%",
        maxWidth: 340,
        borderRadius: 28,
        overflow: "hidden",
        alignItems: "center",
        paddingHorizontal: 26,
        paddingTop: 28,
        paddingBottom: 18,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
            android: { elevation: 12 },
            default: {},
        }),
    },
    iconRing: {
        backgroundColor: "rgba(255, 107, 157, 0.18)",
        padding: 20,
        borderRadius: 100,
        marginBottom: 20,
    },
    // Colour comes from the surface tokens: over a light scene the glass is
    // near-white and white text on it is invisible.
    title: {
        fontSize: 21,
        fontWeight: "800",
        textAlign: "center",
        marginBottom: 12,
    },
    body: {
        fontSize: 15,
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
    dismissText: { fontSize: 14 },
});
