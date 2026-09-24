import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconCrown, IconLock, IconSparkles } from "@tabler/icons-react-native";
import RubyIcon from "../../components/icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import {
    claimBondQuest, difficultyKey, getBondState, type BondQuest, type BondState,
} from "../../services/bondService";
import { refreshRuby } from "../../services/rubyStore";
import { ICON_CHARACTERS } from "../../components/icons/iconCharacters";

/**
 * Her level page: how close you are to this one character, what the next level
 * opens, and the quests that get you there.
 *
 * Deliberately per-character — the whole design falls apart if it reads as one
 * global score, because the point is that Nerine is hard and Tilda is not.
 */
export function BondPage({
    visible, onClose, characterId, characterName, characterArt, onSwitchCharacter,
}: {
    visible: boolean;
    onClose: () => void;
    characterId: string | null;
    characterName: string;
    characterArt?: string | null;
    /** Opens the character picker. Closes this page first; see the button. */
    onSwitchCharacter?: () => void;
}) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [state, setState] = useState<BondState | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!characterId) return;
        setLoading(true);
        setState(await getBondState(characterId));
        setLoading(false);
    }, [characterId]);

    useEffect(() => {
        if (visible) load();
    }, [visible, load]);

    const openSwitcher = useCallback(() => {
        if (!onSwitchCharacter) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        // Let this modal finish closing, or the picker opens underneath it.
        setTimeout(onSwitchCharacter, 320);
    }, [onSwitchCharacter, onClose]);

    const claim = useCallback(
        async (q: BondQuest) => {
            if (!characterId || busy) return;
            setBusy(q.id);
            const res = await claimBondQuest(q.id, characterId);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                // The ledger is the authority on the balance; re-read it rather
                // than adding locally and drifting from the server.
                if (res.rewardRuby > 0) void refreshRuby();
                await load();
            }
            setBusy(null);
        },
        [characterId, busy, load]
    );

    const pct = state?.xpForNext
        ? Math.min(1, state.xpIntoLevel / Math.max(1, state.xpForNext))
        : 1;

    const dailies = state?.quests.filter((q) => q.kind === "daily") ?? [];
    const uniques = state?.quests.filter((q) => q.kind === "unique") ?? [];
    const hidden = state?.quests.filter((q) => q.kind === "hidden") ?? [];

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.page}>
                <LinearGradient colors={[SHEET.bgTop, SHEET.bgBottom]} style={StyleSheet.absoluteFill} />
                {!!characterArt && (
                    <Image
                        source={{ uri: characterArt }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        contentPosition="top center"
                        blurRadius={50}
                        transition={250}
                    />
                )}
                <LinearGradient
                    colors={["rgba(15,10,30,0.62)", "rgba(15,10,30,0.92)", "rgba(15,10,30,0.99)"]}
                    style={StyleSheet.absoluteFill}
                />

                <Pressable onPress={onClose} hitSlop={10} style={[styles.close, { top: insets.top + 8 }]}>
                    <Ionicons name="close" size={20} color="#fff" />
                </Pressable>

                <ScrollView
                    contentContainerStyle={{ padding: 18, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 28 }}
                    showsVerticalScrollIndicator={false}
                >
                    {loading && !state ? (
                        <ActivityIndicator color={SHEET.accent} style={{ marginTop: 60 }} />
                    ) : !state ? (
                        <Text style={styles.muted}>{t("common.failed_load")}</Text>
                    ) : (
                        <>
                            {/* ── her, and how close you are ── */}
                            <View style={styles.head}>
                                {/* Her portrait IS the switch button — the
                                    biggest, most obvious thing on the page,
                                    and the one people already reach for when
                                    they want somebody else. The little group
                                    picture on its corner says so without a
                                    plate or a label; same picture as the rail
                                    button on the play screen. */}
                                <Pressable
                                    onPress={openSwitcher}
                                    disabled={!onSwitchCharacter}
                                    hitSlop={6}
                                    style={({ pressed }) => [
                                        styles.ringWrap,
                                        pressed && !!onSwitchCharacter && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                                    ]}
                                >
                                    <LinearGradient
                                        colors={state.level >= 5 ? SHEET.goldGradient : SHEET.accentGradient}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                        style={styles.ring}
                                    >
                                        <View style={styles.ringInner}>
                                            {characterArt ? (
                                                <Image source={{ uri: characterArt }} style={styles.portrait}
                                                       contentFit="cover" contentPosition="top center" transition={200} />
                                            ) : null}
                                        </View>
                                    </LinearGradient>

                                    {!!onSwitchCharacter && (
                                        <Image
                                            source={{ uri: ICON_CHARACTERS }}
                                            style={styles.switchBadge}
                                            contentFit="contain"
                                        />
                                    )}
                                </Pressable>

                                <Text style={styles.name} numberOfLines={1}>{characterName}</Text>

                                <View style={styles.headRow}>
                                    <LinearGradient
                                        colors={state.level >= 5 ? SHEET.goldGradient : SHEET.accentGradient}
                                        style={styles.lvBadge}
                                    >
                                        <Text style={styles.lvBadgeText}>
                                            {t(state.levels.find((l) => l.level === state.level)?.title_key ?? "")} · Lv {state.level}
                                        </Text>
                                    </LinearGradient>
                                    <View style={styles.diffChip}>
                                        <Text style={styles.diffText}>{t(difficultyKey(state.difficulty))}</Text>
                                    </View>
                                </View>

                                <View style={styles.track}>
                                    <LinearGradient
                                        colors={state.level >= 5 ? SHEET.goldGradient : SHEET.accentGradient}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={[styles.fill, { width: `${pct * 100}%` }]}
                                    />
                                </View>
                                <Text style={styles.xpLine}>
                                    {state.xpForNext
                                        ? t("bond.xp_to_next", {
                                              have: state.xpIntoLevel,
                                              need: state.xpForNext,
                                              lv: state.nextLevel,
                                          })
                                        : t("bond.maxed")}
                                </Text>

                            </View>

                            {/* ── what each level opens ── */}
                            <Text style={styles.section}>{t("bond.ladder")}</Text>
                            {state.levels.map((l) => (
                                <View key={l.level} style={[styles.lvRow, l.reached && styles.lvRowOn]}>
                                    <View style={[styles.lvDot, l.reached && styles.lvDotOn]}>
                                        {l.reached ? (
                                            <Ionicons name="checkmark" size={13} color="#fff" />
                                        ) : (
                                            <IconLock size={12} color={SHEET.textFaint} />
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.lvTitleRow}>
                                            <Text style={[styles.lvTitle, l.reached && { color: "#fff" }]}>
                                                {t(l.title_key)}
                                            </Text>
                                            {l.level === 5 && <IconCrown size={13} color={SHEET.gold} fill={SHEET.gold} />}
                                        </View>
                                        <Text style={styles.lvUnlocks}>{t(l.unlocks_key)}</Text>
                                    </View>
                                    <Text style={styles.lvXp}>{l.xp.toLocaleString()}</Text>
                                </View>
                            ))}

                            {/* ── quests ── */}
                            {dailies.length > 0 && (
                                <>
                                    <Text style={styles.section}>{t("bond.daily")}</Text>
                                    {dailies.map((q) => (
                                        <QuestLine key={q.id} q={q} busy={busy === q.id} onClaim={() => claim(q)} />
                                    ))}
                                </>
                            )}

                            {uniques.length > 0 && (
                                <>
                                    <Text style={styles.section}>{t("bond.unique")}</Text>
                                    {uniques.map((q) => (
                                        <QuestLine key={q.id} q={q} busy={busy === q.id} onClaim={() => claim(q)} />
                                    ))}
                                </>
                            )}

                            <Text style={styles.section}>{t("bond.hidden")}</Text>
                            {hidden.length === 0 ? (
                                <View style={styles.hiddenHint}>
                                    <IconSparkles size={16} color={SHEET.textFaint} />
                                    <Text style={styles.hiddenHintText}>{t("bond.hidden_hint")}</Text>
                                </View>
                            ) : (
                                hidden.map((q) => (
                                    <QuestLine key={q.id} q={q} busy={busy === q.id} onClaim={() => claim(q)} secret />
                                ))
                            )}
                        </>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

function QuestLine({
    q, busy, onClaim, secret,
}: { q: BondQuest; busy: boolean; onClaim: () => void; secret?: boolean }) {
    const { t } = useTranslation();
    const done = q.progress >= q.target;
    const pct = Math.min(1, q.progress / Math.max(1, q.target));
    return (
        <View style={[styles.qRow, secret && styles.qRowSecret]}>
            <View style={{ flex: 1 }}>
                <Text style={styles.qTitle} numberOfLines={2}>
                    {t(`bond.q.${q.code}`, { defaultValue: q.code, n: q.target })}
                </Text>
                <View style={styles.qProgRow}>
                    <View style={styles.qTrack}>
                        <View style={[styles.qFill, { width: `${pct * 100}%`, backgroundColor: done ? SHEET.success : SHEET.accent }]} />
                    </View>
                    <Text style={styles.qCount}>{Math.min(q.progress, q.target)}/{q.target}</Text>
                </View>
            </View>
            <View style={styles.qRight}>
                <View style={styles.qReward}>
                    <Text style={styles.qXp}>+{q.reward_xp}</Text>
                    {q.reward_ruby > 0 && (
                        <>
                            <RubyIcon size={12} color={SHEET.ruby} />
                            <Text style={styles.qRuby}>{q.reward_ruby}</Text>
                        </>
                    )}
                </View>
                {/* Only a real button when there is something to press. An
                    empty grey pill for every unfinished quest read as a
                    broken control with its label missing. */}
                {q.claimed ? (
                    <View style={styles.qDone}>
                        <Ionicons name="checkmark" size={15} color={SHEET.success} />
                    </View>
                ) : done ? (
                    <Pressable onPress={onClaim} disabled={busy} style={styles.qBtn}>
                        {busy ? <ActivityIndicator size="small" color="#fff" />
                              : <Text style={styles.qBtnText} numberOfLines={1}>{t("quest.claim")}</Text>}
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: SHEET.bgBottom },
    close: {
        position: "absolute", right: 16, zIndex: 10,
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
    },
    muted: { color: SHEET.textMuted, textAlign: "center", marginTop: 60 },
    head: { alignItems: "center", marginBottom: 6 },
    ringWrap: { width: 108, height: 108 },
    // Hangs off the ring's lower-right, no plate behind it: the same "picture,
    // not a glyph" treatment as the rail button it mirrors.
    switchBadge: {
        position: "absolute", right: -14, bottom: -8,
        width: 58, height: 58,
    },
    ring: {
        width: 108, height: 108, borderRadius: 54,
        alignItems: "center", justifyContent: "center", padding: 3,
    },
    ringInner: {
        width: 102, height: 102, borderRadius: 51, overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.08)",
    },
    portrait: { width: "100%", height: "100%" },
    name: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 12 },
    headRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
    lvBadge: { paddingHorizontal: 13, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    lvBadgeText: { color: "#fff", fontSize: 13, fontWeight: "900" },
    diffChip: {
        paddingHorizontal: 10, height: 28, borderRadius: 14, justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    diffText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },
    track: {
        alignSelf: "stretch",
        height: 9, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.12)",
        overflow: "hidden", marginTop: 16,
    },
    fill: { height: 9, borderRadius: 5 },
    xpLine: { color: SHEET.textMuted, fontSize: 12.5, marginTop: 8, fontWeight: "600" },

    section: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 24, marginBottom: 10 },

    lvRow: {
        flexDirection: "row", alignItems: "center", gap: 11,
        padding: 12, borderRadius: 14, marginBottom: 8,
        backgroundColor: SHEET.card, borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    lvRowOn: { borderColor: "rgba(255,77,141,0.4)", backgroundColor: "rgba(255,77,141,0.10)" },
    lvDot: {
        width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.08)",
    },
    lvDotOn: { backgroundColor: SHEET.accent },
    lvTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    lvTitle: { color: SHEET.textMuted, fontSize: 14, fontWeight: "800" },
    lvUnlocks: { color: SHEET.textFaint, fontSize: 11.5, marginTop: 2, lineHeight: 15 },
    lvXp: { color: SHEET.textFaint, fontSize: 11, fontWeight: "700" },

    qRow: {
        flexDirection: "row", alignItems: "center", gap: 10,
        padding: 12, borderRadius: 14, marginBottom: 8,
        backgroundColor: SHEET.card, borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    qRowSecret: { borderColor: "rgba(255,215,0,0.35)", backgroundColor: "rgba(255,215,0,0.07)" },
    qTitle: { color: "#fff", fontSize: 13.5, fontWeight: "700" },
    qProgRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 },
    qTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.10)", overflow: "hidden" },
    qFill: { height: 5, borderRadius: 3 },
    qCount: { color: SHEET.textMuted, fontSize: 10.5, fontWeight: "700", minWidth: 40, textAlign: "right" },
    qRight: { alignItems: "flex-end", gap: 6, minWidth: 82 },
    qReward: { flexDirection: "row", alignItems: "center", gap: 3 },
    qXp: { color: SHEET.purple, fontSize: 12, fontWeight: "800" },
    qRuby: { color: SHEET.ruby, fontSize: 12, fontWeight: "800" },
    qBtn: {
        height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
        paddingHorizontal: 16, backgroundColor: SHEET.accent,
    },
    qBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    qDone: {
        width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(74,222,128,0.18)",
    },

    hiddenHint: {
        flexDirection: "row", alignItems: "center", gap: 8,
        padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: "dashed",
        borderColor: "rgba(255,255,255,0.18)",
    },
    hiddenHintText: { color: SHEET.textFaint, fontSize: 12.5, flex: 1, lineHeight: 17 },
});
