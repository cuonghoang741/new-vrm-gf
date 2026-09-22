import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { AdUnits } from "../../config/ads";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { analyticsService } from "../../services/AnalyticsService";
import { track } from "../../services/trackEvents";

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
/** Yuuki's AdBannerSlot: up to 3 tries, 2 s apart, before giving the space back. */
const MAX_TRIES = 3;
const RETRY_MS = 2000;

export function AdBanner({
    placement = "banner",
    isBackgroundDark = true,
}: {
    placement?: string;
    /** Themes the slot + divider against the scene, like the other floating UI. */
    isBackgroundDark?: boolean;
}) {
    const { t } = useTranslation();
    const { isPro } = useSubscription();
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
    }, []);

    if (isPro) return null;
    // Nothing is coming — give the space back instead of holding an empty
    // strip for the rest of the session.
    if (failed) return null;

    return (
        // Same frame as Yuuki's banner slot: solid dark plate, 1px light rule
        // on top, "Loading ad…" in the reserved space until the ad arrives.
        <View style={styles.container}>
            {!loaded && (
                <>
                    <BannerSkeleton tint="rgba(255,255,255,0.06)" />
                    <Text style={styles.loadingText}>{t("ads.loading")}</Text>
                </>
            )}
            <BannerAd
                key={attempt}
                unitId={AdUnits.banner}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: false }}
                onAdLoaded={() => {
                    setLoaded(true);
                    analyticsService.logAdLoaded("banner", placement);
                    // A banner is on screen as soon as it loads; there is no
                    // separate present step to hang an impression off.
                    analyticsService.logAdImpression("banner", placement);
                    if (placement === "banner_home" || placement === "banner") track.bannerHomeOpen();
                }}
                onAdFailedToLoad={(error: any) => {
                    if (attempt + 1 < MAX_TRIES) {
                        retryTimer.current = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
                    } else {
                        setFailed(true);
                    }
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
        backgroundColor: "#17102B",
        // Required divider between the ad and app content.
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.22)",
    },
    loadingText: {
        position: "absolute",
        color: "rgba(255,255,255,0.4)",
        fontSize: 12,
        fontWeight: "600",
    },
    skeleton: {
        ...StyleSheet.absoluteFillObject,
        margin: 6,
        borderRadius: 8,
    },
});
