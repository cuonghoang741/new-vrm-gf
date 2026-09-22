import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconCrown, IconPlayerPlayFilled } from "@tabler/icons-react-native";
import RubyIcon from "../../components/icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import { QuestRow } from "./QuestRow";
import { RubyShop } from "./RubyShop";
import { useRewardedAd } from "../../hooks/useRewardedAd";
import { AdUnits } from "../../config/ads";
import {
    claimProBonus,
    claimQuest,
    getQuestState,
    rewardAd,
    type Quest,
    type QuestState,
} from "../../services/economyService";
import { setRuby, useRuby } from "../../services/rubyStore";
import { track } from "../../services/trackEvents";

/** Where a quest's "Go" button takes the user. */
export type QuestTarget = "checkin" | "chat" | "costume" | "background" | "dance" | "gallery";
const GO_FOR_EVENT: Record<string, QuestTarget> = {
    checkin: "checkin",
    checkin_days: "checkin",
    chat: "chat",
    change_outfit: "costume",
    outfits_owned: "costume",
    change_background: "background",
    backgrounds_owned: "background",
    dance: "dance",
    dances_owned: "dance",
    open_gallery: "gallery",
};

type Props = {
    visible: boolean;
    onClose: () => void;
    isPro: boolean;
    sceneImage?: string | null;
    onOpenSubscription: () => void;
    onGo: (target: QuestTarget) => void;
};

/**
 * The Quest page — opened by the diamond button and the gift button.
 * One scroll, in the order a free user needs it: PRO, free ruby from videos
 * (5 a day), daily / special quests, then the ruby shop.
 */
export function QuestPage({ visible, onClose, isPro, sceneImage, onOpenSubscription, onGo }: Props) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const ruby = useRuby();
    const [state, setState] = useState<QuestState | null>(null);
    const [failed, setFailed] = useState(false);
    const [tab, setTab] = useState<"daily" | "special">("daily");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [adBusy, setAdBusy] = useState(false);
    const [now, setNow] = useState(Date.now());
    const { showForGate } = useRewardedAd(AdUnits.rewarded, "ruby_reward");

    const refresh = useCallback(async () => {
        const s = await getQuestState();
        if (s) {
            setState(s);
            setRuby(s.ruby);
            setFailed(false);
        } else {
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        refresh();
        track.heartsStoreView("home", ruby ?? 0);
    }, [visible, refresh]);

    // Ticks only while a cooldown is showing.
    const nextAtMs = state?.ads.nextAt ? Date.parse(state.ads.nextAt) : 0;
    const cooldown = Math.max(0, Math.ceil((nextAtMs - now) / 1000));
    useEffect(() => {
        if (!visible || nextAtMs <= Date.now()) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [visible, nextAtMs]);

    const quests = useMemo(() => (state?.quests ?? []).filter((q) => q.kind === tab), [state, tab]);
    const claimable = (kind: "daily" | "special") =>
        (state?.quests ?? []).filter((q) => q.kind === kind && !q.claimed && q.progress >= q.target).length;

    const onClaim = useCallback(
        async (q: Quest) => {
            setBusyId(q.id);
            const res = await claimQuest(q.id);
            setBusyId(null);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRuby(res.ruby);
                track.dailyTaskCompleted(q.id, res.reward);
            }
            refresh();
        },
        [refresh]
    );

    const watchAd = useCallback(async () => {
        if (adBusy) return;
        setAdBusy(true);
        track.rewardWatchSelect();
        try {
            const outcome = await showForGate();
            if (outcome === "unavailable") {
                Alert.alert(t("common.error"), t("ads.no_fill"));
                return;
            }
            if (outcome !== "earned") return;
            const res = await rewardAd();
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRuby(res.ruby);
                track.rewardEarned(res.reward);
            } else if (res.error === "daily_limit") {
                Alert.alert(t("quest.limit_reached"));
            }
            await refresh();
            setNow(Date.now());
        } finally {
            setAdBusy(false);
        }
    }, [adBusy, showForGate, refresh, t]);

    const onProBonus = useCallback(async () => {
        setBusyId("pro_bonus");
        const res = await claimProBonus();
        setBusyId(null);
        if (res.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setRuby(res.ruby);
        } else if (res.error === "not_pro") {
            // Store PRO not yet mirrored by the webhook — a moment after purchase.
            Alert.alert(t("quest.pro_syncing"));
        }
        refresh();
    }, [refresh, t]);

    const ads = state?.ads;
    const adsLeft = ads ? Math.max(0, ads.limit - ads.watched) : 0;
    const serverPro = !!state?.isPro;
    // Local midnight-UTC in the user's clock, for "resets at".
    const resetAt = useMemo(() => {
        const d = new Date();
        d.setUTCHours(24, 0, 0, 0);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }, [state?.day]);

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root}>
                <LinearGradient colors={[SHEET.bgTop, SHEET.bgBottom]} style={StyleSheet.absoluteFill} />
                {!!sceneImage && (
                    <Image source={{ uri: sceneImage }} style={styles.heroImage} contentFit="cover" contentPosition="top center" blurRadius={30} />
                )}
                <LinearGradient colors={["rgba(15,10,30,0.35)", SHEET.bgBottom]} locations={[0, 0.42]} style={StyleSheet.absoluteFill} />

                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                    </Pressable>
                    <Text style={styles.headerTitle}>{t("quest.title")}</Text>
                    <View style={styles.balance}>
                        <RubyIcon size={15} color={SHEET.ruby} />
                        <Text style={styles.balanceText}>{ruby ?? state?.ruby ?? "—"}</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
                    {/* PRO */}
                    {isPro ? (
                        <View style={[styles.card, styles.proCard]}>
                            <LinearGradient colors={SHEET.goldGradient} style={styles.cardIcon}>
                                <IconCrown size={22} color="#fff" />
                            </LinearGradient>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{t("quest.pro_bonus")}</Text>
                                <Text style={styles.cardBody}>{t("quest.pro_bonus_body", { n: state?.proBonus.amount ?? 30 })}</Text>
                                <View style={styles.x2Row}>
                                    <Ionicons name="flash" size={12} color={SHEET.gold} />
                                    <Text style={styles.x2Text}>{t("quest.pro_x2")}</Text>
                                </View>
                            </View>
                            <Pressable
                                disabled={!state || state.proBonus.claimed || busyId === "pro_bonus" || !serverPro}
                                onPress={onProBonus}
                                style={[styles.smallBtn, { backgroundColor: SHEET.gold }, (!state || state.proBonus.claimed || !serverPro) && styles.smallBtnOff]}
                            >
                                {busyId === "pro_bonus" ? (
                                    <ActivityIndicator size="small" color="#2A1A00" />
                                ) : (
                                    <Text style={[styles.smallBtnText, { color: "#2A1A00" }]}>
                                        {state?.proBonus.claimed ? "✓" : serverPro ? t("quest.claim") : t("quest.pro_syncing_short")}
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable onPress={onOpenSubscription} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
                            <LinearGradient colors={["#3B2300", "#2A1440"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, styles.proCard]}>
                                <LinearGradient colors={SHEET.goldGradient} style={styles.cardIcon}>
                                    <IconCrown size={22} color="#fff" />
                                </LinearGradient>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.cardTitle}>{t("quest.pro_title")}</Text>
                                    <Text style={styles.cardBody}>{t("quest.pro_body_x2", { n: state?.proBonus.amount ?? 30 })}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={SHEET.gold} />
                            </LinearGradient>
                        </Pressable>
                    )}

                    {/* Free ruby from rewarded videos */}
                    <View style={styles.card}>
                        <LinearGradient colors={SHEET.accentGradient} style={styles.cardIcon}>
                            <IconPlayerPlayFilled size={20} color="#fff" />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{t("quest.free_ruby")}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                                <Text style={styles.cardBody}>{t("quest.watch_video")}</Text>
                                <RubyIcon size={11} color={SHEET.ruby} />
                                <Text style={[styles.cardBody, { color: SHEET.ruby, fontWeight: "800" }]}>+{ads?.reward ?? 10}</Text>
                            </View>
                            <View style={styles.dots}>
                                {Array.from({ length: ads?.limit ?? 5 }).map((_, i) => (
                                    <View key={i} style={[styles.dot, i < (ads?.watched ?? 0) && styles.dotOn]} />
                                ))}
                                <Text style={styles.dotsText}>{t("quest.watch_left", { n: ads?.watched ?? 0, limit: ads?.limit ?? 5 })}</Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={watchAd}
                            disabled={!ads || adsLeft === 0 || cooldown > 0 || adBusy}
                            style={[styles.smallBtn, (!ads || adsLeft === 0 || cooldown > 0) && styles.smallBtnOff]}
                        >
                            {adBusy ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.smallBtnText}>
                                    {adsLeft === 0 ? t("quest.tomorrow") : cooldown > 0 ? `${cooldown}s` : t("quest.watch")}
                                </Text>
                            )}
                        </Pressable>
                    </View>

                    {/* Quests */}
                    <View style={styles.tabs}>
                        {(["daily", "special"] as const).map((k) => (
                            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]}>
                                <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{t(`quest.${k}`)}</Text>
                                {claimable(k) > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{claimable(k)}</Text>
                                    </View>
                                )}
                            </Pressable>
                        ))}
                    </View>
                    {tab === "daily" && <Text style={styles.hint}>{t("quest.reset_hint", { time: resetAt })}</Text>}

                    {!state && !failed && <ActivityIndicator color={SHEET.accent} style={{ marginVertical: 30 }} />}
                    {!state && failed && (
                        <Pressable onPress={refresh} style={{ padding: 24, alignItems: "center" }}>
                            <Text style={{ color: "#fff" }}>{t("common.failed_load")}</Text>
                            <Text style={{ color: SHEET.accent, fontWeight: "700", marginTop: 6 }}>{t("common.retry")}</Text>
                        </Pressable>
                    )}
                    {quests.map((q) => {
                        const target = GO_FOR_EVENT[q.event];
                        return (
                            <QuestRow
                                key={q.id}
                                quest={q}
                                busy={busyId === q.id}
                                multiplier={state?.multiplier ?? 1}
                                onClaim={() => onClaim(q)}
                                onGo={
                                    q.event === "watch_ad"
                                        ? adsLeft > 0 && cooldown === 0
                                            ? watchAd
                                            : undefined
                                        : target
                                            ? () => {
                                                track.dailyTaskGo(q.id);
                                                onGo(target);
                                            }
                                            : undefined
                                }
                            />
                        );
                    })}

                    {/* Ruby shop */}
                    <Text style={styles.section}>{t("quest.shop")}</Text>
                    <RubyShop packs={state?.packs ?? {}} />
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SHEET.bgBottom },
    heroImage: { position: "absolute", top: 0, left: 0, right: 0, height: 360, opacity: 0.9 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    back: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "rgba(0,0,0,0.35)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontWeight: "800", marginLeft: 6 },
    balance: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(0,0,0,0.35)",
        borderWidth: 1,
        borderColor: "rgba(255,111,165,0.4)",
    },
    balanceText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    card: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.07)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        marginBottom: 12,
    },
    proCard: { borderColor: "rgba(255,215,0,0.35)" },
    cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    cardTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
    cardBody: { color: SHEET.textMuted, fontSize: 12.5, lineHeight: 17 },
    dots: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
    dot: { width: 14, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.14)" },
    dotOn: { backgroundColor: SHEET.accent },
    dotsText: { color: SHEET.textMuted, fontSize: 11, marginLeft: 4, fontWeight: "600" },
    smallBtn: {
        minWidth: 76,
        height: 34,
        borderRadius: 17,
        backgroundColor: SHEET.accent,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    smallBtnOff: { backgroundColor: SHEET.disabled },
    smallBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    tabs: {
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 4,
        marginTop: 8,
        marginBottom: 8,
    },
    tab: { flex: 1, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
    tabOn: { backgroundColor: SHEET.accent },
    tabText: { color: SHEET.textMuted, fontSize: 14, fontWeight: "700" },
    tabTextOn: { color: "#fff" },
    tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
    tabBadgeText: { color: SHEET.accent, fontSize: 11, fontWeight: "900" },
    hint: { color: SHEET.textFaint, fontSize: 11.5, marginBottom: 10, marginLeft: 4 },
    x2Row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    x2Text: { color: SHEET.gold, fontSize: 11.5, fontWeight: "800" },
    section: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 18, marginBottom: 12 },
});
