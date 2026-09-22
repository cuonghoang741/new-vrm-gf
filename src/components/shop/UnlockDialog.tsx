import React from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconCrown } from "@tabler/icons-react-native";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";

/**
 * The "how do you want to unlock this?" card for PRO and ruby items — same
 * shape as AdGateDialog so every unlock prompt in the app looks alike.
 */
export type UnlockDialogProps = {
    visible: boolean;
    kind: "pro" | "pro_or_ruby" | "ruby";
    itemName: string;
    image?: string | null;
    price: number;
    balance: number | null;
    busy?: boolean;
    onBuy: () => void;
    onUpgrade: () => void;
    onGetRuby: () => void;
    onCancel: () => void;
};

export function UnlockDialog(p: UnlockDialogProps) {
    const { t } = useTranslation();
    const canBuy = p.kind !== "pro" && p.price > 0;
    const short = canBuy && p.balance !== null && p.balance < p.price;

    return (
        <Modal visible={p.visible} transparent animationType="fade" statusBarTranslucent onRequestClose={p.onCancel}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={p.busy ? undefined : p.onCancel} />
                <View style={styles.card}>
                    <LinearGradient colors={p.kind === "ruby" ? SHEET.accentGradient : SHEET.goldGradient} style={styles.badge}>
                        {p.kind === "ruby" ? <RubyIcon size={28} color="#fff" /> : <Ionicons name="lock-closed" size={26} color="#fff" />}
                    </LinearGradient>

                    <Text style={styles.title} numberOfLines={2}>{p.itemName}</Text>
                    <Text style={styles.body}>
                        {p.kind === "pro"
                            ? t("shop.unlock_pro_body")
                            : p.kind === "pro_or_ruby"
                                ? t("shop.unlock_pro_or_ruby_body", { price: p.price })
                                : t("shop.unlock_ruby_body", { price: p.price })}
                    </Text>

                    {canBuy && (
                        <View style={styles.balanceRow}>
                            <Text style={styles.balanceLabel}>{t("shop.your_ruby")}</Text>
                            <RubyIcon size={13} color={SHEET.ruby} />
                            <Text style={[styles.balanceValue, short && { color: "#FF6B6B" }]}>{p.balance ?? "—"}</Text>
                        </View>
                    )}

                    {canBuy && (
                        <Pressable disabled={p.busy} onPress={short ? p.onGetRuby : p.onBuy} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                            <LinearGradient colors={SHEET.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                                {p.busy ? (
                                    <ActivityIndicator color="#fff" />
                                ) : short ? (
                                    <>
                                        <RubyIcon size={16} color="#fff" />
                                        <Text style={styles.primaryText}>{t("shop.get_more_ruby")}</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.primaryText}>{t("shop.buy_for")}</Text>
                                        <RubyIcon size={16} color="#fff" />
                                        <Text style={styles.primaryText}>{p.price}</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </Pressable>
                    )}

                    {p.kind !== "ruby" && (
                        <Pressable
                            disabled={p.busy}
                            onPress={p.onUpgrade}
                            style={({ pressed }) => [canBuy ? styles.secondary : styles.primaryGold, pressed && { opacity: 0.85 }]}
                        >
                            <IconCrown size={16} color={canBuy ? SHEET.gold : "#2A1A00"} />
                            <Text style={canBuy ? styles.secondaryText : styles.primaryGoldText}>{t("common.upgrade_pro")}</Text>
                        </Pressable>
                    )}

                    <Pressable onPress={p.onCancel} disabled={p.busy} hitSlop={8} style={styles.cancel}>
                        <Text style={styles.cancelText}>{t("common.cancel")}</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(6,3,16,0.66)", alignItems: "center", justifyContent: "center", padding: 28 },
    card: {
        width: "100%",
        maxWidth: 360,
        borderRadius: 26,
        paddingHorizontal: 22,
        paddingTop: 26,
        paddingBottom: 16,
        alignItems: "center",
        backgroundColor: "#1A1130",
        borderWidth: 1,
        borderColor: "rgba(201,166,255,0.22)",
    },
    badge: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    title: { color: "#F4ECFB", fontSize: 19, fontWeight: "800", textAlign: "center" },
    body: { color: "rgba(244,236,251,0.66)", fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, marginBottom: 14 },
    balanceRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 14 },
    balanceLabel: { color: SHEET.textMuted, fontSize: 13 },
    balanceValue: { color: "#fff", fontSize: 14, fontWeight: "800" },
    primary: {
        height: 52,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minWidth: 260,
        paddingHorizontal: 24,
    },
    primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    primaryGold: {
        height: 52,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minWidth: 260,
        backgroundColor: SHEET.gold,
    },
    primaryGoldText: { color: "#2A1A00", fontSize: 16, fontWeight: "800" },
    secondary: {
        height: 46,
        marginTop: 10,
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minWidth: 260,
        borderWidth: 1,
        borderColor: "rgba(242,193,78,0.42)",
    },
    secondaryText: { color: SHEET.gold, fontSize: 15, fontWeight: "700" },
    cancel: { marginTop: 12, paddingVertical: 8 },
    cancelText: { color: "rgba(244,236,251,0.45)", fontSize: 14, fontWeight: "600" },
});
