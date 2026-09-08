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
    /** Flips once the user has actually chosen, which swaps in a second ad. */
    const [picked, setPicked] = useState(false);

    // Which language the device suggested before the user touched anything —
    // tells us how often our auto-detection already had it right.
    useEffect(() => {
        analyticsService.logLanguageScreenView(currentLang());
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

            {/* Two ads, as on yuuki: a muted one while the user is still
                choosing, then a second request once they have picked. The `key`
                is what makes it a genuinely new ad rather than a recolour of
                the first — remounting re-requests.

                The second CTA uses the brand rose. Note it sits directly above
                the pink Continue button: keep the "Ad" badge prominent and the
                card's own frame distinct, or the two read as one control, which
                is the accidental-click pattern AdMob bans accounts over. */}
            {/* Fixed footer — a sibling of the list, not inside its scrolling
                content, so it never scrolls away. Edge-to-edge with square
                corners so it reads as a distinct bottom banner rather than
                another list row. Both are how yuuki places it.

                Two requests, not one recoloured: the `key` change remounts and
                therefore re-requests, so native_language_1 (muted CTA, while
                still choosing) and native_language_2 (brand CTA, after the
                pick) report as separate impressions. */}
            <View style={styles.adFooter}>
                <NativeAdCard
                    key={picked ? "lang-post-pick" : "lang-pre-pick"}
                    placement={picked ? "native_language_2" : "native_language_1"}
                    ctaColor={picked ? PINK : MUTED_CTA}
                    cornerRadius={0}
                />
            </View>
        </SafeAreaView>
    );
}

const PINK = "#FF6FA5";
/** Deliberately inert grey for the first, pre-selection ad. */
const MUTED_CTA = "#5A5566";

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a" },
    adFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.10)" },
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
