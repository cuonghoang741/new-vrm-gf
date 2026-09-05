import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { AdUnits } from "../../config/ads";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { analyticsService } from "../../services/AnalyticsService";
import { surfaceOn } from "../../theme/surface";

/**
 * Anchored adaptive banner, hidden for PRO users.
 *
 * The slot is reserved at [SLOT_HEIGHT] from the first render and shows a
 * shimmering strip until the ad loads. Mediation audits check for exactly
 * this — a banner that appears out of nowhere and shoves content is a
 * finding, and the loading area has to be the banner's own size.
 *
 * Standard anchored adaptive, not the "large" variant: large reserves up to
 * ~100dp and a 320x50 creative then floats in a band of dead padding.
 *
 * Placement rules this component leaves to the caller: keep it out of
 * immersive/call surfaces, off screens with no content, and hide it while the
 * keyboard is up. Over a 3D/WebView surface it must stay pinned — a banner
 * that moves every frame forces the platform view to recomposite.
 */

/** Anchored adaptive resolves to ~50-60dp; reserve the top of that range. */
const SLOT_HEIGHT = 60;

export function AdBanner({
    placement = "banner",
    isBackgroundDark = true,
}: {
    placement?: string;
    /** Themes the slot + divider against the scene, like the other floating UI. */
    isBackgroundDark?: boolean;
}) {
    const { isPro } = useSubscription();
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const surface = surfaceOn(isBackgroundDark);

    if (isPro) return null;
    // Nothing is coming — give the space back instead of holding an empty
    // strip for the rest of the session.
    if (failed) return null;

    return (
        <View
            style={[
                styles.container,
                { backgroundColor: surface.glass, borderTopColor: surface.border },
            ]}
        >
            {!loaded && <BannerSkeleton tint={surface.border} />}
            <BannerAd
                unitId={AdUnits.banner}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: false }}
                onAdLoaded={() => {
                    setLoaded(true);
                    analyticsService.logAdLoaded("banner", placement);
                    // A banner is on screen as soon as it loads; there is no
                    // separate present step to hang an impression off.
                    analyticsService.logAdImpression("banner", placement);
                }}
                onAdFailedToLoad={(error: any) => {
                    setFailed(true);
                    analyticsService.logAdLoadFailed(
                        "banner",
                        placement,
                        error?.code ?? error?.message
                    );
                }}
            />
        </View>
    );
}

function BannerSkeleton({ tint }: { tint: string }) {
    const shimmer = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 0.7, duration: 700, useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0.3, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [shimmer]);

    return (
        <Animated.View
            style={[styles.skeleton, { backgroundColor: tint, opacity: shimmer }]}
            pointerEvents="none"
        />
    );
}

const styles = StyleSheet.create({
    container: {
        minHeight: SLOT_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        // Required divider between the ad and app content.
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    skeleton: {
        ...StyleSheet.absoluteFillObject,
        margin: 6,
        borderRadius: 8,
    },
});
