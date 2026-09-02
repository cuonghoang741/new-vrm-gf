import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, SafeAreaView } from "react-native";
import { useTranslation } from "react-i18next";
import { analyticsService } from "../services/AnalyticsService";
import { NativeAdCard } from "../components/ads/NativeAdCard";

/**
 * Shown on a returning session (2nd cold start onward) before the main screen —
 * Yuuki-style welcome-back: a warm greeting, a small native ad, and a Continue
 * button. First install skips it; PRO users see it without the ad (it collapses).
 */
export default function WelcomeBackScreen({ onContinue }: { onContinue: () => void }) {
    const { t } = useTranslation();

    useEffect(() => {
        analyticsService.logWelcomeBackView();
    }, []);

    const handleContinue = () => {
        analyticsService.logWelcomeBackContinue();
        onContinue();
    };
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.hero}>
                <View style={styles.heartWrap}>
                    <Text style={styles.heart}>💗</Text>
                </View>
                <Text style={styles.title}>{t("welcome.title")}</Text>
                <Text style={styles.subtitle}>{t("welcome.subtitle")}</Text>
            </View>

            {/* native_welcome_back — collapses for PRO / no-fill */}
            <View style={styles.adSlot}>
                <NativeAdCard />
            </View>

            <Pressable style={styles.cta} onPress={handleContinue}>
                <Text style={styles.ctaText}>{t("common.continue")}</Text>
            </Pressable>
        </SafeAreaView>
    );
}

const PINK = "#FF6FA5";

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a", justifyContent: "space-between" },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
    heartWrap: {
        width: 108,
        height: 108,
        borderRadius: 54,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,111,165,0.14)",
        borderWidth: 1,
        borderColor: "rgba(255,111,165,0.5)",
        marginBottom: 26,
    },
    heart: { fontSize: 52 },
    title: { color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "center" },
    subtitle: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 15.5,
        textAlign: "center",
        marginTop: 12,
        lineHeight: 22,
    },
    adSlot: { paddingHorizontal: 20, marginBottom: 8 },
    cta: {
        marginHorizontal: 20,
        marginBottom: 20,
        height: 56,
        borderRadius: 28,
        backgroundColor: PINK,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
