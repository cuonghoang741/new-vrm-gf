import React, { useEffect, useRef, useState } from "react";
import { Animated, View, Text, Image, StyleSheet } from "react-native";
import {
    NativeAd,
    NativeAdView,
    NativeAsset,
    NativeAssetType,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../../config/ads";
import { analyticsService } from "../../services/AnalyticsService";
import { useSubscription } from "../../contexts/SubscriptionContext";

/**
 * Compact native advertising card (icon + headline + body + CTA) with the
 * required "Ad" attribution badge.
 *
 * The slot is present from the first render and shows a same-size skeleton
 * until the ad arrives. Mediation audits check exactly this: a card that
 * pops in from zero height is a finding ("do not pop the ad in suddenly"),
 * and the loading area has to match the real card's size. It only collapses
 * for PRO, or once the load has definitively failed.
 */
export function NativeAdCard({
    placement = "native",
    ctaColor,
    cornerRadius,
    adUnitId,
    fullWidthCta = false,
}: {
    placement?: string;
    /** Defaults to the shared native unit; the language screen passes its own. */
    adUnitId?: string;
    /**
     * Yuuki's `isCompact`: CTA on its own row spanning the card instead of a
     * small button on the right.
     */
    fullWidthCta?: boolean;
    /**
     * 0 for an edge-to-edge footer banner, left undefined for a contained
     * card. Same knob yuuki exposes.
     */
    cornerRadius?: number;
    /**
     * CTA fill for this placement. yuuki exposes the same knob per placement
     * rather than hardcoding one colour.
     */
    ctaColor?: string;
}) {
    const { isPro } = useSubscription();
    const [ad, setAd] = useState<NativeAd | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (isPro) return;
        let cancelled = false;
        let loaded: NativeAd | null = null;
        NativeAd.createForAdRequest(adUnitId ?? AdUnits.native, {
            requestNonPersonalizedAdsOnly: false,
        })
            .then((a) => {
                if (cancelled) {
                    a.destroy();
                } else {
                    loaded = a;
                    setAd(a);
                    analyticsService.logAdLoaded("native", placement);
                }
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
                analyticsService.logAdLoadFailed("native", placement);
            });
        return () => {
            cancelled = true;
            loaded?.destroy();
        };
    }, [isPro, adUnitId]);

    if (isPro) return null;
    // Nothing will ever arrive — give the space back rather than leaving a
    // skeleton shimmering forever.
    if (failed) return null;
    if (!ad) return <NativeAdSkeleton cornerRadius={cornerRadius} />;

    return (
        <NativeAdView
            nativeAd={ad}
            style={[styles.card, cornerRadius !== undefined && { borderRadius: cornerRadius }]}
        >
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
                            <Text style={styles.body} numberOfLines={1}>
                                {ad.body}
                            </Text>
                        </NativeAsset>
                    ) : null}
                </View>
                {ad.callToAction && !fullWidthCta ? (
                    <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                        <View style={[styles.cta, ctaColor ? { backgroundColor: ctaColor } : null]}>
                            <Text style={styles.ctaText} numberOfLines={1}>
                                {ad.callToAction}
                            </Text>
                        </View>
                    </NativeAsset>
                ) : null}
            </View>

            {ad.callToAction && fullWidthCta ? (
                <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                    <View
                        style={[
                            styles.ctaWide,
                            ctaColor ? { backgroundColor: ctaColor } : null,
                        ]}
                    >
                        <Text style={styles.ctaText} numberOfLines={1}>
                            {ad.callToAction}
                        </Text>
                    </View>
                </NativeAsset>
            ) : null}
        </NativeAdView>
    );
}

/**
 * Placeholder with the same box model as the loaded card — same padding,
 * radius, border and the same 44px icon row — so the slot does not resize
 * when the real ad swaps in.
 */
function NativeAdSkeleton({ cornerRadius }: { cornerRadius?: number }) {
    const shimmer = useRef(new Animated.Value(0.35)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 0.75, duration: 700, useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0.35, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [shimmer]);

    return (
        <View style={[styles.card, styles.skeletonCard, cornerRadius !== undefined && { borderRadius: cornerRadius }]}>
            <View style={styles.row}>
                <Animated.View style={[styles.icon, styles.bone, { opacity: shimmer }]} />
                <View style={styles.middle}>
                    <Animated.View style={[styles.boneLine, { width: "62%", opacity: shimmer }]} />
                    <Animated.View style={[styles.boneLine, { width: "88%", marginTop: 7, height: 9, opacity: shimmer }]} />
                </View>
                <Animated.View style={[styles.ctaBone, { opacity: shimmer }]} />
            </View>
        </View>
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
        // Tall enough for the 44px icon row plus padding, so the card never
        // has to grow past what NativeAdView measured. Clipping with
        // overflow:hidden was the wrong tool — it hid the overflow instead of
        // preventing it, and cut the body text mid-word, which is its own
        // policy finding ("content must be fully visible").
        minHeight: 76,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    // No margins on an asset view: spacing comes from the row's gap. A margin
    // on the registered asset is a common trigger for AdMob's "advertiser
    // assets outside native ad view" finding.
    icon: { width: 44, height: 44, borderRadius: 10 },
    // minWidth:0 is what actually lets a flex child shrink below its content
    // width; without it a long headline pushes the CTA past the card edge.
    middle: { flex: 1, minWidth: 0 },
    headlineRow: { flexDirection: "row", alignItems: "center" },
    adBadge: {
        color: "#0a0a1a",
        backgroundColor: "#FFC107",
        // AdMob requires the "Ad" attribution to be prominent — 15px minimum.
        // It was 10px, which is a finding on its own.
        fontSize: 15,
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
        flexShrink: 0,
        maxWidth: 128,
    },
    ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    ctaWide: {
        marginTop: 10,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PINK,
    },

    // ─── Loading skeleton (must match the card's box model) ───
    skeletonCard: { backgroundColor: "rgba(255,255,255,0.04)" },
    bone: { backgroundColor: "rgba(255,255,255,0.16)" },
    boneLine: { height: 11, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.16)" },
    ctaBone: { width: 78, height: 34, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)" },
});
