import React from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { IconHeartFilled } from "@tabler/icons-react-native";
import LockIcon from "../icons/LockIcon";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";

/**
 * Shown when someone taps an item she is not close enough to share yet.
 *
 * This was an OS `Alert`, which is the wrong shape for the message: an alert
 * says "something went wrong", while this is a goal. It shows the item they
 * wanted, the level it opens at, and how far along they are — so the refusal
 * carries the next step instead of just a dismissal.
 */
export function LevelLockDialog({
    visible,
    itemName,
    itemImage,
    requiredLevel,
    currentLevel,
    characterName,
    progress,
    alsoPro,
    alsoPrice = 0,
    onClose,
    onOpenBond,
}: {
    visible: boolean;
    itemName: string;
    itemImage?: string | null;
    requiredLevel: number;
    currentLevel: number;
    characterName: string;
    /** 0..1 through the current level; null when maxed or unknown. */
    progress: number | null;
    /** What the item still costs once the level is reached. */
    alsoPro?: boolean;
    alsoPrice?: number;
    onClose: () => void;
    /** Opens her level page, where the quests that close the gap live. */
    onOpenBond: () => void;
}) {
    const { t } = useTranslation();
    const pct = Math.max(0, Math.min(1, progress ?? 0));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={styles.card}>
                    <View style={styles.previewWrap}>
                        {itemImage ? (
                            <Image source={{ uri: itemImage }} style={styles.preview} blurRadius={14} />
                        ) : (
                            <View style={[styles.preview, { backgroundColor: "rgba(255,255,255,0.08)" }]} />
                        )}
                        <View style={styles.previewVeil} />
                        <View style={styles.lockBubble}>
                            <LockIcon size={26} color="#fff" />
                        </View>
                    </View>

                    <Text style={styles.title}>{t("bond.locked_title")}</Text>
                    <Text style={styles.item} numberOfLines={1}>{itemName}</Text>

                    {(alsoPro || alsoPrice > 0) && (
                        <View style={styles.alsoRow}>
                            {alsoPro && (
                                <LinearGradient colors={SHEET.goldGradient} style={styles.alsoPro}>
                                    <Text style={styles.alsoProText}>PRO</Text>
                                </LinearGradient>
                            )}
                            {alsoPrice > 0 && (
                                <View style={styles.alsoRuby}>
                                    <RubyIcon size={11} color="#fff" />
                                    <Text style={styles.alsoRubyText}>{alsoPrice}</Text>
                                </View>
                            )}
                        </View>
                    )}

                    <Text style={styles.body}>
                        {t("bond.locked_body_named", { name: characterName, n: requiredLevel })}
                    </Text>

                    <View style={styles.levels}>
                        <View style={styles.lvChip}>
                            <IconHeartFilled size={11} color="#FF6FA5" />
                            <Text style={styles.lvChipText}>{t("bond.now_lv", { n: currentLevel })}</Text>
                        </View>
                        <View style={styles.track}>
                            <LinearGradient
                                colors={SHEET.accentGradient}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={[styles.fill, { width: `${pct * 100}%` }]}
                            />
                        </View>
                        <View style={[styles.lvChip, styles.lvChipTarget]}>
                            <LockIcon size={10} color={SHEET.gold} />
                            <Text style={[styles.lvChipText, { color: SHEET.gold }]}>Lv {requiredLevel}</Text>
                        </View>
                    </View>

                    <Pressable onPress={onOpenBond} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                        <LinearGradient
                            colors={SHEET.accentGradient}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <Text style={styles.ctaText}>{t("bond.see_how")}</Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                        <Text style={styles.laterText}>{t("common.cancel")}</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    // What is still owed after the level: the gate is in front of the price,
    // so the tile and this dialog both show the price behind it.
    alsoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    alsoPro: { paddingHorizontal: 9, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    alsoProText: { color: "#fff", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.4 },
    alsoRuby: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 9, height: 22, borderRadius: 11,
        backgroundColor: "rgba(255,255,255,0.10)",
    },
    alsoRubyText: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(6,3,16,0.72)",
        alignItems: "center",
        justifyContent: "center",
        padding: 26,
    },
    card: {
        width: "100%",
        maxWidth: 340,
        borderRadius: 26,
        backgroundColor: "#171026",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        paddingHorizontal: 22,
        paddingTop: 22,
        paddingBottom: 14,
    },
    previewWrap: {
        width: 104, height: 104, borderRadius: 24, overflow: "hidden",
        alignItems: "center", justifyContent: "center", marginBottom: 16,
    },
    preview: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    previewVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
    lockBubble: {
        width: 52, height: 52, borderRadius: 26,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.45)",
        borderWidth: 1.5, borderColor: "rgba(255,255,255,0.7)",
    },
    title: { color: "#fff", fontSize: 19, fontWeight: "900" },
    item: { color: SHEET.accent, fontSize: 14, fontWeight: "700", marginTop: 4 },
    body: {
        color: "rgba(255,255,255,0.7)", fontSize: 13.5, lineHeight: 19,
        textAlign: "center", marginTop: 10,
    },
    levels: {
        flexDirection: "row", alignItems: "center", gap: 8,
        alignSelf: "stretch", marginTop: 18, marginBottom: 20,
    },
    lvChip: {
        flexDirection: "row", alignItems: "center", gap: 3,
        paddingHorizontal: 8, height: 22, borderRadius: 11,
        backgroundColor: "rgba(255,111,165,0.20)",
    },
    lvChipTarget: { backgroundColor: "rgba(255,215,0,0.16)" },
    lvChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
    fill: { height: 6, borderRadius: 3 },
    cta: {
        height: 48, minWidth: 240, borderRadius: 24,
        alignItems: "center", justifyContent: "center", paddingHorizontal: 26,
    },
    ctaText: { color: "#fff", fontSize: 15.5, fontWeight: "800" },
    later: { paddingVertical: 12, paddingHorizontal: 18 },
    laterText: { color: "rgba(255,255,255,0.45)", fontSize: 13.5, fontWeight: "600" },
});
