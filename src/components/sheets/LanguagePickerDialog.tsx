import React, { useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { LANGUAGE_META, SUPPORTED, currentLang, setAppLanguage, type SupportedLang } from "../../i18n";
import { FLAGS } from "../../i18n/flags";
import { clearCharactersCache } from "../../cache/charactersCache";
import { analyticsService } from "../../services/AnalyticsService";
import { SHEET } from "../../theme/sheet";

/**
 * Change the app language from Settings.
 *
 * The first-run language screen tells people they can change it later in
 * Settings — until now there was nothing there to change it with.
 *
 * Picking a language clears the characters cache, because the names and
 * descriptions in it were localised at fetch time.
 */
export function LanguagePickerDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [sel, setSel] = useState<SupportedLang>(currentLang());

    const pick = async (lng: SupportedLang) => {
        setSel(lng);
        Haptics.selectionAsync();
        await setAppLanguage(lng);
        clearCharactersCache();
        analyticsService.logLanguageSelect(lng, "settings");
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>{t("set.language")}</Text>
                    <ScrollView contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                        {(SUPPORTED as readonly SupportedLang[]).map((l) => {
                            const meta = LANGUAGE_META[l];
                            const active = l === sel;
                            return (
                                <Pressable key={l} onPress={() => pick(l)} style={[styles.row, active && styles.rowActive]}>
                                    <Image
                                        source={FLAGS[l]}
                                        style={[styles.flag, active && { borderColor: SHEET.accent }]}
                                        resizeMode="cover"
                                    />
                                    <Text style={[styles.name, active && { color: SHEET.accent }]}>{meta.name}</Text>
                                    {active && <Ionicons name="checkmark" size={18} color={SHEET.accent} />}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: {
        maxHeight: "78%",
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
    flag: { width: 40, height: 28, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
    name: { color: "#fff", fontSize: 16, fontWeight: "600", flex: 1 },
});
