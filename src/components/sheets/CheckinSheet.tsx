import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { IconGift, IconDiamondFilled, IconCircleCheckFilled } from "@tabler/icons-react-native";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { useInterstitialAd } from "../../hooks/useInterstitialAd";
import {
    CHECKIN_CYCLE,
    getRewardSchedule,
    getCheckinProgress,
    getRubyBalance,
    claimDailyReward,
    type DayReward,
} from "../../services/checkinService";

interface Props {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    userId?: string;
    /** Called after a successful claim so the parent can refresh ruby balance. */
    onClaimed?: (rubyBalance: number) => void;
}

export type CheckinSheetRef = BottomSheetRef;

const CheckinSheet = forwardRef<CheckinSheetRef, Props>(
    ({ isOpened, onIsOpenedChange, userId, onClaimed }, ref) => {
        const sheetRef = useRef<BottomSheetRef>(null);
        const [schedule, setSchedule] = useState<DayReward[]>([]);
        const [currentDay, setCurrentDay] = useState(0);
        const [claimedToday, setClaimedToday] = useState(false);
        const [ruby, setRuby] = useState(0);
        const [loading, setLoading] = useState(false);
        const [busy, setBusy] = useState(false);
        const { showInterstitial } = useInterstitialAd();

        useImperativeHandle(ref, () => ({
            present: (i?: number) => sheetRef.current?.present(i),
            dismiss: () => sheetRef.current?.dismiss(),
        }));

        const refresh = useCallback(async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const [sch, prog, bal] = await Promise.all([
                    getRewardSchedule(),
                    getCheckinProgress(userId),
                    getRubyBalance(userId),
                ]);
                setSchedule(sch);
                setCurrentDay(prog.currentDay);
                setClaimedToday(prog.claimedToday);
                setRuby(bal);
            } finally {
                setLoading(false);
            }
        }, [userId]);

        useEffect(() => {
            if (isOpened) refresh();
        }, [isOpened, refresh]);

        const nextDay = (currentDay % CHECKIN_CYCLE) + 1;
        const canClaim = !!userId && !claimedToday;

        const onClaim = useCallback(() => {
            if (!userId || !canClaim || busy) return;
            setBusy(true);
            showInterstitial(async () => {
                try {
                    const res = await claimDailyReward(userId);
                    if (res.ok) {
                        const bal = await getRubyBalance(userId);
                        setRuby(bal);
                        onClaimed?.(bal);
                        await refresh();
                        Alert.alert(
                            "🎁 Checked in!",
                            res.ruby > 0
                                ? `Day ${res.day}: +${res.ruby} 💎 ruby! Come back tomorrow 🩷`
                                : `Day ${res.day} done! Keep your streak — bigger ruby rewards ahead 💎`
                        );
                    } else if (res.already) {
                        setClaimedToday(true);
                        Alert.alert("Already checked in", "Come back tomorrow for more ruby 💎");
                    } else {
                        Alert.alert("Oops", res.error || "Could not check in. Try again.");
                    }
                } finally {
                    setBusy(false);
                }
            });
        }, [userId, canClaim, busy, showInterstitial, refresh, onClaimed]);

        return (
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title="Daily Check-in"
                detents={[0.8, 0.92]}
            >
                <View style={styles.container}>
                    <View style={styles.balanceRow}>
                        <IconDiamondFilled size={18} color="#FF6FA5" />
                        <Text style={styles.balanceText}>{ruby} ruby</Text>
                    </View>
                    <Text style={styles.subtitle}>
                        Check in daily to earn ruby — spend it to unlock characters, costumes & backgrounds 💝
                    </Text>

                    {loading ? (
                        <ActivityIndicator color="#FF6FA5" style={{ marginVertical: 30 }} />
                    ) : (
                        <View style={styles.grid}>
                            {schedule.map((r) => {
                                const claimed = r.day <= currentDay;
                                const isNext = canClaim && r.day === nextDay;
                                return (
                                    <View
                                        key={r.day}
                                        style={[
                                            styles.cell,
                                            r.ruby > 0 && styles.cellRuby,
                                            claimed && styles.cellClaimed,
                                            isNext && styles.cellToday,
                                        ]}
                                    >
                                        <Text style={[styles.dayLabel, isNext && styles.dayLabelToday]}>
                                            D{r.day}
                                        </Text>
                                        {claimed ? (
                                            <IconCircleCheckFilled size={18} color="#FF6FA5" />
                                        ) : r.ruby > 0 ? (
                                            <View style={styles.rubyTag}>
                                                <IconDiamondFilled size={11} color={isNext ? "#fff" : "#FF8FB8"} />
                                                <Text style={[styles.rubyTagText, isNext && { color: "#fff" }]}>{r.ruby}</Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.noReward}>—</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    <Pressable
                        onPress={onClaim}
                        disabled={!canClaim || busy}
                        style={[styles.cta, (!canClaim || busy) && styles.ctaDisabled]}
                    >
                        {busy ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <IconGift size={18} color="#fff" />
                                <Text style={styles.ctaText}>
                                    {claimedToday ? "Come back tomorrow" : "Check in today"}
                                </Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </BottomSheet>
        );
    }
);

export default CheckinSheet;

const styles = StyleSheet.create({
    container: { paddingHorizontal: 16, paddingBottom: 24 },
    balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 },
    balanceText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.65)", fontSize: 12.5, textAlign: "center", marginBottom: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 7 },
    cell: {
        width: 50,
        height: 52,
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
    cellToday: { backgroundColor: "#FF6FA5", borderColor: "#FF6FA5" },
    dayLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },
    dayLabelToday: { color: "#fff" },
    rubyTag: { flexDirection: "row", alignItems: "center", gap: 2 },
    rubyTagText: { color: "#FF8FB8", fontSize: 12, fontWeight: "700" },
    noReward: { color: "rgba(255,255,255,0.25)", fontSize: 14 },
    cta: {
        marginTop: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: "#FF6FA5",
        paddingVertical: 14,
        borderRadius: 16,
    },
    ctaDisabled: { backgroundColor: "rgba(255,111,165,0.35)" },
    ctaText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
