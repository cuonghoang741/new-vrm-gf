import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { SurfaceTokens } from "../theme/surface";

/**
 * Who you are with, in the top bar: her face, her name, and how close you are.
 *
 * This replaced the quick-switch carousel. The carousel answered "who else is
 * there" — a question nobody opens the play screen to ask — while hiding the
 * one number the whole progression loop is built on. Tapping still opens the
 * full character page, so switching costs one extra tap and nothing is lost.
 */
export function CharacterCard({
    name,
    avatar,
    level,
    progress,
    hasClaimable,
    surface,
    onPress,
}: {
    name: string;
    avatar?: string | null;
    /** Bond level 1..5. Null while it is still loading. */
    level: number | null;
    /** 0..1 through the current level; null at max. */
    progress: number | null;
    /** A quest of hers is finished and waiting to be claimed. */
    hasClaimable?: boolean;
    surface: SurfaceTokens;
    onPress: () => void;
}) {
    const maxed = level != null && level >= 5;
    const pct = Math.max(0, Math.min(1, progress ?? (maxed ? 1 : 0)));

    return (
        // Shadow lives out here: on the same view as `overflow: "hidden"` it
        // is clipped away entirely on iOS.
        <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.shadow, pressed && { opacity: 0.85 }]}>
            <Wrapper surface={surface}>
            {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" contentPosition="top center" transition={180} />
            ) : (
                <View style={[styles.avatar, styles.avatarEmpty]} />
            )}

            {/* Ruby waiting on her level page. The dot sits on the avatar
                rather than in the row, so it survives a long name. */}
            {hasClaimable && <View style={styles.claimDot} />}

            {/* Name and level share one line, bar spans the rest.
                A badge pinned over the avatar was cramped, covered her face and
                needed a dark outline that read as a smudge; right-aligning the
                level costs nothing and gives the bar its full width back. */}
            <View style={styles.body}>
                <View style={styles.nameRow}>
                    <Text style={[styles.name, { color: surface.icon }]} numberOfLines={1}>
                        {name}
                    </Text>
                    <Text style={[styles.lv, { color: maxed ? "#FFD700" : surface.accent }]}>
                        Lv {level ?? 1}
                    </Text>
                </View>
                <View style={[styles.track, { backgroundColor: surface.border }]}>
                    <LinearGradient
                        colors={maxed ? ["#FFD700", "#FF8C00"] : ["#FF6FA3", "#FF2E74"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.fill, { width: `${pct * 100}%` }]}
                    />
                </View>
            </View>
            </Wrapper>
        </Pressable>
    );
}

/**
 * A plain view, deliberately.
 *
 * Wrapping this in `LiquidGlassView` to match the bubble buttons' material
 * broke the layout: it is a native view and does not shrink-wrap its children
 * the way a `View` does, so the flexing name/progress row collapsed. The
 * colours already come from the same `surface` tokens the bubble buttons use,
 * so the two agree on tone; only the iOS glass material differs.
 */
function Wrapper({ surface, children }: { surface: SurfaceTokens; children: React.ReactNode }) {
    return (
        <View style={[styles.card, { backgroundColor: surface.glass, borderColor: surface.border, borderWidth: 1 }]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    claimDot: {
        position: "absolute", top: 4, left: 40,
        width: 11, height: 11, borderRadius: 5.5,
        backgroundColor: "#FF3B5C",
        borderWidth: 2, borderColor: "rgba(20,10,30,0.95)",
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 5,
        paddingRight: 10,
        paddingVertical: 5,
        borderRadius: 22,
        overflow: "hidden",
        // An explicit width, not maxWidth. The card sits in an absolutely
        // positioned, centre-aligned bar, so it is sized by its content — and
        // a `flex: 1` child inside a container with no definite width
        // collapses to zero, which is why only the avatar survived and the
        // name and level bar vanished.
        width: 162,
    },
    /** Matches the bubble buttons' lift off the scene. */
    shadow: {
        shadowColor: "#1A0A2E",
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: Platform.OS === "android" ? 4 : 0,
    },
    avatar: { width: 34, height: 34, borderRadius: 17 },
    avatarEmpty: { backgroundColor: "rgba(255,255,255,0.10)" },
    body: { flex: 1, minWidth: 0, justifyContent: "center" },
    name: { flex: 1, fontSize: 13, fontWeight: "800" },
    nameRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    lv: { fontSize: 11, fontWeight: "900", letterSpacing: 0.2 },
    track: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 5 },
    fill: { height: 4, borderRadius: 2 },
});
