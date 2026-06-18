import React, { useEffect, useMemo, useRef } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
    Circle,
    Defs,
    Line,
    RadialGradient,
    Rect,
    Stop,
} from "react-native-svg";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Star = { x: number; y: number; r: number; group: number; opacity: number };

function makeStars(count: number, w: number, h: number): Star[] {
    const stars: Star[] = [];
    for (let i = 0; i < count; i++) {
        stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.5 + 0.4,
            group: i % 3,
            opacity: Math.random() * 0.5 + 0.35,
        });
    }
    return stars;
}

// Constellation shapes in normalized 0..1 coords (scaled to screen).
const CONSTELLATIONS: number[][][] = [
    [[0.12, 0.16], [0.20, 0.10], [0.28, 0.18], [0.33, 0.30], [0.26, 0.38]],
    [[0.72, 0.10], [0.80, 0.18], [0.88, 0.13], [0.84, 0.26], [0.92, 0.33]],
    [[0.55, 0.60], [0.63, 0.68], [0.71, 0.63], [0.67, 0.77]],
];

interface Props {
    style?: StyleProp<ViewStyle>;
    /** Skip the opaque base gradient — overlay stars on existing content. */
    transparentBase?: boolean;
    starCount?: number;
    showConstellations?: boolean;
}

export function GalaxyBackground({
    style,
    transparentBase = false,
    starCount = 80,
    showConstellations = true,
}: Props) {
    const w = SCREEN_W;
    const h = SCREEN_H;

    const stars = useMemo(() => makeStars(starCount, w, h), [starCount, w, h]);
    const groups = useMemo(
        () => [0, 1, 2].map((g) => stars.filter((s) => s.group === g)),
        [stars]
    );

    // Twinkle: one animated opacity per star group (native driver = smooth).
    const twinkle = useRef([
        new Animated.Value(0.4),
        new Animated.Value(0.7),
        new Animated.Value(1),
    ]).current;

    // Shooting star sweep.
    const shoot = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loops = twinkle.map((v, i) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(v, {
                        toValue: 1,
                        duration: 1500 + i * 500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(v, {
                        toValue: 0.35,
                        duration: 1500 + i * 500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            )
        );
        loops.forEach((l) => l.start());

        const shootLoop = Animated.loop(
            Animated.sequence([
                Animated.delay(2500),
                Animated.timing(shoot, {
                    toValue: 1,
                    duration: 1100,
                    easing: Easing.in(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(shoot, { toValue: 0, duration: 0, useNativeDriver: true }),
                Animated.delay(4000),
            ])
        );
        shootLoop.start();

        return () => {
            loops.forEach((l) => l.stop());
            shootLoop.stop();
        };
    }, [twinkle, shoot]);

    const shootTranslateX = shoot.interpolate({
        inputRange: [0, 1],
        outputRange: [-w * 0.3, w * 0.9],
    });
    const shootTranslateY = shoot.interpolate({
        inputRange: [0, 1],
        outputRange: [h * 0.12, h * 0.45],
    });
    const shootOpacity = shoot.interpolate({
        inputRange: [0, 0.1, 0.8, 1],
        outputRange: [0, 1, 1, 0],
    });

    return (
        <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
            {!transparentBase && (
                <LinearGradient
                    colors={["#0A0420", "#1A0B3A", "#2A0E47", "#0C0524"]}
                    locations={[0, 0.4, 0.7, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            )}

            {/* Nebula glows (soft pink + purple). */}
            <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
                <Defs>
                    <RadialGradient id="nebPink" cx="78%" cy="18%" r="55%">
                        <Stop offset="0%" stopColor="#FF6FA5" stopOpacity={transparentBase ? 0.25 : 0.45} />
                        <Stop offset="100%" stopColor="#FF6FA5" stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="nebPurple" cx="18%" cy="82%" r="60%">
                        <Stop offset="0%" stopColor="#9B5CFF" stopOpacity={transparentBase ? 0.22 : 0.4} />
                        <Stop offset="100%" stopColor="#9B5CFF" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={w} height={h} fill="url(#nebPink)" />
                <Rect x={0} y={0} width={w} height={h} fill="url(#nebPurple)" />

                {/* Constellation lines + node stars. */}
                {showConstellations &&
                    CONSTELLATIONS.flatMap((pts, ci) => {
                        const nodes = pts.map(([nx, ny]) => ({ x: nx * w, y: ny * h }));
                        const lines = nodes.slice(1).map((p, i) => (
                            <Line
                                key={`l-${ci}-${i}`}
                                x1={nodes[i].x}
                                y1={nodes[i].y}
                                x2={p.x}
                                y2={p.y}
                                stroke="#FFD9EC"
                                strokeWidth={0.7}
                                strokeOpacity={0.35}
                            />
                        ));
                        const dots = nodes.map((p, i) => (
                            <Circle
                                key={`n-${ci}-${i}`}
                                cx={p.x}
                                cy={p.y}
                                r={1.6}
                                fill="#FFFFFF"
                                fillOpacity={0.9}
                            />
                        ));
                        return [...lines, ...dots];
                    })}
            </Svg>

            {/* Twinkling star layers (group opacity animated). */}
            {groups.map((groupStars, gi) => (
                <Animated.View
                    key={gi}
                    style={[StyleSheet.absoluteFill, { opacity: twinkle[gi] }]}
                >
                    <Svg width={w} height={h}>
                        {groupStars.map((s, i) => (
                            <Circle
                                key={i}
                                cx={s.x}
                                cy={s.y}
                                r={s.r}
                                fill="#FFFFFF"
                                fillOpacity={s.opacity}
                            />
                        ))}
                    </Svg>
                </Animated.View>
            ))}

            {/* Shooting star. */}
            <Animated.View
                style={[
                    styles.shootingStar,
                    {
                        opacity: shootOpacity,
                        transform: [
                            { translateX: shootTranslateX },
                            { translateY: shootTranslateY },
                            { rotate: "25deg" },
                        ],
                    },
                ]}
            >
                <LinearGradient
                    colors={["rgba(255,255,255,0)", "#FFD9EC", "#FFFFFF"]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.shootingTail}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    shootingStar: {
        position: "absolute",
        top: 0,
        left: 0,
        width: 120,
        height: 2,
    },
    shootingTail: {
        flex: 1,
        borderRadius: 2,
    },
});
