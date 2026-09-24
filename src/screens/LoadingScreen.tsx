import React, { useEffect, useRef } from "react";
import {
    Animated,
    Easing,
    Image,
    StyleSheet,
    View,
} from "react-native";
import { AdBanner } from "../components/ads/AdBanner";
import { track } from "../services/trackEvents";

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
 *
 * No caption. This screen runs BEFORE the language picker, so there is no
 * language to write it in — it fell back to the default and greeted an English
 * or Japanese user in Vietnamese. A logo and a moving bar say "loading" in
 * every language.
 */
export function LoadingScreen() {
    const progress = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0.85)).current;

    useEffect(() => {
        track.splashView();
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
});
