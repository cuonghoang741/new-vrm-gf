import React, { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Platform } from "react-native";
import { submitRating } from "../../services/economyService";
import { openBrowserSafe } from "../../utils/openBrowserSafe";
import { analyticsService } from "../../services/AnalyticsService";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";

const STORE_NATIVE = Platform.OS === "ios"
    ? "itms-apps://apps.apple.com/app/id6760695348?action=write-review"
    : "market://details?id=com.truemate.girlfriend";
const STORE_WEB = Platform.OS === "ios"
    ? "https://apps.apple.com/app/id6760695348?action=write-review"
    : "https://play.google.com/store/apps/details?id=com.truemate.girlfriend";

async function openStore() {
    try {
        if (await Linking.canOpenURL(STORE_NATIVE)) return await Linking.openURL(STORE_NATIVE);
    } catch { /* fall through */ }
    openBrowserSafe(STORE_WEB);
}

/**
 * Ask for a rating in the app, then decide what to do with it.
 *
 * Five stars opens the store's review page; anything less is kept here with
 * whatever the person wants to tell us. Every star is logged either way, so
 * the score inside the app is the honest one even when the store's is not.
 *
 * ⚠️ Both stores forbid choosing who sees the review page based on a rating
 * collected first, and forbid paying for reviews. See the migration
 * `20260923070000_app_ratings.sql` for the two lines that make this
 * compliant if you want it to be.
 */
export function RatingDialog({
    visible,
    onClose,
    onRated,
    rewardRuby,
}: {
    visible: boolean;
    onClose: () => void;
    /** Fired after a successful submit, so the quest list can refresh. */
    onRated?: (stars: number) => void;
    /** Shown on the CTA when the rating quest is still unclaimed. */
    rewardRuby?: number;
}) {
    const { t } = useTranslation();
    const [stars, setStars] = useState(0);
    const [comment, setComment] = useState("");
    const [busy, setBusy] = useState(false);
    const [thanks, setThanks] = useState(false);

    const close = () => {
        setStars(0);
        setComment("");
        setThanks(false);
        onClose();
    };

    const submit = async () => {
        if (!stars || busy) return;
        setBusy(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        void analyticsService.logEvent("rate", { stars, source: "dialog" });
        const res = await submitRating(stars, comment);
        setBusy(false);
        onRated?.(stars);
        if (res?.open_store) {
            close();
            void openStore();
            return;
        }
        // Under five: keep it here. The comment box is the point of this path.
        setThanks(true);
    };

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} />
                <View style={styles.card}>
                    {thanks ? (
                        <>
                            <Text style={styles.title}>{t("rate.thanks_title")}</Text>
                            <Text style={styles.body}>{t("rate.thanks_body")}</Text>
                            <Pressable onPress={close} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                                <LinearGradient colors={SHEET.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                                    <Text style={styles.ctaText}>{t("common.continue")}</Text>
                                </LinearGradient>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <Text style={styles.title}>{t("rate.title")}</Text>
                            <Text style={styles.body}>{t("rate.body")}</Text>

                            <View style={styles.stars}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <Pressable
                                        key={n}
                                        hitSlop={6}
                                        onPress={() => {
                                            Haptics.selectionAsync();
                                            setStars(n);
                                        }}
                                    >
                                        <Ionicons
                                            name={n <= stars ? "star" : "star-outline"}
                                            size={38}
                                            color={n <= stars ? "#FFC400" : "rgba(255,255,255,0.28)"}
                                        />
                                    </Pressable>
                                ))}
                            </View>

                            {stars > 0 && stars < 5 && (
                                <TextInput
                                    style={styles.input}
                                    value={comment}
                                    onChangeText={setComment}
                                    placeholder={t("rate.comment_ph")}
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    multiline
                                    maxLength={500}
                                />
                            )}

                            <Pressable
                                onPress={submit}
                                disabled={!stars || busy}
                                style={({ pressed }) => [pressed && { opacity: 0.9 }, !stars && { opacity: 0.45 }]}
                            >
                                <LinearGradient colors={SHEET.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                                    <Text style={styles.ctaText}>{busy ? "…" : t("rate.submit")}</Text>
                                    {!!rewardRuby && stars === 5 && (
                                        <View style={styles.reward}>
                                            <RubyIcon size={13} color="#fff" />
                                            <Text style={styles.rewardText}>+{rewardRuby}</Text>
                                        </View>
                                    )}
                                </LinearGradient>
                            </Pressable>

                            <Pressable onPress={close} hitSlop={8} style={styles.later}>
                                <Text style={styles.laterText}>{t("common.cancel")}</Text>
                            </Pressable>
                        </>
                    )}
                </View>
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
        maxWidth: 340,
        borderRadius: 26,
        backgroundColor: "#171026",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 22,
        paddingTop: 24,
        paddingBottom: 18,
    },
    title: { color: "#fff", fontSize: 19, fontWeight: "900", textAlign: "center" },
    body: { color: "rgba(255,255,255,0.6)", fontSize: 13.5, lineHeight: 19, textAlign: "center", marginTop: 8 },
    stars: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 18, marginBottom: 6 },
    input: {
        marginTop: 12,
        minHeight: 74,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        color: "#fff",
        fontSize: 14,
        padding: 12,
        textAlignVertical: "top",
    },
    cta: {
        height: 50, borderRadius: 25, marginTop: 18,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    reward: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, height: 22, borderRadius: 11,
        backgroundColor: "rgba(0,0,0,0.25)",
    },
    rewardText: { color: "#fff", fontSize: 12, fontWeight: "900" },
    later: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, marginTop: 4 },
    laterText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600" },
});
