import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    Image,
    StyleSheet,
    Pressable,
    FlatList,
} from "react-native";
// react-native's own SafeAreaView is an iOS-only no-op; on Android it does
// nothing at all, which is why this screen ran under the status bar.
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { analyticsService } from "../services/AnalyticsService";
import {
    LANGUAGE_META,
    SUPPORTED,
    SupportedLang,
    setAppLanguage,
    currentLang,
} from "../i18n";
import { FLAGS } from "../i18n/flags";
import { NativeAdCard } from "../components/ads/NativeAdCard";
import { AdUnits } from "../config/ads";
import { track } from "../services/trackEvents";

/**
 * Màn chọn ngôn ngữ — hiện ở lần mở app đầu tiên (trước SignIn), gated bằng
 * `hasChosenLanguage()`. Đổi ngôn ngữ áp dụng ngay (mọi màn dùng useTranslation
 * tự re-render); "Continue" ghi nhận đã chọn và đi tiếp.
 *
 */
export default function LanguageScreen({ onDone }: { onDone: () => void }) {
    const { t } = useTranslation();
    // Nothing is preselected: the point of this screen is a deliberate choice,
    // and a row that is already ticked on arrival reads as "already done".
    const [sel, setSel] = useState<SupportedLang | null>(null);
    /** Flips once the user has actually chosen; reveals the Save pill. */
    const [picked, setPicked] = useState(false);

    /**
     * MỘT ô quảng cáo duy nhất cho cả màn.
     *
     * Trước đây có hai ô tráo nhau khi người dùng chạm chọn ngôn ngữ — tức là
     * hai request và hai impression trong một lần mở màn, ô thứ hai xuất hiện
     * ngay tại khoảnh khắc ngón tay vừa chạm. Trong lúc tài khoản AdMob đang
     * bị giới hạn phân phối vì invalid traffic, đó là đúng thứ cần bỏ.
     * `key` cố định nên ô này không remount khi `picked` đổi.
     */

    // Which language the device suggested before the user touched anything —
    // tells us how often our auto-detection already had it right.
    useEffect(() => {
        analyticsService.logLanguageScreenView(currentLang());
        track.languageView();
    }, []);

    const pick = async (l: SupportedLang) => {
        setSel(l);
        setPicked(true);
        track.languageSelect(l);
        await setAppLanguage(l);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Text style={styles.title} numberOfLines={2}>{t("lang.title")}</Text>
                    {/* Only appears once a language has been picked, so the
                        choice is always explicit — yuuki's gate. It also keeps
                        the primary action at the top, far from the ad in the
                        footer, instead of directly above it. */}
                    {picked && (
                        <Pressable
                            onPress={() => {
                                if (sel) track.languageSaveSelect(sel);
                                onDone();
                            }}
                            hitSlop={10}
                            style={styles.savePill}
                        >
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
                            <Image
                                source={FLAGS[item]}
                                style={[styles.flag, active && styles.flagActive]}
                                resizeMode="cover"
                            />
                            <Text style={[styles.name, active && styles.nameActive]}>
                                {meta.name}
                            </Text>
                            {active && <Text style={styles.check}>✓</Text>}
                        </Pressable>
                    );
                }}
            />

            {/* One card, one request, for the whole screen. yuuki swaps in a
                second card the moment a language is tapped; that is two
                impressions per visit and the second one appears exactly where
                the finger already is. `native_language_2` is left unused.

                The CTA sits where a primary button would, so it is deliberately
                NOT the app's accent colour — see CTA_COLOR. The prominent "Ad"
                badge and the card's frame are what keep it readable as an ad;
                neither should be trimmed. */}
            <View style={styles.adFooter}>
                <NativeAdCard
                    key="lang-ad"
                    adUnitId={AdUnits.nativeLanguage1}
                    placement="native_language_1"
                    ctaColor={CTA_COLOR}
                    fullWidthCta
                />
            </View>
        </SafeAreaView>
    );
}

const PINK = "#FF6FA5";
/** Yuuki's exact CTA colours for the two stages. */
/**
 * The ad's CTA must be obvious, and must not be mistaken for the Save pill.
 *
 * It was `#FF2E74` once a language had been picked — the same rose as Save,
 * two thumb-widths above it — so a tap meant for Save landed on the ad, and
 * AdMob counts those as invalid traffic. Green is as loud as the rose was
 * without wearing the app's own colour.
 */
const CTA_COLOR = "#16A34A";

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a" },
    adFooter: { paddingLeft: 20, paddingRight: 20, paddingTop: 8, paddingBottom: 16 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    // A filled pill, not bare text: as plain pink text next to the title it
    // read as a label and people did not find the way forward.
    savePill: {
        backgroundColor: PINK,
        paddingHorizontal: 18,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    saveText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 },
    // flexShrink + a smaller size: "Choose your language" is the longest of
    // the ten translations and it ran straight under the Save pill.
    title: { color: "#fff", fontSize: 24, fontWeight: "800", flexShrink: 1 },
    subtitle: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginTop: 8 },
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 10 },
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
    flag: {
        width: 40,
        height: 28,
        borderRadius: 6,
        marginRight: 14,
        borderWidth: 1,
        // A light hairline keeps the white in the flags (JP, FR, IT) from
        // bleeding into the dark row behind them.
        borderColor: "rgba(255,255,255,0.22)",
    },
    flagActive: { borderColor: PINK },
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
