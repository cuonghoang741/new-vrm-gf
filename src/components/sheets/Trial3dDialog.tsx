import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { IconPlayerPlayFilled } from "@tabler/icons-react-native";
import { SHEET } from "../../theme/sheet";

// Painted for this dialog: a chibi figure on a hologram stage, on the same
// near-black as CARD_TOP so its edges disappear into the card.
const HERO = "https://pub-2682fd3d83e342588016f364737f5758.r2.dev/app-art/trial/trial3d.jpg";
const CARD_TOP = "#0B010C";
const CARD_BOTTOM = "#1C0A1C";

/**
 * The one time a free user is handed 3D.
 *
 * 3D is what PRO is for, and until now a free user had never seen it — the
 * toggle only ever opened the paywall, which is a poor way to sell something
 * nobody has watched move. Three minutes, once, offered the first time they
 * reach the play screen.
 */
export function Trial3dDialog({
    visible,
    minutes,
    onStart,
    onClose,
}: {
    visible: boolean;
    minutes: number;
    onStart: () => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const pop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) {
            pop.setValue(0);
            return;
        }
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start();
    }, [visible, pop]);

    const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View style={[styles.cardWrap, { opacity: pop, transform: [{ scale }] }]}>
                    <LinearGradient colors={[CARD_TOP, CARD_TOP, CARD_BOTTOM]} locations={[0, 0.5, 1]} style={styles.card}>
                    <View style={styles.hero}>
                        <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={160} />
                        <LinearGradient
                            colors={["transparent", CARD_TOP]}
                            style={styles.heroFade}
                            pointerEvents="none"
                        />
                    </View>

                    <View style={styles.content}>
                    <Text style={styles.title}>{t("trial3d.title", { n: minutes })}</Text>
                    <Text style={styles.body}>{t("trial3d.body")}</Text>

                    <Pressable onPress={onStart} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                        <LinearGradient
                            colors={SHEET.accentGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <IconPlayerPlayFilled size={18} color="#fff" />
                            <Text style={styles.ctaText}>{t("trial3d.cta", { n: minutes })}</Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                        <Text style={styles.laterText}>{t("trial3d.later")}</Text>
                    </Pressable>
                    </View>
                    </LinearGradient>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(6,3,16,0.74)",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
    },
    cardWrap: {
        width: "100%",
        maxWidth: 330,
        borderRadius: 28,
        shadowColor: SHEET.accent,
        shadowOpacity: 0.35,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 0 },
        elevation: 12,
    },
    card: {
        borderRadius: 28,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,111,163,0.28)",
    },
    hero: { width: "100%", aspectRatio: 881 / 768 * 1.12, backgroundColor: CARD_TOP },
    heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 70 },
    content: { alignItems: "center", paddingHorizontal: 22, paddingBottom: 16, marginTop: -18 },
    title: { color: "#fff", fontSize: 21, fontWeight: "900", textAlign: "center" },
    body: {
        color: "rgba(255,255,255,0.66)", fontSize: 13.5, lineHeight: 19,
        textAlign: "center", marginTop: 8,
    },
    cta: {
        height: 50, minWidth: 236, borderRadius: 25,
        flexDirection: "row", gap: 8,
        alignItems: "center", justifyContent: "center", marginTop: 18,
        shadowColor: SHEET.accent, shadowOpacity: 0.5, shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    later: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, marginTop: 2 },
    laterText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600" },
});
