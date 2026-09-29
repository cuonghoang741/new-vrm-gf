import React, { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SHEET } from "../../theme/sheet";

export type TouchFeedbackHandle = {
    /** Her reaction, floating up from the tap. */
    emoji: (x: number, y: number, emoji: string) => void;
    /** What the touch earned, once the server has said. */
    xp: (x: number, y: number, amount: number, multiplier: number) => void;
    /** A one-line prompt that lingers, e.g. the first-run "tap her". */
    hint: (x: number, y: number, text: string) => void;
};

type Item = {
    id: number;
    x: number;
    y: number;
    kind: "emoji" | "xp" | "hint";
    text: string;
    gold: boolean;
    anim: Animated.Value;
};

const ITEM_WIDTH = 120;
const HINT_WIDTH = 280;
let nextId = 1;

/**
 * Floating feedback drawn at the point of a touch. It is not a control: it
 * takes no touches and lives for about a second.
 */
export const TouchFeedback = forwardRef<TouchFeedbackHandle>(function TouchFeedback(_, ref) {
    const [items, setItems] = useState<Item[]>([]);

    const spawn = useCallback((x: number, y: number, kind: Item["kind"], text: string, gold = false) => {
        const id = nextId++;
        const anim = new Animated.Value(0);
        // Capped so a run of taps cannot pile up views.
        setItems((list) => [...list.slice(-5), { id, x, y, kind, text, gold, anim }]);
        Animated.timing(anim, {
            toValue: 1,
            duration: kind === "emoji" ? 1100 : kind === "xp" ? 1500 : 3600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start(() => setItems((list) => list.filter((i) => i.id !== id)));
    }, []);

    useImperativeHandle(
        ref,
        () => ({
            emoji: (x, y, emoji) => spawn(x, y, "emoji", emoji),
            xp: (x, y, amount, multiplier) =>
                spawn(x, y - 44, "xp", multiplier > 1 ? `+${amount} XP ×${multiplier}` : `+${amount} XP`, multiplier > 1),
            hint: (x, y, text) => spawn(x, y, "hint", text),
        }),
        [spawn]
    );

    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 5 }]}>
            {items.map((i) => {
                const rise = i.kind === "emoji" ? -90 : i.kind === "xp" ? -56 : -14;
                const translateY = i.anim.interpolate({ inputRange: [0, 1], outputRange: [0, rise] });
                const opacity = i.anim.interpolate({ inputRange: [0, 0.12, 0.72, 1], outputRange: [0, 1, 1, 0] });
                const scale = i.anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] });
                return (
                    <Animated.View
                        key={i.id}
                        style={[
                            styles.item,
                            i.kind === "hint" && styles.hintItem,
                            {
                                left: i.x - (i.kind === "hint" ? HINT_WIDTH : ITEM_WIDTH) / 2,
                                top: i.y - 24,
                                opacity,
                                transform: [{ translateY }, { scale }],
                            },
                        ]}
                    >
                        {i.kind === "emoji" ? (
                            <Text style={styles.emoji}>{i.text}</Text>
                        ) : i.kind === "hint" ? (
                            <Text style={styles.hint}>{i.text}</Text>
                        ) : (
                            <Text style={[styles.xp, { color: i.gold ? SHEET.gold : SHEET.text }]}>{i.text}</Text>
                        )}
                    </Animated.View>
                );
            })}
        </View>
    );
});

const styles = StyleSheet.create({
    item: { position: "absolute", width: ITEM_WIDTH, alignItems: "center" },
    emoji: { fontSize: 38 },
    hintItem: { width: HINT_WIDTH },
    hint: {
        color: SHEET.text,
        fontSize: 16,
        fontWeight: "800",
        textAlign: "center",
        textShadowColor: "rgba(0,0,0,0.7)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 8,
    },
    xp: {
        fontSize: 17,
        fontWeight: "900",
        textShadowColor: "rgba(0,0,0,0.65)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
});
