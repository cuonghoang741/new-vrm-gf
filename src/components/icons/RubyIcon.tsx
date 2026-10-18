import React from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

interface Props {
    size?: number;
    /** Only used with `mono`. */
    color?: string;
    /** A flat silhouette in `color`, for the rare place a coloured gem would clash. */
    mono?: boolean;
}

/**
 * TrueMate's ruby: a brilliant-cut gem in the app's rose, lit from the top
 * left, with a sparkle. It is the currency's face, so it is drawn in full
 * colour everywhere (it used to be one flat tint at varying opacity, which
 * read as a generic diamond glyph). Same {size, color} props as before, so
 * every call site picks it up; `color` now only matters with `mono`.
 */
export default function RubyIcon({ size = 20, color = "#FFFFFF", mono }: Props) {
    if (mono) {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path d="M2.4 9.2 L6.8 3.2 L17.2 3.2 L21.6 9.2 L12 21.8 Z" fill={color} />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Defs>
                <LinearGradient id="rt" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFE3EE" />
                    <Stop offset="1" stopColor="#FF9CC2" />
                </LinearGradient>
                <LinearGradient id="rc" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#FF7EAD" />
                    <Stop offset="1" stopColor="#F02D6E" />
                </LinearGradient>
                <LinearGradient id="rp" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#E9306F" />
                    <Stop offset="1" stopColor="#8E0F45" />
                </LinearGradient>
                <LinearGradient id="rpl" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#FF5C93" />
                    <Stop offset="1" stopColor="#C21659" />
                </LinearGradient>
            </Defs>
            <Path d="M2.4 9.2 L12 21.8 L21.6 9.2 Z" fill="url(#rp)" />
            <Path d="M2.4 9.2 L8.4 9.2 L12 21.8 Z" fill="url(#rpl)" />
            <Path d="M15.6 9.2 L21.6 9.2 L12 21.8 Z" fill="#7E0D3C" opacity={0.55} />
            <Path d="M2.4 9.2 L6.8 3.2 L17.2 3.2 L21.6 9.2 Z" fill="url(#rc)" />
            <Path d="M8.4 9.2 L6.8 3.2 L17.2 3.2 L15.6 9.2 Z" fill="url(#rt)" />
            <Path d="M6.8 3.2 L8.4 9.2 L2.4 9.2 Z" fill="#FFB3CF" />
            <Path d="M17.2 3.2 L21.6 9.2 L15.6 9.2 Z" fill="#D41E5E" />
            <Path d="M2.4 9.2 L6.8 3.2 L17.2 3.2 L21.6 9.2 L12 21.8 Z" fill="none" stroke="#6E0B35" strokeWidth={0.7} strokeLinejoin="round" />
            <Path d="M2.4 9.2 H21.6" stroke="#6E0B35" strokeWidth={0.45} opacity={0.6} />
            <Path d="M18.6 1.4 L19.2 2.8 L20.6 3.4 L19.2 4 L18.6 5.4 L18 4 L16.6 3.4 L18 2.8 Z" fill="#fff" />
            <Path d="M7.6 4.2 L9 8.4" stroke="#fff" strokeWidth={0.9} strokeLinecap="round" opacity={0.85} />
        </Svg>
    );
}
