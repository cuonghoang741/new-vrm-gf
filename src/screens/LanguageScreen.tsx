import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    SafeAreaView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { analyticsService } from "../services/AnalyticsService";
import {
    LANGUAGE_META,
    SUPPORTED,
    SupportedLang,
    setAppLanguage,
    currentLang,
} from "../i18n";
import { NativeAdCard } from "../components/ads/NativeAdCard";

/**
 * Màn chọn ngôn ngữ — hiện ở lần mở app đầu tiên (trước SignIn), gated bằng
 * `hasChosenLanguage()`. Đổi ngôn ngữ áp dụng ngay (mọi màn dùng useTranslation
 * tự re-render); "Continue" ghi nhận đã chọn và đi tiếp.
 *
 * TODO(P2): chèn native_language ad (trước/sau khi chọn) khi có NativeAd component.
 */
export default function LanguageScreen({ onDone }: { onDone: () => void }) {
    const { t } = useTranslation();
    const [sel, setSel] = useState<SupportedLang>(currentLang());

    // Which language the device suggested before the user touched anything —
    // tells us how often our auto-detection already had it right.
    useEffect(() => {
        analyticsService.logLanguageScreenView(currentLang());
    }, []);

    const pick = async (l: SupportedLang) => {
        setSel(l);
        await setAppLanguage(l);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t("lang.title")}</Text>
                <Text style={styles.subtitle}>{t("lang.subtitle")}</Text>
            </View>

            <FlatList
                data={SUPPORTED as readonly SupportedLang[]}
                keyExtractor={(l) => l}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => {
                    const meta = LANGUAGE_META[item];
                    const active = item === sel;
                    return (
                        <Pressable
                            onPress={() => pick(item)}
                            style={[styles.row, active && styles.rowActive]}
                        >
                            <Text style={styles.flag}>{meta.flag}</Text>
                            <Text style={[styles.name, active && styles.nameActive]}>
                                {meta.name}
                            </Text>
                            {active && <Text style={styles.check}>✓</Text>}
                        </Pressable>
                    );
                }}
            />

            {/* native_language — small native ad above the CTA (collapses for PRO / no-fill) */}
            <View style={styles.adSlot}>
                <NativeAdCard placement="native_language" />
            </View>

            <Pressable style={styles.cta} onPress={onDone}>
                <Text style={styles.ctaText}>{t("common.continue")}</Text>
            </Pressable>
        </SafeAreaView>
    );
}

const PINK = "#FF6FA5";

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a" },
    adSlot: { paddingHorizontal: 16 },
    header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
    title: { color: "#fff", fontSize: 26, fontWeight: "800" },
    subtitle: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 8 },
    list: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    rowActive: {
        backgroundColor: "rgba(255,111,165,0.14)",
        borderColor: PINK,
    },
    flag: { fontSize: 24, marginRight: 14 },
    name: { color: "#fff", fontSize: 17, fontWeight: "600", flex: 1 },
    nameActive: { color: PINK },
    check: { color: PINK, fontSize: 18, fontWeight: "800" },
    cta: {
        margin: 20,
        height: 56,
        borderRadius: 28,
        backgroundColor: PINK,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaText: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
