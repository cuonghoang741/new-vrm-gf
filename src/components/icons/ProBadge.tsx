import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import CrownIcon from "./CrownIcon";

/**
 * The one PRO tag the whole app uses: a gold pill with the TrueMate crown and
 * an italic wordmark, a glossy top edge and a diagonal glint. Every screen
 * used to draw its own flat yellow box with "PRO" in it, in four sizes and
 * three yellows.
 */
const SIZES = {
    xs: { h: 15, font: 8.5, crown: 10, padL: 3, padR: 5, gap: 2 },
    sm: { h: 18, font: 10, crown: 12, padL: 4, padR: 6, gap: 2 },
    md: { h: 22, font: 12, crown: 15, padL: 5, padR: 8, gap: 3 },
    lg: { h: 30, font: 16, crown: 20, padL: 8, padR: 12, gap: 4 },
} as const;

export function ProBadge({ size = "sm", label = "PRO", style }: {
    size?: keyof typeof SIZES;
    label?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const z = SIZES[size];
    return (
        <View style={[s.shadow, { borderRadius: z.h / 2 }, style]}>
            <LinearGradient
                colors={["#FFF0B8", "#FFD24A", "#E8901E"]}
                locations={[0, 0.45, 1]}
                style={[s.pill, { height: z.h, borderRadius: z.h / 2, paddingLeft: z.padL, paddingRight: z.padR, gap: z.gap }]}
            >
                {/* Gloss on the top half. */}
                <LinearGradient
                    colors={["rgba(255,255,255,0.65)", "rgba(255,255,255,0)"]}
                    style={[s.gloss, { height: z.h / 2, borderTopLeftRadius: z.h / 2, borderTopRightRadius: z.h / 2 }]}
                    pointerEvents="none"
                />
                {/* A diagonal glint across the pill. */}
                <View style={[s.glint, { height: z.h * 2, left: z.h * 1.6 }]} pointerEvents="none" />
                <CrownIcon size={z.crown} />
                {/* One line, never shrunk: Android measures italic text with
                    letterSpacing a little short, and the last letter wrapped
                    out of sight ("PR"). The padding covers the slant. */}
                <Text
                    numberOfLines={1}
                    style={[s.text, { fontSize: z.font, lineHeight: z.font + 3, paddingRight: Math.ceil(z.font / 4) }]}
                >
                    {label}
                </Text>
            </LinearGradient>
        </View>
    );
}

const s = StyleSheet.create({
    shadow: {
        alignSelf: "flex-start",
        shadowColor: "#E8901E", shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
        elevation: 2,
    },
    pill: {
        flexDirection: "row", alignItems: "center", overflow: "hidden",
        borderWidth: 1, borderColor: "#9A5A12",
    },
    gloss: { position: "absolute", top: 0, left: 0, right: 0 },
    glint: {
        position: "absolute", top: -6, width: 5, backgroundColor: "rgba(255,255,255,0.55)",
        transform: [{ rotate: "25deg" }],
    },
    text: { color: "#4A2600", fontWeight: "900", fontStyle: "italic", letterSpacing: 0.6, flexShrink: 0 },
});
