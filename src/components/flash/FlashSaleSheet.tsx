import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, Image, Modal, Platform, Pressable,
    StyleSheet, Text, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { SHEET } from "../../theme/sheet";
import { effectivePrice, discountPercent } from "../../services/storePrice";
import { useFlashSale } from "../../services/flashSale";
import { FLASH_GIFT_IMAGE } from "./art";

/** The offering and package the sale price lives in. Created in RevenueCat. */
export const FLASH_OFFERING_ID = "flash_sale";
export const FLASH_PACKAGE_ID = "flash_sale";

/**
 * The offer itself: one card, one price, one clock.
 *
 * Not a second paywall. The full paywall was already shown and refused — this
 * repeats none of its argument and lists none of its features, because the
 * user has just read them. It shows what changed: the price, what it was, and
 * how long the new one lasts.
 *
 * The price shown is `effectivePrice`, not `priceString`. On Google Play the
 * headline string is the RECURRING price and the discount lives in the intro
 * phase, so reading the obvious field would put the normal price on a card
 * that says "sale".
 */
export function FlashSaleSheet({
    visible,
    onClose,
    onPurchased,
}: {
    visible: boolean;
    onClose: () => void;
    onPurchased: () => void;
}) {
    const { t } = useTranslation();
    const { clock } = useFlashSale();
    const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
    const [fullPrice, setFullPrice] = useState<string | null>(null);
    const [percent, setPercent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState(false);
    const slide = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!visible) { slide.setValue(0); return; }
        Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }).start();
    }, [visible, slide]);

    useEffect(() => {
        if (!visible) return;
        let alive = true;
        (async () => {
            setLoading(true);
            try {
                const offerings = await Purchases.getOfferings();
                const sale = offerings.all[FLASH_OFFERING_ID];
                const found =
                    sale?.availablePackages.find((p) => p.identifier === FLASH_PACKAGE_ID) ??
                    sale?.availablePackages[0] ??
                    null;

                // What the same thing costs without the sale, for the
                // strikethrough. The current offering is the honest comparison:
                // it is the price they were just shown and turned down.
                const normal = offerings.current?.availablePackages[0] ?? null;

                if (!alive) return;
                setPkg(found);
                if (found && normal) {
                    const now = effectivePrice(found.product as any);
                    const was = effectivePrice(normal.product as any, false);
                    setFullPrice(was.priceString);
                    setPercent(discountPercent(now.price, was.price));
                }
            } catch {
                /* no offer to show; the sheet says so below */
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [visible]);

    const buy = async () => {
        if (!pkg || buying) return;
        setBuying(true);
        try {
            await Purchases.purchasePackage(pkg);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onPurchased();
        } catch {
            /* cancelled, or the store refused — leave the sheet up */
        } finally {
            setBuying(false);
        }
    };

    const price = pkg ? effectivePrice(pkg.product as any).priceString : null;
    const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
                    <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                        <Ionicons name="close" size={19} color="rgba(255,255,255,0.5)" />
                    </Pressable>

                    <Image source={{ uri: FLASH_GIFT_IMAGE }} style={styles.gift} resizeMode="contain" />

                    {/* The clock is the headline. It is the only thing about
                        this offer that is not also true of the paywall. */}
                    <View style={styles.clockRow}>
                        <Ionicons name="time-outline" size={15} color={SHEET.accent} />
                        <Text style={styles.clockText}>{clock}</Text>
                    </View>

                    <Text style={styles.title}>{t("flash.title")}</Text>

                    {loading ? (
                        <ActivityIndicator color={SHEET.accent} style={{ marginVertical: 26 }} />
                    ) : !pkg || !price ? (
                        <Text style={styles.body}>{t("flash.unavailable")}</Text>
                    ) : (
                        <>
                            <View style={styles.priceRow}>
                                <Text style={styles.price}>{price}</Text>
                                {!!fullPrice && percent > 0 && (
                                    <Text style={styles.was}>{fullPrice}</Text>
                                )}
                            </View>
                            {percent > 0 && (
                                <View style={styles.off}>
                                    <Text style={styles.offText}>{t("flash.off", { n: percent })}</Text>
                                </View>
                            )}
                            <Text style={styles.body}>{t("flash.body")}</Text>

                            <Pressable onPress={buy} disabled={buying} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                                <LinearGradient
                                    colors={SHEET.accentGradient}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.cta}
                                >
                                    {buying
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.ctaText}>{t("flash.cta")}</Text>}
                                </LinearGradient>
                            </Pressable>
                        </>
                    )}

                    <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                        <Text style={styles.laterText}>{t("flash.later")}</Text>
                    </Pressable>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(6,3,16,0.6)", justifyContent: "flex-end" },
    card: {
        backgroundColor: "#171026",
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        borderWidth: 1.5,
        borderColor: "rgba(255,61,127,0.55)",
        alignItems: "center",
        paddingHorizontal: 26,
        paddingTop: 10,
        paddingBottom: Platform.OS === "ios" ? 34 : 22,
    },
    close: { position: "absolute", right: 16, top: 16, zIndex: 2, padding: 4 },
    gift: { width: 132, height: 132, marginTop: 4 },
    clockRow: {
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 12, height: 28, borderRadius: 14, marginTop: -6,
        backgroundColor: "rgba(255,61,127,0.14)",
        borderWidth: 1, borderColor: "rgba(255,61,127,0.45)",
    },
    clockText: {
        color: SHEET.accent, fontSize: 14, fontWeight: "900",
        fontVariant: ["tabular-nums"], letterSpacing: 0.4,
    },
    title: { color: "#fff", fontSize: 21, fontWeight: "900", textAlign: "center", marginTop: 14 },
    priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 12 },
    price: { color: "#fff", fontSize: 32, fontWeight: "900" },
    was: {
        color: "rgba(255,255,255,0.4)", fontSize: 17, fontWeight: "700",
        textDecorationLine: "line-through",
    },
    off: {
        marginTop: 8, paddingHorizontal: 10, height: 24, borderRadius: 12,
        alignItems: "center", justifyContent: "center", backgroundColor: SHEET.accent,
    },
    offText: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
    body: {
        color: "rgba(255,255,255,0.6)", fontSize: 13.5, lineHeight: 19,
        textAlign: "center", marginTop: 12,
    },
    cta: {
        height: 54, minWidth: 260, borderRadius: 27,
        alignItems: "center", justifyContent: "center", marginTop: 18,
    },
    ctaText: { color: "#fff", fontSize: 16.5, fontWeight: "800" },
    later: { paddingVertical: 12, paddingHorizontal: 18, marginTop: 2 },
    laterText: { color: "rgba(255,255,255,0.42)", fontSize: 14, fontWeight: "600" },
});
