import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import {
    NativeAd,
    NativeAdView,
    NativeAsset,
    NativeAssetType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../../config/ads";
import { useSubscription } from "../../contexts/SubscriptionContext";

/**
 * Compact native advertising card (icon + headline + body + CTA) with the
 * required "Ad" attribution badge. Hidden for PRO users and while nothing has
 * loaded (collapses to null, reserving no space) — safe to drop into the
 * language / onboarding / welcome-back screens like Yuuki's native placements.
 */
export function NativeAdCard() {
    const { isPro } = useSubscription();
    const [ad, setAd] = useState<NativeAd | null>(null);

    useEffect(() => {
        if (isPro) return;
        let cancelled = false;
        let loaded: NativeAd | null = null;
        NativeAd.createForAdRequest(AdUnits.native, {
            requestNonPersonalizedAdsOnly: false,
        })
            .then((a) => {
                if (cancelled) {
                    a.destroy();
                } else {
                    loaded = a;
                    setAd(a);
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            loaded?.destroy();
        };
    }, [isPro]);

    if (isPro || !ad) return null;

    return (
        <NativeAdView nativeAd={ad} style={styles.card}>
            <View style={styles.row}>
                {ad.icon?.url ? (
                    <NativeAsset assetType={NativeAssetType.ICON}>
                        <Image source={{ uri: ad.icon.url }} style={styles.icon} />
                    </NativeAsset>
                ) : null}
                <View style={styles.middle}>
                    <View style={styles.headlineRow}>
                        <Text style={styles.adBadge}>Ad</Text>
                        <NativeAsset assetType={NativeAssetType.HEADLINE}>
                            <Text style={styles.headline} numberOfLines={1}>
                                {ad.headline}
                            </Text>
                        </NativeAsset>
                    </View>
                    {ad.body ? (
                        <NativeAsset assetType={NativeAssetType.BODY}>
                            <Text style={styles.body} numberOfLines={2}>
                                {ad.body}
                            </Text>
                        </NativeAsset>
                    ) : null}
                </View>
                {ad.callToAction ? (
                    <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                        <View style={styles.cta}>
                            <Text style={styles.ctaText} numberOfLines={1}>
                                {ad.callToAction}
                            </Text>
                        </View>
                    </NativeAsset>
                ) : null}
            </View>
        </NativeAdView>
    );
}

const PINK = "#FF6FA5";

const styles = StyleSheet.create({
    card: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
    },
    row: { flexDirection: "row", alignItems: "center" },
    icon: { width: 44, height: 44, borderRadius: 10, marginRight: 12 },
    middle: { flex: 1, marginRight: 10 },
    headlineRow: { flexDirection: "row", alignItems: "center" },
    adBadge: {
        color: "#0a0a1a",
        backgroundColor: "#FFC107",
        fontSize: 10,
        fontWeight: "800",
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        marginRight: 6,
        overflow: "hidden",
    },
    headline: { color: "#fff", fontSize: 15, fontWeight: "700", flexShrink: 1 },
    body: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, marginTop: 3 },
    cta: {
        backgroundColor: PINK,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
