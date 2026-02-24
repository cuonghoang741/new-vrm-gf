import React from 'react';

interface IconProps {
    icon: React.ElementType;
    size?: number;
    color?: string;
    strokeWidth?: number;
}

const Icon: React.FC<IconProps> = ({
    icon: IconComponent,
    size = 20,
    color,
    strokeWidth,
}) => {
    return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
};

export default Icon;
