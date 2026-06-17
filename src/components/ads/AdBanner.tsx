import React from "react";
import { View, StyleSheet } from "react-native";
import {
    BannerAd,
    BannerAdSize,
} from "react-native-google-mobile-ads";
import { AdUnits } from "../../config/ads";
import { useSubscription } from "../../contexts/SubscriptionContext";

/**
 * Anchored adaptive banner with a separator line from content (policy rule 27),
 * hidden for PRO users. Place only inside non-immersive, content-bearing
 * screens (not on the full-screen avatar/call screens).
 */
export function AdBanner() {
    const { isPro } = useSubscription();
    if (isPro) return null;

    return (
        <View style={styles.container}>
            <BannerAd
                unitId={AdUnits.banner}
                size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
                requestOptions={{ requestNonPersonalizedAdsOnly: false }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: "center",
        backgroundColor: "#0a0a1a",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "rgba(255,255,255,0.15)",
    },
});
