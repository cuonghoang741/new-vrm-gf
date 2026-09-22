import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from "react-native-purchases";
import RubyIcon from "../../components/icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import { RUBY_PACK_IDS, getRuby } from "../../services/economyService";
import { setRuby } from "../../services/rubyStore";
import { AdsManager } from "../../services/AdsManager";
import { analyticsService } from "../../services/AnalyticsService";
import { track } from "../../services/trackEvents";

const COL_W = (Dimensions.get("window").width - 20 * 2 - 10 * 2) / 3;
/** The pack every other pack's bonus is measured against: the cheapest one. */
const BASE_PACK = RUBY_PACK_IDS[0];

/**
 * Ruby packs (consumable IAP truemate.ruby.1…6). The store sells; the
 * RevenueCat webhook credits the ruby server-side (idempotent per
 * transaction). After a purchase we poll the balance until it moves, because
 * the webhook usually lands a second or two after the store says "done".
 */
export function RubyShop({ packs }: { packs: Record<string, number> }) {
    const { t } = useTranslation();
    const [products, setProducts] = useState<PurchasesStoreProduct[] | null>(null);
    const [buying, setBuying] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        Purchases.getProducts([...RUBY_PACK_IDS], PRODUCT_CATEGORY.NON_SUBSCRIPTION)
            .then((list) => {
                if (!alive) return;
                const order = (id: string) => RUBY_PACK_IDS.indexOf(id as any);
                setProducts([...list].sort((a, b) => order(a.identifier) - order(b.identifier)));
            })
            .catch(() => alive && setProducts([]));
        return () => {
            alive = false;
        };
    }, []);

    const buy = useCallback(
        async (p: PurchasesStoreProduct) => {
            if (buying) return;
            setBuying(p.identifier);
            const before = await getRuby();
            try {
                analyticsService.logPurchaseStart("ruby", p.identifier);
                track.heartsPackSelect(p.identifier, packs[p.identifier] ?? 0, p.price, p.currencyCode);
                AdsManager.suppressNextResumeAd();
                await Purchases.purchaseStoreProduct(p);
                analyticsService.logPurchaseComplete(p.identifier, "ruby", p.price, p.currencyCode);
                track.heartsPurchaseSuccess(p.identifier, packs[p.identifier] ?? 0, p.price, p.currencyCode);
                // Wait for the webhook to credit the pack (up to ~30 s).
                let now = before;
                for (let i = 0; i < 15 && now <= before; i++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    now = await getRuby();
                }
                setRuby(now);
                Alert.alert(
                    "💎",
                    now > before ? t("quest.purchase_done", { n: now - before }) : t("quest.purchase_pending")
                );
            } catch (e: any) {
                track.heartsPurchaseFailed(p.identifier, e?.userCancelled ? "cancelled" : String(e?.code ?? e?.message ?? "error"));
                if (!e?.userCancelled) {
                    analyticsService.logPurchaseFailed("ruby", e?.message);
                    Alert.alert(t("common.purchase_failed"), e?.message ?? t("common.try_again"));
                }
            } finally {
                setBuying(null);
            }
        },
        [buying, t, packs]
    );

    if (products === null) {
        return (
            <View style={styles.grid}>
                {RUBY_PACK_IDS.map((id) => (
                    <View key={id} style={[styles.card, { opacity: 0.4 }]} />
                ))}
            </View>
        );
    }
    if (products.length === 0) {
        return <Text style={styles.unavailable}>{t("quest.shop_unavailable")}</Text>;
    }

    // Ruby per unit of currency in the smallest pack, from the live store
    // price. It used to be the literal 120/0.99 the packs launched with, so
    // every bonus badge became a lie the moment a price was edited in App
    // Store Connect — and it was silently wrong outside the US, where the
    // prices are not a straight conversion of the dollar ones.
    const base = products.find((p) => p.identifier === BASE_PACK);
    const baseRuby = base ? packs[base.identifier] ?? 0 : 0;
    const baseRate = base && base.price > 0 && baseRuby ? baseRuby / base.price : null;

    return (
        <View style={styles.grid}>
            {products.map((p) => {
                const ruby = packs[p.identifier] ?? 0;
                const bonus = baseRate && p.price > 0 && ruby
                    ? Math.round((ruby / p.price / baseRate - 1) * 100)
                    : 0;
                const best = p.identifier === "truemate.ruby.6";
                const popular = p.identifier === "truemate.ruby.3";
                return (
                    <Pressable
                        key={p.identifier}
                        onPress={() => buy(p)}
                        disabled={!!buying}
                        style={({ pressed }) => [styles.card, (best || popular) && styles.cardHot, pressed && { transform: [{ scale: 0.97 }] }]}
                    >
                        {(best || popular) && (
                            <LinearGradient colors={best ? SHEET.goldGradient : SHEET.accentGradient} style={styles.ribbon}>
                                <Text style={styles.ribbonText}>{best ? t("quest.best_value") : t("quest.popular")}</Text>
                            </LinearGradient>
                        )}
                        <RubyIcon size={30} color={SHEET.ruby} />
                        <Text style={styles.amount}>{ruby ? ruby.toLocaleString() : "—"}</Text>
                        {bonus >= 5 ? <Text style={styles.bonus}>{t("quest.bonus", { n: bonus })}</Text> : <Text style={styles.bonus}> </Text>}
                        <View style={styles.price}>
                            {buying === p.identifier ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.priceText} numberOfLines={1} adjustsFontSizeToFit>{p.priceString}</Text>
                            )}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    card: {
        width: COL_W,
        height: 150,
        borderRadius: 16,
        backgroundColor: SHEET.card,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingBottom: 10,
        paddingTop: 18,
        overflow: "hidden",
    },
    cardHot: { borderColor: "rgba(255,215,0,0.45)" },
    ribbon: { position: "absolute", top: 0, left: 0, right: 0, paddingVertical: 3, alignItems: "center" },
    ribbonText: { color: "#fff", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
    amount: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 6 },
    bonus: { color: SHEET.success, fontSize: 11, fontWeight: "800", marginTop: 2 },
    price: {
        marginTop: 8,
        height: 28,
        alignSelf: "stretch",
        marginHorizontal: 10,
        borderRadius: 14,
        backgroundColor: SHEET.accent,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
    },
    priceText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    unavailable: { color: SHEET.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 20 },
});
