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
import { takePreloadedNative } from "./nativeAdPreload";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { track } from "../../services/trackEvents";

/**
 * The tracking sheet names one event per native slot; the placement string we
 * already pass around is the key.
 */
const trackNativeOpen = (placement: string) => {
    const event = NATIVE_OPEN_EVENT[placement];
    if (event) track.raw(event);
};

const NATIVE_OPEN_EVENT: Record<string, string> = {
    native_language_1: "language_native_1_1_open",
    native_language_2: "language_native_1_2_open",
    native_onboarding_1_1: "onboarding1_native_open",
    native_onboarding_1_2: "onboarding3_native_open",
    native_onboarding_1_3: "onboarding4_native_open",
    native_welcome_back: "welcome_back_native_open",
};

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

    /**
     * A request that never answers used to shimmer for the rest of the
     * session: the slot only collapsed on an explicit failure, and a no-fill
     * that times out somewhere in mediation never produces one. After this
     * long the space goes back to the screen.
     */
    useEffect(() => {
        if (isPro || ad || failed) return;
        const t = setTimeout(() => {
            setFailed(true);
            analyticsService.logAdLoadFailed("native", placement, "timeout");
        }, LOAD_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [isPro, ad, failed, placement]);

    useEffect(() => {
        if (isPro) return;
        const unit = adUnitId ?? AdUnits.native;

        // If something preloaded this unit, show it on the first frame — no
        // skeleton at all. This is what makes a handover feel instant.
        const ready = takePreloadedNative(unit);
        if (ready) {
            setAd(ready);
            analyticsService.logAdLoaded("native", placement);
            trackNativeOpen(placement);
            return () => ready.destroy();
        }

        let cancelled = false;
        let loaded: NativeAd | null = null;
        NativeAd.createForAdRequest(unit, {
            requestNonPersonalizedAdsOnly: false,
        })
            .then((a) => {
                if (cancelled) {
                    a.destroy();
                } else {
                    loaded = a;
                    setAd(a);
                    analyticsService.logAdLoaded("native", placement);
                    trackNativeOpen(placement);
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
            <View style={[styles.row, fullWidthCta && styles.rowAboveCta]}>
                {/* The spacing lives on these wrappers, never on the asset
                    view itself: RN implements `gap` as margins on the direct
                    children, and a margin on a registered asset is what makes
                    AdMob's validator report assets outside the ad view. */}
                {ad.icon?.url ? (
                    <View style={styles.iconSlot}>
                        <NativeAsset assetType={NativeAssetType.ICON}>
                            <Image source={{ uri: ad.icon.url }} style={styles.icon} />
                        </NativeAsset>
                    </View>
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
                        <View style={styles.bodySlot}>
                        <NativeAsset assetType={NativeAssetType.BODY}>
                            <Text style={styles.body} numberOfLines={1}>
                                {ad.body}
                            </Text>
                        </NativeAsset>
                        </View>
                    ) : null}
                </View>
                {ad.callToAction && !fullWidthCta ? (
                    <View style={styles.ctaSlot}>
                        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                            <View style={[styles.cta, ctaColor ? { backgroundColor: ctaColor } : null]}>
                                <Text style={styles.ctaText} numberOfLines={1}>
                                    {ad.callToAction}
                                </Text>
                            </View>
                        </NativeAsset>
                    </View>
                ) : null}
            </View>

            {ad.callToAction && fullWidthCta ? (
                <View style={styles.ctaWideSlot}>
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
                </View>
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
/** How long a native slot may sit empty before it gives the space back. */
const LOAD_TIMEOUT_MS = 12_000;

const styles = StyleSheet.create({
    card: {
        // NativeAdView is a native view and measures itself against the window,
        // not the parent's content box — so without this it ignored the
        // screen's 20pt side padding and hung 20pt off the right edge.
        alignSelf: "stretch",
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        // NO padding on the ad view itself, in either axis.
        //
        // `NativeAsset` hands its child to the native ad view, which positions
        // registered assets inside the view's own content box — on top of the
        // position RN already gave them, so padding here is applied twice.
        // Horizontally that put the icon and the CTA 28pt from the left while
        // the CTA's right edge ran into the border; vertically it pushed the
        // whole card 14pt down and ate the bottom inset, leaving the CTA
        // sitting on the card's bottom edge. The insets live on the plain
        // wrapper views below, which the native side does not know about.
        // Tall enough for the 44px icon row plus padding, so the card never
        // has to grow past what NativeAdView measured. Clipping with
        // overflow:hidden was the wrong tool — it hid the overflow instead of
        // preventing it, and cut the body text mid-word, which is its own
        // policy finding ("content must be fully visible").
        minHeight: 76,
    },
    row: { flexDirection: "row", alignItems: "center", padding: 14 },
    /** With a full-width CTA under it, the row's bottom inset is the CTA's. */
    rowAboveCta: { paddingBottom: 0 },
    iconSlot: { marginRight: 12 },
    // The button keeps its size; the headline column (minWidth:0) is what
    // gives way when the text is long.
    ctaSlot: { marginLeft: 12, flexShrink: 0 },
    ctaWideSlot: { marginTop: 12, paddingHorizontal: 14, paddingBottom: 14 },
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
    bodySlot: { marginTop: 3 },
    body: { color: "rgba(255,255,255,0.6)", fontSize: 12.5 },
    cta: {
        backgroundColor: PINK,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
        maxWidth: 140,
    },
    ctaText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    ctaWide: {
        // No margin here: the wrapper (ctaWideSlot) carries the spacing.
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
