import React from "react";
import Svg, { Path, G } from "react-native-svg";

interface Props {
    size?: number;
    color?: string;
}

/**
 * Brilliant-cut gem, drawn as facets rather than a flat rhombus.
 *
 * Everything is painted in the single `color` the caller passes, with facet
 * separation carried by opacity alone — so it still tints correctly wherever
 * it is used (rose on the ruby pill, white on the crown button, and the small
 * price badges). Same {size, color} signature as the Tabler icon it replaces,
 * so it is a drop-in.
 *
 * The facet edges are deliberately few: this renders as small as 10px on the
 * price badges, where more detail would turn to mud.
 */
export default function RubyIcon({ size = 20, color = "#FFFFFF" }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <G>
                {/* Pavilion — the deep lower half, darkest. */}
                <Path
                    d="M2.6 9.4 L12 21.6 L21.4 9.4 Z"
                    fill={color}
                    opacity={0.55}
                />
                {/* Left pavilion facet, catching a little more light. */}
                <Path
                    d="M2.6 9.4 L8.6 9.4 L12 21.6 Z"
                    fill={color}
                    opacity={0.72}
                />
                {/* Crown — the band between table and girdle. */}
                <Path
                    d="M2.6 9.4 L6.9 3.4 L17.1 3.4 L21.4 9.4 Z"
                    fill={color}
                    opacity={0.85}
                />
                {/* Table — the flat top, brightest so the gem reads as lit. */}
                <Path d="M8.6 9.4 L6.9 3.4 L17.1 3.4 L15.4 9.4 Z" fill={color} />
                {/* Specular glint on the crown's left shoulder. */}
                <Path
                    d="M6.9 3.4 L8.6 9.4 L4.9 6.4 Z"
                    fill={color}
                    opacity={0.95}
                />
            </G>
        </Svg>
    );
}
