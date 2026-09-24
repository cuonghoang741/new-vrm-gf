import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FLASH_GIFT_IMAGE } from "./art";
import { useFlashSale } from "../../services/flashSale";

/**
 * The offer's first appearance: a gift that drifts at the edge of the play
 * screen, with the clock on it.
 *
 * Deliberately not Yuuki's centre-screen box. This screen already has a
 * character in it who is the reason anyone is here, and parking a present over
 * her face to sell a subscription is the kind of thing that makes an app feel
 * like a slot machine. It sits to one side, it bobs so the eye finds it, and
 * it says how long it has — which is the only honest reason to hurry.
 */
export function FlashGift({ onPress }: { onPress: () => void }) {
    const { clock, isActive } = useFlashSale();
    const bob = useRef(new Animated.Value(0)).current;
    const pop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 70 }).start();
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(bob, {
                    toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
                }),
                Animated.timing(bob, {
                    toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [bob, pop]);

    if (!isActive) return null;

    const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });
    const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

    return (
        <Animated.View style={[styles.wrap, { opacity: pop, transform: [{ translateY }, { scale }] }]}>
            <Pressable
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onPress();
                }}
                hitSlop={10}
                style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
            >
                <Image source={{ uri: FLASH_GIFT_IMAGE }} style={styles.gift} resizeMode="contain" />
                <View style={styles.clock}>
                    <Text style={styles.clockText}>{clock}</Text>
                </View>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // Left side, under the ruby column: the right rail is a dense stack of
    // controls and the left has room. `bottom: 210` put it among the chat
    // bubbles — this sits above where the first bubble starts, in the gap
    // between the left controls and the conversation.
    wrap: { position: "absolute", left: 14, bottom: 318, zIndex: 40, alignItems: "center" },
    gift: { width: 86, height: 86 },
    clock: {
        marginTop: -6,
        paddingHorizontal: 9,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0E0A16",
        borderWidth: 1.5,
        borderColor: "rgba(255, 61, 127, 0.9)",
    },
    clockText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "900",
        fontVariant: ["tabular-nums"],
        letterSpacing: 0.3,
    },
});
