import React, { useCallback } from 'react';
import { Pressable, PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';

interface HapticPressableProps extends PressableProps {
    hapticStyle?: Haptics.ImpactFeedbackStyle;
}

export const HapticPressable: React.FC<HapticPressableProps> = ({
    onPress,
    hapticStyle = Haptics.ImpactFeedbackStyle.Light,
    children,
    ...rest
}) => {
    const handlePress = useCallback(
        (e: any) => {
            Haptics.impactAsync(hapticStyle);
            onPress?.(e);
        },
        [onPress, hapticStyle]
    );

    return (
        <Pressable onPress={handlePress} {...rest}>
            {children}
        </Pressable>
    );
};

export default HapticPressable;
