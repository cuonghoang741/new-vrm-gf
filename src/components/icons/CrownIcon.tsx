import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * TrueMate's PRO crown: gold, three peaks set with rose jewels, a ruby on
 * the band. Full colour on purpose: it is a brand mark, not a UI glyph, and
 * the monochrome Tabler crown read as a placeholder next to the art.
 *
 * Takes the Tabler crown's props so it is a drop-in; `color`/`fill` are
 * accepted and ignored (pass `mono` for a flat silhouette in that colour).
 */
export default function CrownIcon({ size = 20, mono, color }: {
    size?: number; mono?: boolean; color?: string; fill?: string;
}) {
    if (mono) {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path d="M3.2 8.6 L7.6 12.4 L12 4.9 L16.4 12.4 L20.8 8.6 L19.2 16.9 L4.8 16.9 Z" fill={color ?? "#fff"} />
                <Rect x={4.4} y={17.4} width={15.2} height={2.8} rx={1.1} fill={color ?? "#fff"} />
            </Svg>
        );
    }
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Defs>
                <LinearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#FFF4C2" />
                    <Stop offset="0.45" stopColor="#FFD54F" />
                    <Stop offset="1" stopColor="#E8901E" />
                </LinearGradient>
                <LinearGradient id="cb" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#F6B53A" />
                    <Stop offset="1" stopColor="#B8650F" />
                </LinearGradient>
                <RadialGradient id="cj" cx="0.35" cy="0.35" r="0.75">
                    <Stop offset="0" stopColor="#FFD1E3" />
                    <Stop offset="0.5" stopColor="#FF4D8D" />
                    <Stop offset="1" stopColor="#B0124F" />
                </RadialGradient>
            </Defs>
            <Path d="M3.2 8.6 L7.6 12.4 L12 4.9 L16.4 12.4 L20.8 8.6 L19.2 16.9 L4.8 16.9 Z" fill="url(#cg)" stroke="#8F5210" strokeWidth={0.7} strokeLinejoin="round" />
            <Path d="M4.4 10.2 L5.4 15.6" stroke="#FFFBE6" strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
            <Path d="M12 6.6 L9.3 11.3" stroke="#FFFBE6" strokeWidth={0.7} strokeLinecap="round" opacity={0.6} />
            <Rect x={4.4} y={16.6} width={15.2} height={3.4} rx={1.1} fill="url(#cb)" stroke="#8F5210" strokeWidth={0.7} />
            <Rect x={5.4} y={17.2} width={13.2} height={0.8} rx={0.4} fill="#FFE9A3" opacity={0.7} />
            <Circle cx={3.2} cy={8.4} r={1.55} fill="url(#cj)" stroke="#7A0E3E" strokeWidth={0.5} />
            <Circle cx={12} cy={4.6} r={1.75} fill="url(#cj)" stroke="#7A0E3E" strokeWidth={0.5} />
            <Circle cx={20.8} cy={8.4} r={1.55} fill="url(#cj)" stroke="#7A0E3E" strokeWidth={0.5} />
            <Path d="M12 16.2 L13.3 18.3 L12 20.4 L10.7 18.3 Z" fill="url(#cj)" stroke="#7A0E3E" strokeWidth={0.4} />
            <Circle cx={11.4} cy={4} r={0.45} fill="#fff" />
            <Circle cx={2.7} cy={7.9} r={0.35} fill="#fff" />
            <Circle cx={20.3} cy={7.9} r={0.35} fill="#fff" />
        </Svg>
    );
}
