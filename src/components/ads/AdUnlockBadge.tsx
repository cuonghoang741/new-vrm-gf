import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { IconPlayerPlayFilled } from "@tabler/icons-react-native";

/**
 * Marks a tile as "one rewarded ad away".
 *
 * The word "Ad" is deliberate. AdMob requires a rewarded trigger to be visibly
 * marked as leading to an ad — a bare play glyph would read as "preview" and
 * is exactly the ambiguity the policy is about.
 */
export function AdUnlockBadge({ compact = false }: { compact?: boolean }) {
    return (
        <View style={[styles.badge, compact && styles.badgeCompact]}>
            <IconPlayerPlayFilled size={compact ? 8 : 10} color="#2A1440" />
            <Text style={[styles.text, compact && styles.textCompact]}>Ad</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
        // Amber rather than the app's rose: it must not be mistaken for the
        // brand's own affordances.
        backgroundColor: "#FFC107",
    },
    badgeCompact: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, gap: 2 },
    text: { color: "#2A1440", fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
    textCompact: { fontSize: 8 },
});
