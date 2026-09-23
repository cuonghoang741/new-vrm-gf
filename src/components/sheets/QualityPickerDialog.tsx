import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { QUALITY_LABELS, setQuality, type RenderQuality } from "../../services/renderQuality";
import { SHEET } from "../../theme/sheet";

/**
 * Pick the 3D render quality.
 *
 * The row used to cycle high → balanced → saver on every tap, which asks the
 * user to tap blindly until the subtitle says the thing they wanted, with no
 * way to see the three options at once or to know which way the cycle turns.
 */
const HINTS = ["set.q_high_hint", "set.q_balanced_hint", "set.q_saver_hint"] as const;
const ICONS = ["sparkles", "speedometer", "battery-half"] as const;

export function QualityPickerDialog({
    visible,
    value,
    onPick,
    onClose,
}: {
    visible: boolean;
    value: RenderQuality;
    onPick: (q: RenderQuality) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [sel, setSel] = useState<RenderQuality>(value);

    const pick = async (q: RenderQuality) => {
        setSel(q);
        Haptics.selectionAsync();
        await setQuality(q);
        onPick(q);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>{t("set.quality")}</Text>
                    {([0, 1, 2] as RenderQuality[]).map((q) => {
                        const active = q === sel;
                        return (
                            <Pressable key={q} onPress={() => pick(q)} style={[styles.row, active && styles.rowActive]}>
                                <View style={styles.iconWrap}>
                                    <Ionicons name={ICONS[q]} size={18} color={active ? SHEET.accent : "rgba(255,255,255,0.7)"} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.name, active && { color: SHEET.accent }]}>{t(QUALITY_LABELS[q])}</Text>
                                    <Text style={styles.hint}>{t(HINTS[q])}</Text>
                                </View>
                                {active && <Ionicons name="checkmark" size={18} color={SHEET.accent} />}
                            </Pressable>
                        );
                    })}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
        backgroundColor: "#141019",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 28,
    },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: 10 },
    title: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 12, marginLeft: 4 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        marginBottom: 8,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    rowActive: { backgroundColor: "rgba(255,77,141,0.14)", borderColor: SHEET.accent },
    iconWrap: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    name: { color: "#fff", fontSize: 16, fontWeight: "700" },
    hint: { color: "rgba(255,255,255,0.5)", fontSize: 12.5, marginTop: 2 },
});
