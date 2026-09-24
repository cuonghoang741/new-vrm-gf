import React, { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { IconBadge3d } from "@tabler/icons-react-native";
import { SHEET } from "../../theme/sheet";

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

                <Animated.View style={[styles.card, { opacity: pop, transform: [{ scale }] }]}>
                    <LinearGradient
                        colors={["#C9A6FF", "#7A4DFF"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.halo}
                    >
                        <View style={styles.haloInner}>
                            <IconBadge3d size={40} color="#C9A6FF" />
                        </View>
                    </LinearGradient>

                    <Text style={styles.title}>{t("trial3d.title", { n: minutes })}</Text>
                    <Text style={styles.body}>{t("trial3d.body")}</Text>

                    <Pressable onPress={onStart} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                        <LinearGradient
                            colors={SHEET.accentGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <Text style={styles.ctaText}>{t("trial3d.cta")}</Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                        <Text style={styles.laterText}>{t("trial3d.later")}</Text>
                    </Pressable>
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
    card: {
        width: "100%",
        maxWidth: 330,
        borderRadius: 28,
        backgroundColor: "#171026",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        paddingHorizontal: 22,
        paddingTop: 26,
        paddingBottom: 18,
    },
    halo: {
        width: 88, height: 88, borderRadius: 44,
        alignItems: "center", justifyContent: "center",
        marginBottom: 16,
    },
    haloInner: {
        width: 76, height: 76, borderRadius: 38,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "#171026",
    },
    title: { color: "#fff", fontSize: 19, fontWeight: "900", textAlign: "center" },
    body: {
        color: "rgba(255,255,255,0.6)", fontSize: 13.5, lineHeight: 19,
        textAlign: "center", marginTop: 8,
    },
    cta: {
        height: 50, minWidth: 236, borderRadius: 25,
        alignItems: "center", justifyContent: "center", marginTop: 20,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    later: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, marginTop: 2 },
    laterText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600" },
});
