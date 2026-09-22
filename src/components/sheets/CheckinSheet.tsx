import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Animated, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { analyticsService } from "../../services/AnalyticsService";
import { IconFlame } from "@tabler/icons-react-native";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { CHECKIN_CYCLE, claimDailyReward, getCheckinState, type CheckinState } from "../../services/checkinService";
import { setRuby as setRubyStore } from "../../services/rubyStore";
import { track } from "../../services/trackEvents";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import { CheckinRewardDialog } from "./CheckinRewardDialog";

interface Props {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    userId?: string;
    /** Called after a successful claim so the parent can refresh ruby balance. */
    onClaimed?: (rubyBalance: number) => void;
    /** Selected character's picture, blurred behind the sheet (Yuuki style). */
    sceneImage?: string | null;
    /** Opens the paywall from the "PRO doubles this" banner. */
    onOpenSubscription?: () => void;
}

export type CheckinSheetRef = BottomSheetRef;

/**
 * Daily check-in.
 *
 * Built around the streak, not a spreadsheet of thirty cells: a flame with the
 * day count, then the next three days so the user can see what waiting one
 * more day buys, then the full cycle. PRO doubles every reward — the server
 * already returns the doubled figures (app_checkin_state), and the banner says
 * so, since "×2 ruby" is one of the things PRO is sold on.
 */
const CheckinSheet = forwardRef<CheckinSheetRef, Props>(
    ({ isOpened, onIsOpenedChange, userId, onClaimed, sceneImage, onOpenSubscription }, ref) => {
        const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
        const [state, setState] = useState<CheckinState | null>(null);
        const [loading, setLoading] = useState(false);
        const [busy, setBusy] = useState(false);
        /** Non-null while the reward dialog is up. */
        const [reward, setReward] = useState<{ day: number; ruby: number; doubled: boolean } | null>(null);
        const pulse = useRef(new Animated.Value(0.35)).current;

        useImperativeHandle(ref, () => ({
            present: (i?: number) => sheetRef.current?.present(i),
            dismiss: () => sheetRef.current?.dismiss(),
        }));

        const refresh = useCallback(async () => {
            if (!userId) return null;
            setLoading(true);
            try {
                const s = await getCheckinState();
                if (s) {
                    setState(s);
                    setRubyStore(s.ruby);
                }
                return s;
            } finally {
                setLoading(false);
            }
        }, [userId]);

        useEffect(() => {
            if (!isOpened) return;
            refresh();
            analyticsService.logCheckinOpen(state?.currentDay ?? 0);
            track.streakView(state?.currentDay ?? 0, state?.totalDays ?? 0);
        }, [isOpened, refresh]);

        const showSkeleton = loading && !state;
        useEffect(() => {
            if (!showSkeleton) return;
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
                    Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
                ])
            );
            loop.start();
            return () => loop.stop();
        }, [showSkeleton, pulse]);

        const currentDay = state?.currentDay ?? 0;
        const nextDay = (currentDay % CHECKIN_CYCLE) + 1;
        const claimedToday = !!state?.claimedToday;
        const canClaim = !!userId && !!state && !claimedToday;
        const rewardFor = (day: number) => state?.schedule.find((r) => r.day === day)?.ruby ?? 0;
        // The server already doubled every figure for PRO; this labels them.
        const multiplier = state?.multiplier ?? 1;
        const upcoming = [0, 1, 2].map((i) => ((nextDay - 1 + i) % CHECKIN_CYCLE) + 1);

        const onClaim = useCallback(() => {
            if (!userId || !canClaim || busy) return;
            setBusy(true);
            track.streakCheckinSelect(nextDay, rewardFor(nextDay));
            // No interstitial here on purpose: an ad on top of "here is your
            // daily reward" is the moment users quit over.
            void (async () => {
                try {
                    const res = await claimDailyReward(userId);
                    if (res.ok) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        analyticsService.logCheckinClaim(res.day, res.ruby, "ruby");
                        track.streakCheckinSuccess(res.day, res.ruby, !!state?.isPro);
                        const fresh = await refresh();
                        // Read the balance from the same refresh rather than
                        // firing a second round-trip, and always notify the
                        // caller — the streak badge and ruby pill outside the
                        // sheet have no other way to learn this happened.
                        const bal = fresh?.ruby;
                        if (typeof bal === "number") setRubyStore(bal);
                        onClaimed?.(typeof bal === "number" ? bal : 0);
                        setReward({ day: res.day, ruby: res.ruby, doubled: (state?.multiplier ?? 1) > 1 });
                    } else if (res.already) {
                        analyticsService.logCheckinAlreadyClaimed(currentDay);
                        Alert.alert(t("checkin.already_title"), t("checkin.already_body"));
                        await refresh();
                    } else {
                        Alert.alert(t("checkin.fail_title"), res.error || t("checkin.fail_body"));
                    }
                } finally {
                    setBusy(false);
                }
            })();
        }, [userId, canClaim, busy, refresh, onClaimed, nextDay, state?.isPro, currentDay, t]);

        return (
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title={t("checkin.title")}
                subtitle={t("checkin.subtitle_short")}
                sceneImage={sceneImage ?? null}
                detents={[0.85, 0.95]}
            >
                <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                    {/* Streak */}
                    <View style={styles.streakRow}>
                        <LinearGradient colors={currentDay > 0 ? ["#FFC400", "#FF8C00"] : ["rgba(255,255,255,0.18)", "rgba(255,255,255,0.08)"]} style={styles.flame}>
                            <IconFlame size={30} color="#fff" fill="#fff" />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.streakValue}>
                                {currentDay}
                                <Text style={styles.streakMax}> / {CHECKIN_CYCLE}</Text>
                            </Text>
                            <Text style={styles.streakLabel}>{t("checkin.streak_label")}</Text>
                        </View>
                        <View style={styles.balance}>
                            <RubyIcon size={14} color={SHEET.ruby} />
                            <Text style={styles.balanceText}>{state?.ruby ?? "—"}</Text>
                        </View>
                    </View>

                    {/* PRO ×2 */}
                    {state?.isPro ? (
                        <View style={[styles.proBanner, styles.proBannerOn]}>
                            <Ionicons name="flash" size={16} color={SHEET.gold} />
                            <Text style={styles.proOnText}>{t("checkin.pro_active")}</Text>
                        </View>
                    ) : (
                        <Pressable onPress={onOpenSubscription} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                            <LinearGradient colors={["#3B2300", "#2A1440"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.proBanner}>
                                <Ionicons name="flash" size={16} color={SHEET.gold} />
                                <Text style={styles.proText}>{t("checkin.pro_upsell")}</Text>
                                <Ionicons name="chevron-forward" size={16} color={SHEET.gold} />
                            </LinearGradient>
                        </Pressable>
                    )}

                    {/* The next three days */}
                    <View style={styles.upcoming}>
                        {upcoming.map((day, i) => {
                            const isNext = i === 0 && !claimedToday;
                            return (
                                <View key={day} style={[styles.upcomingCard, isNext && styles.upcomingCardNext]}>
                                    <Text style={[styles.upcomingDay, isNext && { color: "#fff" }]}>{t("checkin.day_n", { n: day })}</Text>
                                    <View style={styles.upcomingReward}>
                                        <RubyIcon size={13} color={isNext ? "#fff" : SHEET.ruby} />
                                        <Text style={[styles.upcomingValue, isNext && { color: "#fff" }]}>{rewardFor(day)}</Text>
                                        {multiplier > 1 && (
                                            <View style={styles.x2}>
                                                <Text style={styles.x2Text}>×{multiplier}</Text>
                                            </View>
                                        )}
                                    </View>
                                    {isNext && <Text style={styles.todayTag}>{t("checkin.today")}</Text>}
                                </View>
                            );
                        })}
                    </View>

                    {/* Whole cycle */}
                    <Text style={styles.sectionLabel}>{t("checkin.cycle_label", { n: CHECKIN_CYCLE })}</Text>
                    <View style={styles.grid}>
                        {(showSkeleton ? Array.from({ length: CHECKIN_CYCLE }, (_, i) => ({ day: i + 1, ruby: 0 })) : state?.schedule ?? []).map((r) => {
                            const claimed = r.day <= currentDay;
                            const isNext = canClaim && r.day === nextDay;
                            return (
                                <Animated.View
                                    key={r.day}
                                    style={[
                                        styles.cell,
                                        showSkeleton && { opacity: pulse },
                                        r.ruby > 0 && styles.cellRuby,
                                        claimed && styles.cellClaimed,
                                        isNext && styles.cellToday,
                                    ]}
                                >
                                    <Text style={[styles.dayLabel, isNext && { color: "#fff" }]}>{r.day}</Text>
                                    {claimed ? (
                                        <Ionicons name="checkmark" size={15} color={SHEET.ruby} />
                                    ) : r.ruby > 0 ? (
                                        <View style={styles.rubyTag}>
                                            <RubyIcon size={10} color={isNext ? "#fff" : multiplier > 1 ? SHEET.gold : "#FF8FB8"} />
                                            <Text
                                                style={[
                                                    styles.rubyTagText,
                                                    multiplier > 1 && { color: SHEET.gold },
                                                    isNext && { color: "#fff" },
                                                ]}
                                            >
                                                {r.ruby}
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.noReward}>—</Text>
                                    )}
                                </Animated.View>
                            );
                        })}
                    </View>
                </ScrollView>

                <View style={styles.ctaWrap}>
                    <Pressable onPress={onClaim} disabled={!canClaim || busy}>
                        <LinearGradient
                            colors={canClaim && !busy ? SHEET.accentGradient : ["#3A2A4A", "#3A2A4A"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            {busy || !state ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name={claimedToday ? "checkmark-done" : "gift"} size={18} color="#fff" />
                                    <Text style={styles.ctaText}>
                                        {claimedToday
                                            ? t("checkin.come_back")
                                            : t("checkin.claim_n", { n: rewardFor(nextDay) })}
                                    </Text>
                                    {!claimedToday && multiplier > 1 && (
                                        <View style={styles.x2}>
                                            <Text style={styles.x2Text}>×{multiplier}</Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                </View>
                <CheckinRewardDialog
                    visible={!!reward}
                    day={reward?.day ?? 0}
                    ruby={reward?.ruby ?? 0}
                    doubled={reward?.doubled}
                    onClose={() => setReward(null)}
                />
            </BottomSheet>
        );
    }
);

export default CheckinSheet;

const styles = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingBottom: 16 },
    streakRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
    flame: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" },
    streakValue: { color: "#fff", fontSize: 30, fontWeight: "900" },
    streakMax: { color: "rgba(255,255,255,0.35)", fontSize: 17, fontWeight: "700" },
    streakLabel: { color: SHEET.textMuted, fontSize: 12.5, marginTop: 2 },
    balance: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 11,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.3)",
        borderWidth: 1,
        borderColor: "rgba(255,111,165,0.4)",
    },
    balanceText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    proBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,215,0,0.35)",
        marginBottom: 16,
    },
    proBannerOn: { backgroundColor: "rgba(255,215,0,0.12)" },
    proText: { flex: 1, color: "#FFD98A", fontSize: 13, fontWeight: "700" },
    proOnText: { flex: 1, color: SHEET.gold, fontSize: 13, fontWeight: "800" },
    upcoming: { flexDirection: "row", gap: 10 },
    upcomingCard: {
        flex: 1,
        borderRadius: 16,
        paddingVertical: 12,
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    upcomingCardNext: { backgroundColor: SHEET.accent, borderColor: SHEET.accent },
    upcomingDay: { color: SHEET.textMuted, fontSize: 12, fontWeight: "700" },
    upcomingReward: { flexDirection: "row", alignItems: "center", gap: 4 },
    x2: { backgroundColor: SHEET.gold, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 },
    x2Text: { color: "#2A1A00", fontSize: 11, fontWeight: "900" },
    upcomingValue: { color: "#fff", fontSize: 16, fontWeight: "800" },
    todayTag: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
    sectionLabel: { color: SHEET.textMuted, fontSize: 12.5, fontWeight: "700", marginTop: 18, marginBottom: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    cell: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
    },
    cellRuby: { borderColor: "rgba(255,143,184,0.4)" },
    cellClaimed: { backgroundColor: "rgba(255,111,165,0.12)", borderColor: "rgba(255,111,165,0.4)" },
    cellToday: { backgroundColor: SHEET.accent, borderColor: SHEET.accent },
    dayLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
    rubyTag: { flexDirection: "row", alignItems: "center", gap: 2 },
    rubyTagText: { color: "#FF8FB8", fontSize: 11.5, fontWeight: "700" },
    noReward: { color: "rgba(255,255,255,0.25)", fontSize: 13 },
    ctaWrap: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 8 },
    cta: {
        height: 54,
        borderRadius: 27,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    ctaText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
