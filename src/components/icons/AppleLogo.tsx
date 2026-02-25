import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
    size?: number;
    color?: string;
}

/**
 * Official Apple logo path (SF Symbols / Apple brand guidelines)
 */
export default function AppleLogo({ size = 20, color = "#FFFFFF" }: Props) {
    return (
        <Svg width={size} height={size} viewBox="0 0 17 20" fill="none">
            <Path
                d="M13.286 10.578c-.022-2.387 1.948-3.534 2.036-3.588-1.108-1.62-2.833-1.842-3.448-1.867-1.468-.149-2.865.864-3.612.864-.746 0-1.9-.843-3.122-.82C3.59 5.19 2.128 6.141 1.323 7.614c-1.634 2.834-.418 7.032 1.174 9.332.779 1.126 1.707 2.391 2.928 2.346 1.174-.047 1.617-.76 3.035-.76 1.418 0 1.815.76 3.054.736 1.264-.023 2.065-1.148 2.839-2.278.895-1.306 1.263-2.57 1.286-2.634-.028-.013-2.466-.947-2.49-3.757l.137-.021zM10.941 3.603C11.594 2.81 12.036 1.73 11.918.632c-.935.038-2.068.623-2.739 1.407-.602.698-1.128 1.814-.988 2.883 1.044.081 2.11-.53 2.75-1.319z"
                fill={color}
            />
        </Svg>
    );
}
