import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { SHEET } from "../../theme/sheet";

/**
 * How the app is played, in one place. Reached from Settings and from her
 * bond page, where the touch rules are the question people actually have.
 */
const SECTIONS: { key: string; emoji: string }[] = [
    { key: "chat", emoji: "💬" },
    { key: "touch", emoji: "🤚" },
    { key: "modes", emoji: "🧊" },
    { key: "bond", emoji: "⭐" },
    { key: "style", emoji: "👗" },
    { key: "ruby", emoji: "💎" },
    { key: "pro", emoji: "👑" },
];

export function HowToPlaySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={[s.root, { paddingTop: insets.top + 8 }]}>
                <View style={s.head}>
                    <Text style={s.title}>{t("guide.title")}</Text>
                    <Pressable onPress={onClose} hitSlop={10} style={s.close} accessibilityRole="button">
                        <Ionicons name="close" size={22} color="#fff" />
                    </Pressable>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}>
                    {SECTIONS.map(({ key, emoji }) => (
                        <View key={key} style={[s.card, key === "touch" && s.cardHot]}>
                            <Text style={s.emoji}>{emoji}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.cardTitle}>{t(`guide.${key}_title`)}</Text>
                                <Text style={s.cardBody}>{t(`guide.${key}_body`)}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: SHEET.bgBottom },
    head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 6 },
    title: { flex: 1, color: "#fff", fontSize: 24, fontWeight: "900" },
    close: {
        width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
        backgroundColor: SHEET.card, borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    card: {
        flexDirection: "row", gap: 12, padding: 14, borderRadius: 16,
        backgroundColor: SHEET.card, borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    cardHot: { borderColor: "rgba(255,77,141,0.45)", backgroundColor: "rgba(255,77,141,0.08)" },
    emoji: { fontSize: 24, marginTop: 1 },
    cardTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
    cardBody: { color: "rgba(255,255,255,0.78)", fontSize: 14, lineHeight: 20, marginTop: 4 },
});
