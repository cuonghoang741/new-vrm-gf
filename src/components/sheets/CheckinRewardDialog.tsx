import React, { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { IconFlame } from "@tabler/icons-react-native";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";

/**
 * The daily reward, as a moment rather than a warning.
 *
 * This used to be `Alert.alert`. An OS alert is the system's way of saying
 * something went wrong — the same grey box a failure uses — which is exactly
 * the wrong frame for the one screen in the app that exists to say "here, this
 * is yours". It also cannot show the ruby, the streak or the PRO doubling,
 * so the reward arrived as a sentence instead of a thing.
 */
export function CheckinRewardDialog({
    visible,
    day,
    ruby,
    doubled,
    onClose,
}: {
    visible: boolean;
    /** Which day of the streak was just claimed. */
    day: number;
    ruby: number;
    /** PRO's ×2 applied to this payout. */
    doubled?: boolean;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const pop = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) {
            pop.setValue(0);
            return;
        }
        Animated.spring(pop, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
            tension: 90,
        }).start();
    }, [visible, pop]);

    const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View style={[styles.card, { opacity: pop, transform: [{ scale }] }]}>
                    <LinearGradient
                        colors={["#FF6FA3", "#FF2E74"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.halo}
                    >
                        <View style={styles.haloInner}>
                            <RubyIcon size={42} color={SHEET.ruby} />
                        </View>
                    </LinearGradient>

                    <Text style={styles.title}>{t("checkin.claimed_title")}</Text>

                    <View style={styles.amountRow}>
                        <RubyIcon size={22} color={SHEET.ruby} />
                        <Text style={styles.amount}>+{ruby.toLocaleString()}</Text>
                        {doubled && (
                            <LinearGradient colors={SHEET.goldGradient} style={styles.x2}>
                                <Text style={styles.x2Text}>×2</Text>
                            </LinearGradient>
                        )}
                    </View>

                    <View style={styles.streakRow}>
                        <IconFlame size={15} color="#FF8C00" fill="#FF8C00" />
                        <Text style={styles.streakText}>{t("checkin.day_n", { n: day })}</Text>
                    </View>

                    <Pressable onPress={onClose} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                        <LinearGradient
                            colors={["#FF6FA3", "#FF2E74"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <Text style={styles.ctaText}>{t("common.continue")}</Text>
                        </LinearGradient>
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
        maxWidth: 320,
        borderRadius: 28,
        backgroundColor: "#171026",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        paddingHorizontal: 22,
        paddingTop: 26,
        paddingBottom: 20,
    },
    halo: {
        width: 92, height: 92, borderRadius: 46,
        alignItems: "center", justifyContent: "center",
        marginBottom: 18,
    },
    haloInner: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "#171026",
    },
    title: { color: "#fff", fontSize: 19, fontWeight: "900", textAlign: "center" },
    amountRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14 },
    amount: { color: SHEET.ruby, fontSize: 30, fontWeight: "900" },
    x2: { paddingHorizontal: 8, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    x2Text: { color: "#2A1A00", fontSize: 12, fontWeight: "900" },
    streakRow: {
        flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12,
        paddingHorizontal: 12, height: 28, borderRadius: 14,
        backgroundColor: "rgba(255,140,0,0.14)",
    },
    streakText: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: "700" },
    cta: {
        height: 50, minWidth: 236, borderRadius: 25,
        alignItems: "center", justifyContent: "center", marginTop: 22,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
