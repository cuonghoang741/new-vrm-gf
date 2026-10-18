import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import type { TouchPart } from "../../components/VRMViewer";
import type { SurfaceTokens } from "../../theme/surface";

/**
 * One-tap touches, from fi005's room: the four things you would do to her if
 * she were next to you. Each is an ordinary touch underneath (it spends one of
 * a free account's three a day and earns the same XP), aimed at the part it
 * would land on, with its own reaction on top.
 */
export type QuickTouch = "pat" | "hug" | "flowers" | "poke";

/**
 * Painted icons, hosted next to the flash-sale art (a bundled PNG does not
 * survive the Android release build; see components/flash/art.ts). The emoji
 * stays underneath, so the button is never blank while one loads or offline.
 */
const ART = "https://pub-2682fd3d83e342588016f364737f5758.r2.dev/app-art/touch/";

export const QUICK_TOUCHES: { key: QuickTouch; emoji: string; part: TouchPart }[] = [
    { key: "pat", emoji: "🤚", part: "head" },
    { key: "hug", emoji: "🤗", part: "chest" },
    { key: "flowers", emoji: "💐", part: "hand" },
    { key: "poke", emoji: "👉", part: "face" },
];

export function QuickTouches({ surface, onPress }: { surface: SurfaceTokens; onPress: (a: QuickTouch) => void }) {
    const { t } = useTranslation();
    return (
        <View style={s.rail}>
            {QUICK_TOUCHES.map(({ key, emoji }) => {
                const face = (
                    <>
                        <Text style={s.emoji}>{emoji}</Text>
                        <Image
                            source={`${ART}${key}.jpg`}
                            style={s.art}
                            cachePolicy="disk"
                            transition={120}
                        />
                    </>
                );
                return (
                    <Pressable
                        key={key}
                        onPress={() => onPress(key)}
                        hitSlop={4}
                        style={({ pressed }) => [s.item, pressed && { transform: [{ scale: 0.92 }] }]}
                        accessibilityRole="button"
                        accessibilityLabel={t(`touch.act_${key}`)}
                    >
                        {isLiquidGlassSupported ? (
                            <LiquidGlassView
                                style={[s.btn, { borderColor: surface.border }]}
                                effect="regular"
                                interactive
                                tintColor={surface.glass}
                            >
                                {face}
                            </LiquidGlassView>
                        ) : (
                            <View style={[s.btn, { backgroundColor: surface.glass, borderColor: surface.border }]}>{face}</View>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
}

const s = StyleSheet.create({
    rail: { marginTop: 12, gap: 7, alignItems: "center", width: 42 },
    item: { alignItems: "center" },
    btn: {
        width: 38, height: 38, borderRadius: 19, overflow: "hidden",
        alignItems: "center", justifyContent: "center",
        borderWidth: Platform.OS === "android" ? 1 : StyleSheet.hairlineWidth,
    },
    emoji: { fontSize: 18 },
    art: { ...StyleSheet.absoluteFillObject, borderRadius: 19 },
});
