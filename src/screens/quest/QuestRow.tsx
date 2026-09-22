import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
    IconCalendarCheck,
    IconHanger,
    IconMap2,
    IconMessage,
    IconMessages,
    IconMusic,
    IconPhoto,
    IconPlayerPlay,
    IconTrophy,
    IconStar,
} from "@tabler/icons-react-native";
import RubyIcon from "../../components/icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import type { Quest } from "../../services/economyService";

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
    calendar: IconCalendarCheck,
    message: IconMessage,
    messages: IconMessages,
    shirt: IconHanger,
    map: IconMap2,
    music: IconMusic,
    photo: IconPhoto,
    video: IconPlayerPlay,
    trophy: IconTrophy,
};
const TINTS: Record<string, string> = {
    calendar: "#FF8C00",
    message: "#4DA3FF",
    messages: "#4DA3FF",
    shirt: "#FF4D8D",
    map: "#4ADE80",
    music: "#9C4DFF",
    photo: "#FFB347",
    video: "#FF6FA3",
    trophy: "#FFD700",
};

/**
 * One quest: icon chip, title, progress bar, reward — and a button whose
 * state says what to do next: Go (not done), Claim (done), ✓ (claimed).
 * Same card language as Yuuki's check-in rows.
 */
export function QuestRow({
    quest,
    busy,
    multiplier = 1,
    onClaim,
    onGo,
}: {
    quest: Quest;
    busy: boolean;
    /** 2 for PRO — the reward is already doubled, this labels it. */
    multiplier?: number;
    onClaim: () => void;
    onGo?: () => void;
}) {
    const { t } = useTranslation();
    const Icon = ICONS[quest.icon ?? ""] ?? IconStar;
    const tint = TINTS[quest.icon ?? ""] ?? SHEET.accent;
    const done = quest.progress >= quest.target;
    const pct = Math.min(1, quest.progress / Math.max(1, quest.target));
    const title = t(`quest.q.${quest.id}`, { defaultValue: quest.title });

    return (
        <View style={[styles.row, quest.claimed && { opacity: 0.55 }]}>
            <View style={[styles.chip, { backgroundColor: tint + "2E" }]}>
                <Icon size={20} color={tint} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>{title}</Text>
                <View style={styles.progressRow}>
                    <View style={styles.track}>
                        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: done ? SHEET.success : SHEET.accent }]} />
                    </View>
                    <Text style={styles.count}>
                        {Math.min(quest.progress, quest.target).toLocaleString()}/{quest.target.toLocaleString()}
                    </Text>
                </View>
            </View>
            <View style={styles.right}>
                <View style={styles.reward}>
                    <RubyIcon size={12} color={SHEET.ruby} />
                    <Text style={styles.rewardText}>+{quest.reward}</Text>
                    {multiplier > 1 && (
                        <View style={styles.x2}>
                            <Text style={styles.x2Text}>×{multiplier}</Text>
                        </View>
                    )}
                </View>
                {quest.claimed ? (
                    <View style={[styles.btn, styles.btnDone]}>
                        <Text style={styles.btnDoneText}>✓</Text>
                    </View>
                ) : done ? (
                    <Pressable onPress={onClaim} disabled={busy} style={[styles.btn, styles.btnClaim]}>
                        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>{t("quest.claim")}</Text>}
                    </Pressable>
                ) : onGo ? (
                    <Pressable onPress={onGo} style={[styles.btn, styles.btnGo]}>
                        <Text style={styles.btnGoText}>{t("quest.go")}</Text>
                    </Pressable>
                ) : (
                    <View style={[styles.btn, styles.btnGo, { opacity: 0.5 }]}>
                        <Text style={styles.btnGoText}>{t("quest.go")}</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: SHEET.card,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        marginBottom: 10,
    },
    chip: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    title: { color: "#fff", fontSize: 14, fontWeight: "700" },
    progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 },
    track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
    fill: { height: 6, borderRadius: 3 },
    count: { color: SHEET.textMuted, fontSize: 11, fontWeight: "600", minWidth: 40, textAlign: "right" },
    right: { alignItems: "center", gap: 6, width: 72 },
    reward: { flexDirection: "row", alignItems: "center", gap: 3 },
    x2: { backgroundColor: SHEET.gold, borderRadius: 7, paddingHorizontal: 4, paddingVertical: 1 },
    x2Text: { color: "#2A1A00", fontSize: 10, fontWeight: "900" },
    rewardText: { color: SHEET.ruby, fontSize: 13, fontWeight: "800" },
    btn: { height: 30, minWidth: 68, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
    btnClaim: { backgroundColor: SHEET.accent },
    btnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    btnGo: { borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
    btnGoText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    btnDone: { backgroundColor: "rgba(74,222,128,0.18)" },
    btnDoneText: { color: SHEET.success, fontSize: 15, fontWeight: "900" },
});
