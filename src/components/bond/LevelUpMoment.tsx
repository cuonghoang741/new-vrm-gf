import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { SHEET } from "../../theme/sheet";

/**
 * The card that marks a bond level: her face, the level's name, what it just
 * opened, and the one thing she says only at this level (see bond-moment).
 * Her line arrives a moment after the card; until then a spinner holds its
 * place, and if it never comes the card still stands on its own.
 */
export function LevelUpMoment({
    visible, level, name, portrait, line, loading, onClose,
}: {
    visible: boolean;
    level: number;
    name: string;
    portrait: string | null;
    line: string | null;
    loading: boolean;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const pop = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!visible) return;
        pop.setValue(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    }, [visible, pop]);
    const gold = level >= 5;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <Pressable style={s.backdrop} onPress={onClose}>
                <Animated.View
                    style={[s.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
                >
                    <Pressable onPress={() => {}} style={{ alignItems: "center" }}>
                        <Text style={s.kicker}>{t("bond.levelup_kicker")}</Text>
                        <View style={s.portraitRing}>
                            <LinearGradient colors={gold ? SHEET.goldGradient : SHEET.modeGradient} style={s.ring}>
                                {!!portrait && (
                                    <Image source={{ uri: portrait }} style={s.portrait} contentFit="cover" contentPosition="top" />
                                )}
                            </LinearGradient>
                        </View>
                        <LinearGradient colors={gold ? SHEET.goldGradient : SHEET.accentGradient} style={s.badge}>
                            <Text style={s.badgeText}>{t(`bond.lv${level}`)} · Lv {level}</Text>
                        </LinearGradient>
                        <Text style={s.unlocks}>{t(`bond.lv${level}_unlocks`)}</Text>

                        <View style={s.bubble}>
                            <Text style={s.bubbleName}>{name}</Text>
                            {loading ? (
                                <ActivityIndicator color="#fff" style={{ marginVertical: 6 }} />
                            ) : (
                                <Text style={s.bubbleText}>{line ?? t("bond.levelup_fallback", { name })}</Text>
                            )}
                        </View>

                        <Pressable onPress={onClose} style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}>
                            <LinearGradient colors={SHEET.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaBg}>
                                <Text style={s.ctaText}>{t("bond.levelup_cta")}</Text>
                            </LinearGradient>
                        </Pressable>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(10,5,20,0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
    card: {
        width: "100%", maxWidth: 360, borderRadius: 26, paddingVertical: 22, paddingHorizontal: 18,
        backgroundColor: SHEET.bgTop, borderWidth: 1, borderColor: "rgba(255,111,163,0.35)",
    },
    kicker: { color: "#FFC2DA", fontSize: 13, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
    portraitRing: { marginTop: 14 },
    ring: { width: 112, height: 112, borderRadius: 56, padding: 3 },
    portrait: { width: 106, height: 106, borderRadius: 53, backgroundColor: SHEET.card },
    badge: { marginTop: 14, paddingHorizontal: 14, height: 30, borderRadius: 15, justifyContent: "center" },
    badgeText: { color: "#fff", fontSize: 15, fontWeight: "900" },
    unlocks: { color: SHEET.textMuted, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 },
    bubble: {
        alignSelf: "stretch", marginTop: 16, padding: 14, borderRadius: 18, borderTopLeftRadius: 6,
        backgroundColor: "rgba(255,77,141,0.14)", borderWidth: 1, borderColor: "rgba(255,77,141,0.35)",
    },
    bubbleName: { color: "#FF8FB8", fontSize: 12, fontWeight: "800", marginBottom: 4 },
    bubbleText: { color: "#fff", fontSize: 15, lineHeight: 21 },
    cta: { alignSelf: "stretch", marginTop: 18 },
    ctaBg: { height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
