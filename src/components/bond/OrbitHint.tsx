import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { SHEET } from "../../theme/sheet";

/**
 * What "orbit her freely in 3D" looks like, shown on the Lv5 row.
 *
 * A gesture is a movement, so the illustration moves: a finger sweeps across an
 * orbit ring and the arrows on the ring pulse with it. A still picture of a
 * hand cannot say "drag left and right", and a video file would be a download,
 * a decode and a black first frame for something that is six shapes and one
 * looping value — at any screen density, offline, inside a list.
 *
 * Deliberately not her actual model: this sits in a scrolling list, and a
 * second live GL surface behind the one already running on the play screen is
 * not worth a hint. Her portrait stands on the ring instead, which is enough to
 * read as "this is her, and you can go around her".
 */
export default function OrbitHint({
    portrait,
    locked = false,
}: {
    /** Her thumbnail. The hint still reads without one. */
    portrait?: string | null;
    /** Dimmed and still when the level has not been reached yet. */
    locked?: boolean;
}) {
    const { t } = useTranslation();
    const sweep = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (locked) {
            sweep.stopAnimation();
            sweep.setValue(0.5);
            return;
        }
        // One pass out, one pass back, then a beat before repeating — a gesture
        // hint that never rests reads as a loading spinner.
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                Animated.timing(sweep, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
                Animated.delay(450),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [locked, sweep]);

    const W = 132;
    const H = 96;

    // The finger rides the front of the ring, so it tracks the same arc the
    // camera would take rather than sliding along a straight line.
    const fingerX = sweep.interpolate({ inputRange: [0, 1], outputRange: [18, W - 30] });
    const fingerY = sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [H - 30, H - 22, H - 30] });

    // Each arrow brightens as the finger travels towards it.
    const leftGlow = sweep.interpolate({ inputRange: [0, 0.45], outputRange: [1, 0.25], extrapolate: "clamp" });
    const rightGlow = sweep.interpolate({ inputRange: [0.55, 1], outputRange: [0.25, 1], extrapolate: "clamp" });

    const tint = locked ? SHEET.textFaint : SHEET.gold;

    return (
        <View style={[styles.wrap, locked && { opacity: 0.45 }]}>
            <View style={{ width: W, height: H }}>
                <Svg width={W} height={H}>
                    <Defs>
                        <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor={tint} stopOpacity="0.15" />
                            <Stop offset="0.5" stopColor={tint} stopOpacity="0.9" />
                            <Stop offset="1" stopColor={tint} stopOpacity="0.15" />
                        </SvgGradient>
                    </Defs>
                    {/* The orbit, flattened into perspective — a circle here
                        would read as a halo on the floor, not a path around her. */}
                    <Ellipse
                        cx={W / 2} cy={H - 26} rx={W / 2 - 12} ry={13}
                        stroke="url(#ring)" strokeWidth={2} fill="none"
                    />
                </Svg>

                {/* Her, standing in the middle of it. */}
                <View style={styles.figure}>
                    {portrait ? (
                        <Image source={{ uri: portrait }} style={styles.portrait} contentFit="cover" transition={150} />
                    ) : (
                        <View style={[styles.portrait, styles.portraitEmpty]} />
                    )}
                </View>

                {/* Which way to drag. */}
                <Animated.View style={[styles.arrow, { left: 2, opacity: leftGlow }]}>
                    <Svg width={14} height={18}>
                        <Path d="M11 2 L4 9 L11 16" stroke={tint} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                </Animated.View>
                <Animated.View style={[styles.arrow, { right: 2, opacity: rightGlow }]}>
                    <Svg width={14} height={18}>
                        <Path d="M3 2 L10 9 L3 16" stroke={tint} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                </Animated.View>

                {/* The finger itself: a contact dot inside a soft halo, the way
                    a touch actually looks on a capacitive screen. */}
                <Animated.View
                    style={[
                        styles.touch,
                        { borderColor: tint, transform: [{ translateX: fingerX }, { translateY: fingerY }] },
                    ]}
                >
                    <View style={[styles.touchDot, { backgroundColor: tint }]} />
                </Animated.View>
            </View>

            <Text style={styles.caption} numberOfLines={2}>
                {t("bond.orbit_hint")}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row", alignItems: "center", gap: 10,
        marginTop: 8, padding: 10,
        borderRadius: 14,
        backgroundColor: SHEET.card,
        borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    figure: { position: "absolute", left: 0, right: 0, top: 4, alignItems: "center" },
    portrait: {
        width: 40, height: 54, borderRadius: 10,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    },
    portraitEmpty: { backgroundColor: "rgba(255,255,255,0.10)" },
    arrow: { position: "absolute", bottom: 18 },
    touch: {
        position: "absolute", left: 0, top: 0,
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 1.5,
        alignItems: "center", justifyContent: "center",
    },
    touchDot: { width: 7, height: 7, borderRadius: 4 },
    caption: { flex: 1, color: SHEET.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
});
