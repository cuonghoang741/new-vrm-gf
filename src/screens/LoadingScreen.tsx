import React, { useEffect, useRef } from "react";
import {
    Animated,
    Easing,
    Image,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { AdBanner } from "../components/ads/AdBanner";

/**
 * Boot gate. Replaces the bare logo that used to sit here.
 *
 * It exists so there is a screen long enough to host an ad at all: the old
 * splash resolved off local storage in well under a second, which is not
 * enough for a banner to fill — the user would have seen an empty strip and
 * nothing else. The navigator holds this for max(boot work, SPLASH_MIN_MS),
 * never their sum, so a slow boot costs nothing extra.
 *
 * The progress bar is honest about being indeterminate: it eases toward the
 * end and stops short rather than pretending to hit 100% and waiting.
 */
export function LoadingScreen() {
    const { t } = useTranslation();
    const progress = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0.85)).current;

    useEffect(() => {
        Animated.timing(progress, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();

        const breathe = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0.85,
                    duration: 900,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ])
        );
        breathe.start();
        return () => breathe.stop();
    }, [progress, pulse]);

    const width = progress.interpolate({
        inputRange: [0, 1],
        // Stops at 92%: an indeterminate bar that sits full while still
        // waiting reads as a hang.
        outputRange: ["8%", "92%"],
    });

    return (
        <View style={styles.root}>
            <View style={styles.center}>
                <Animated.View style={{ transform: [{ scale: pulse }] }}>
                    <Image
                        source={require("../../assets/splash-icon.png")}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>

                <View style={styles.track}>
                    <Animated.View style={[styles.fill, { width }]} />
                </View>

                <Text style={styles.caption}>{t("splash.loading")}</Text>
            </View>

            {/* The reason this screen has a dwell at all. Light tokens: the
                splash ground is pink, not dark. */}
            <AdBanner placement="splash" isBackgroundDark={false} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#FF6FA5" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    logo: { width: 108, height: 108 },
    track: {
        width: 168,
        height: 5,
        borderRadius: 3,
        marginTop: 34,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.28)",
    },
    fill: { height: "100%", borderRadius: 3, backgroundColor: "#FFFFFF" },
    caption: {
        marginTop: 14,
        color: "rgba(255,255,255,0.9)",
        fontSize: 13,
        fontWeight: "600",
        letterSpacing: 0.2,
    },
});
