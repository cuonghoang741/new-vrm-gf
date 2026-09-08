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
import { AdUnits } from "../config/ads";
import { preloadNative } from "../components/ads/nativeAdPreload";

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
    /** Flips once the user has actually chosen, which swaps in a second ad. */
    const [picked, setPicked] = useState(false);

    // Which language the device suggested before the user touched anything —
    // tells us how often our auto-detection already had it right.
    useEffect(() => {
        analyticsService.logLanguageScreenView(currentLang());
        // Warm the after-pick unit while the user is still reading the list, so
        // the swap on their first tap is instant instead of showing a skeleton.
        preloadNative(AdUnits.nativeLanguageAfterPick);
    }, []);

    const pick = async (l: SupportedLang) => {
        setSel(l);
        setPicked(true);
        await setAppLanguage(l);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{t("lang.title")}</Text>
                    {/* Only appears once a language has been picked, so the
                        choice is always explicit — yuuki's gate. It also keeps
                        the primary action at the top, far from the ad in the
                        footer, instead of directly above it. */}
                    {picked && (
                        <Pressable onPress={onDone} hitSlop={10}>
                            <Text style={styles.saveText}>{t("common.save")}</Text>
                        </Pressable>
                    )}
                </View>
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

            {/* Ported from Flutter yuuki's language_screen.dart: two DIFFERENT
                ad units, swapped on the first tap — neutral grey before the
                pick, the app's active CTA pink after it, with a full-width CTA
                (its `isCompact`). The differing keys are load-bearing: they
                force a fresh card so the old ad is disposed and the new unit is
                actually requested, rather than one ad being recoloured.

                The pink full-width CTA lands where a primary button would sit,
                which is the part reviewers look at — the prominent "Ad" badge
                and the card's own frame are what keep it readable as an ad, so
                neither should be trimmed. */}
            <View style={styles.adFooter}>
                {picked ? (
                    <NativeAdCard
                        key="lang-ad-after"
                        adUnitId={AdUnits.nativeLanguageAfterPick}
                        placement="native_language_1_2"
                        ctaColor={CTA_AFTER}
                        fullWidthCta
                    />
                ) : (
                    <NativeAdCard
                        key="lang-ad-before"
                        adUnitId={AdUnits.nativeLanguageBeforePick}
                        placement="native_language_1_1"
                        ctaColor={CTA_BEFORE}
                        fullWidthCta
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const PINK = "#FF6FA5";
/** Yuuki's exact CTA colours for the two stages. */
const CTA_BEFORE = "#6B7280";
const CTA_AFTER = "#FF2E74";

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a" },
    adFooter: { paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 16 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    saveText: { color: PINK, fontSize: 16, fontWeight: "800" },
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
