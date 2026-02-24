import React from 'react';
import { Pressable, PressableProps } from 'react-native';

import * as Haptics from 'expo-haptics';

export type HapticType =
  | 'none'
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

export function triggerHaptic(type: HapticType = 'selection') {
  try {
    switch (type) {
      case 'none':
        return;
      case 'selection':
        Haptics.selectionAsync();
        return;
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      default:
        Haptics.selectionAsync();
    }
  } catch (_) {
    // noop on web or unsupported platforms
  }
}


export interface HapticPressableProps extends PressableProps {
  haptic?: HapticType;
}

export const HapticPressable: React.FC<HapticPressableProps> = ({
  haptic = 'selection',
  onPress,
  disabled,
  ...rest
}) => {
  const handlePress = React.useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      triggerHaptic(haptic);
      onPress?.(event);
    },
    [haptic, onPress],
  );

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      // When disabled, allow touches to pass through so parent ScrollView can scroll
      pointerEvents={disabled ? 'none' : 'auto'}
      onPress={handlePress}
    />
  );
};

export default HapticPressable;
