import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
    size?: number;
    color?: string;
}

/**
 * Padlock with a solid body and a keyhole, replacing the thin outline lock.
 *
 * Drawn filled rather than stroked: these sit on top of character art and
 * background photos at 16-40px, where a 2px outline disappears into the image.
 * A solid body holds its shape against anything behind it.
 *
 * Single-colour and tintable, same {size, color} signature as the Tabler icon.
 */
export default function LockIcon({ size = 20, color = "#FFFFFF" }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            {/* Shackle. Stroked, with the stroke width scaled to the viewBox so
                it stays proportional at every render size. */}
            <Path
                d="M7.4 10.2 V7.6 a4.6 4.6 0 0 1 9.2 0 v2.6"
                stroke={color}
                strokeWidth={2.1}
                strokeLinecap="round"
                fill="none"
                opacity={0.9}
            />
            {/* Body. */}
            <Rect
                x="3.9"
                y="10"
                width="16.2"
                height="11.4"
                rx="3.2"
                fill={color}
            />
            {/* Keyhole, punched out by painting it in the surrounding colour's
                absence — a hole would need a mask, so it is drawn as a low-alpha
                shape that reads as depth on any body colour. */}
            <Path
                d="M12 13.4 a1.85 1.85 0 0 1 1.05 3.37 l0.42 2.32 a0.5 0.5 0 0 1 -0.49 0.59 h-1.96 a0.5 0.5 0 0 1 -0.49 -0.59 l0.42 -2.32 A1.85 1.85 0 0 1 12 13.4 Z"
                fill="#000000"
                opacity={0.42}
            />
        </Svg>
    );
}
