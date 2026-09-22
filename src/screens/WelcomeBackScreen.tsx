import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
// react-native's SafeAreaView is an iOS-only no-op, so on Android this screen
// ran under the status bar and the gesture bar.
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { analyticsService } from "../services/AnalyticsService";
import { playResumeAd } from "../services/resumeGate";
import { NativeAdCard } from "../components/ads/NativeAdCard";
import { getPreviousOpenAt } from "../services/session";
import { track } from "../services/trackEvents";
import { SHEET } from "../theme/sheet";
import type { CachedCharacter } from "./play/cache";

const { height } = Dimensions.get("window");

/**
 * Shown on a returning session (2nd cold start onward) before the main screen.
 *
 * It is built around the character the user left off with — her art fills the
 * screen, blurred, with her portrait in a lit ring above the greeting — so the
 * screen reads as "she is waiting" rather than as an ad holder. It used to be
 * a bare heart emoji on a black background.
 *
 * The native ad keeps its slot (it is why this screen exists commercially),
 * but sits in its own panel above the CTA, clearly separated from the content.
 */
export default function WelcomeBackScreen({
    onContinue,
    playAdOnContinue = false,
}: {
    onContinue: () => void;
    /**
     * Set when this screen is standing in for the old auto-firing resume ad:
     * the App Open ad plays on the CTA, then we continue. The ad is therefore
     * something the user walked into, not something that ambushed them the
     * instant they reopened the app.
     */
    playAdOnContinue?: boolean;
}) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [last, setLast] = useState<CachedCharacter | null>(null);

    useEffect(() => {
        analyticsService.logWelcomeBackView();
        track.welcomeBackView();
        SecureStore.getItemAsync("play_last_character")
            .then((raw) => setLast(raw ? (JSON.parse(raw) as CachedCharacter) : null))
            .catch(() => setLast(null));
    }, []);

    /** "away for 3 hours" — only when it is a meaningful gap. */
    const away = useMemo(() => {
        const prev = getPreviousOpenAt();
        if (!prev) return null;
        const hours = Math.floor((Date.now() - prev) / 3_600_000);
        if (hours >= 24) return t("welcome.away_days", { n: Math.floor(hours / 24) });
        if (hours >= 1) return t("welcome.away_hours", { n: hours });
        return null;
    }, [t]);

    const portrait = last?.smallThumbUrl || last?.thumbnailUrl || last?.avatarUrl || null;
    const scene = last?.avatarUrl || last?.thumbnailUrl || null;

    const [leaving, setLeaving] = useState(false);
    const handleContinue = async () => {
        if (leaving) return;
        setLeaving(true);
        analyticsService.logWelcomeBackContinue();
        if (playAdOnContinue) await playResumeAd();
        onContinue();
    };

    return (
        <View style={styles.container}>
            {/* Her art, blurred, as the room she is waiting in. */}
            <LinearGradient colors={[SHEET.bgTop, SHEET.bgBottom]} style={StyleSheet.absoluteFill} />
            {!!scene && (
                <Image
                    source={{ uri: scene }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    contentPosition="top center"
                    blurRadius={40}
                    transition={300}
                />
            )}
            <LinearGradient
                colors={["rgba(15,10,30,0.35)", "rgba(15,10,30,0.72)", "rgba(15,10,30,0.97)"]}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
            />

            <SafeAreaView style={styles.safe}>
                <Pressable
                    onPress={handleContinue}
                    hitSlop={12}
                    // `position: absolute` ignores SafeAreaView's padding, so the
                    // inset has to be added here or the pill sits in the notch.
                    style={({ pressed }) => [styles.skip, { top: insets.top + 8 }, pressed && { opacity: 0.7 }]}
                >
                    <Text style={styles.skipText}>{t("welcome.cta")}</Text>
                    <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.9)" />
                </Pressable>

                <View style={styles.hero}>
                    <View style={styles.ringOuter}>
                        <LinearGradient colors={SHEET.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
                            <View style={styles.ringInner}>
                                {portrait ? (
                                    <Image source={{ uri: portrait }} style={styles.portrait} contentFit="cover" contentPosition="top center" transition={200} />
                                ) : (
                                    <Ionicons name="heart" size={54} color={SHEET.accent} />
                                )}
                            </View>
                        </LinearGradient>
                    </View>

                    {!!away && (
                        <View style={styles.awayPill}>
                            <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.75)" />
                            <Text style={styles.awayText}>{away}</Text>
                        </View>
                    )}

                    <Text style={styles.title}>{t("welcome.title_plain")}</Text>
                    {!!last?.characterName && <Text style={styles.name}>{last.characterName}</Text>}
                    <Text style={styles.subtitle}>
                        {last?.characterName ? t("welcome.subtitle_named", { name: last.characterName }) : t("welcome.subtitle")}
                    </Text>
                </View>

                {/* The whole lower half belongs to the ad, with its own
                    full-width CTA. The way forward is the small outline pill in
                    the corner instead of a big gradient button that competed
                    with the ad's button directly above it. */}
                <View style={styles.bottom}>
                    <NativeAdCard placement="native_welcome_back" fullWidthCta />
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: SHEET.bgBottom },
    safe: { flex: 1, justifyContent: "space-between" },
    hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingTop: height * 0.04 },
    ringOuter: {
        shadowColor: SHEET.accent,
        shadowOpacity: 0.55,
        shadowRadius: 26,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
    },
    ring: { width: 148, height: 148, borderRadius: 74, alignItems: "center", justifyContent: "center" },
    ringInner: {
        width: 138,
        height: 138,
        borderRadius: 69,
        overflow: "hidden",
        backgroundColor: "rgba(20,12,36,0.9)",
        alignItems: "center",
        justifyContent: "center",
    },
    portrait: { width: 138, height: 138 },
    awayPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 22,
        paddingHorizontal: 12,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },
    awayText: { color: "rgba(255,255,255,0.75)", fontSize: 12.5, fontWeight: "600" },
    title: { color: "rgba(255,255,255,0.82)", fontSize: 19, fontWeight: "700", textAlign: "center", marginTop: 20 },
    name: { color: "#fff", fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: 4, letterSpacing: 0.3 },
    subtitle: {
        color: "rgba(255,255,255,0.62)",
        fontSize: 15,
        textAlign: "center",
        marginTop: 10,
        lineHeight: 21,
    },
    // Yuuki's exact inset for this card: fromLTRB(20, 14, 20, 18).
    bottom: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },
    skip: {
        position: "absolute",
        right: 16,
        zIndex: 5,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingLeft: 14,
        paddingRight: 10,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.35)",
        backgroundColor: "rgba(0,0,0,0.25)",
    },
    skipText: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "700" },
});
