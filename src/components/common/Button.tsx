import React from 'react';
import { ActivityIndicator, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

import { useTheme } from '@/contexts';

import Icon from '../Icon/Icon';
import Typography from '../Typography/Typography';
import { HapticPressable } from '../haptic-pressable';

export interface ButtonProps {
  children?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'solid' | 'outline' | 'ghost' | 'link' | 'whiteShadow' | 'liquid';
  colorScheme?: 'brand' | 'error' | 'success' | 'warning' | 'gray';
  style?: StyleProp<ViewStyle>;
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl';

  // Liquid glass specific props
  liquidEffect?: 'clear' | 'regular';
  tintColor?: string;

  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  isIconOnly?: boolean;
  startIcon?: React.ElementType;
  startIconSize?: number;
  startIconColor?: string;
  startIconStrokeWidth?: number;
  startIconVariant?: never;
  endIconSize?: number;
  endIconColor?: string;
  endIcon?: React.ElementType;
  endIconVariant?: never;
  textColor?: string;
  onPress?: () => void;
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = 'md',
  variant = 'solid',
  colorScheme = 'brand',
  fullWidth = false,
  disabled,
  loading,
  isIconOnly = false,
  startIcon,
  startIconSize = 20,
  startIconColor,
  startIconStrokeWidth = 1.5,
  startIconVariant,
  endIconSize = 20,
  endIconColor,
  endIcon,
  endIconVariant,
  onPress,
  style,
  shadow = 'none',
  textColor,

  // Liquid glass props
  liquidEffect = 'clear',
  tintColor,
}) => {
  const theme = useTheme();

  // Compute the text color so icons can default to it
  const computedTextColor = makeButtonStyles(theme, {
    size,
    variant,
    colorScheme,
    fullWidth,
    disabled: !!disabled,
    loading: !!loading,
    isIconOnly,
    shadow,
    textColor,
  }).text.color as string;

  const buttonContent = (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 'auto' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing(2),
          opacity: loading ? 0 : 1,
        }}
      >
        {startIcon ? (
          <Icon
            icon={startIcon}
            size={startIconSize}
            color={startIconColor ?? computedTextColor}
            strokeWidth={startIconStrokeWidth}
          // Icon component does not support variant
          />
        ) : null}
        {!isIconOnly && (
          <Typography
            style={
              makeButtonStyles(theme, {
                size,
                variant,
                colorScheme,
                fullWidth,
                disabled: !!disabled,
                loading: !!loading,
                isIconOnly,
                shadow,
                textColor,
              }).text
            }
          >
            {children}
          </Typography>
        )}
        {endIcon ? <Icon icon={endIcon} size={endIconSize} color={endIconColor ?? computedTextColor} /> : null}
      </View>

      {loading ? (
        <ActivityIndicator
          size='small'
          color='white'
          style={{ position: 'absolute' }}
        />
      ) : null}
    </View>
  );

  // Render with liquid glass effect
  if (variant === 'liquid' && isLiquidGlassSupported) {
    return (
      <HapticPressable onPress={onPress} disabled={disabled || loading}>
        <LiquidGlassView
          effect={liquidEffect}
          interactive
          style={[
            makeButtonStyles(theme, {
              size,
              variant,
              colorScheme,
              fullWidth,
              disabled: !!disabled,
              loading: !!loading,
              isIconOnly,
              shadow,
            }).button,
            {
              backgroundColor:
                Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            }, // Android needs slight white bg
            style,
          ]}
          tintColor={tintColor}
        >
          {buttonContent}
        </LiquidGlassView>
      </HapticPressable>
    );
  } else if (variant === 'liquid' && !isLiquidGlassSupported) {
    return (
      <HapticPressable
        style={({ pressed }) => [
          makeButtonStyles(theme, {
            size,
            variant,
            colorScheme,
            fullWidth,
            disabled: !!disabled,
            loading: !!loading,
            isIconOnly,
            pressed: !!pressed,
            shadow,
          }).button,
          { backgroundColor: tintColor || 'white' },
          style,
        ]}
        onPress={onPress}
        disabled={disabled || loading}
      >
        {buttonContent}
      </HapticPressable>
    );
  }

  // Fallback for non-liquid variants or unsupported devices
  return (
    <HapticPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        makeButtonStyles(theme, {
          size,
          variant: variant === 'liquid' && !isLiquidGlassSupported ? 'ghost' : variant,
          colorScheme,
          fullWidth,
          disabled: !!disabled,
          loading: !!loading,
          isIconOnly,
          pressed: !!pressed,
          shadow,
        }).button,
        style,
      ]}
    >
      {buttonContent}
      {variant === 'whiteShadow' ? (
        <>
          <LinearGradient
            pointerEvents='none'
            colors={['#FFFFFF80', '#FFFFFF00', '#FFFFFF00', '#FFFFFF00']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={
              makeButtonStyles(theme, {
                size,
                variant,
                colorScheme,
                fullWidth,
                disabled: !!disabled,
                loading: !!loading,
                isIconOnly,
                shadow,
              }).gradientOverlay
            }
          />
          <View
            pointerEvents='none'
            style={
              makeButtonStyles(theme, {
                size,
                variant,
                colorScheme,
                fullWidth,
                disabled: !!disabled,
                loading: !!loading,
                isIconOnly,
                shadow,
              }).innerOverlay
            }
          />
        </>
      ) : null}
    </HapticPressable>
  );
};

/* ----------------- Styles factory ----------------- */
function makeButtonStyles(
  theme: ReturnType<typeof useTheme>,
  {
    size,
    variant,
    colorScheme,
    fullWidth,
    disabled,
    loading,
    isIconOnly,
    pressed,
    shadow = 'none',
    textColor,
  }: Required<
    Pick<
      ButtonProps,
      | 'size'
      | 'variant'
      | 'colorScheme'
      | 'fullWidth'
      | 'disabled'
      | 'loading'
      | 'isIconOnly'
      | 'shadow'
    >
  > & { pressed?: boolean; textColor?: string },
) {
  // size variants
  const sizeStyles = {
    sm: {
      paddingHorizontal: theme.spacing(2.5),
      paddingVertical: theme.spacing(1.5),
      height: theme.spacing(9),
      fontSize: theme.typography.text.sm.fontSize,
    },
    md: {
      paddingHorizontal: theme.spacing(3),
      paddingVertical: theme.spacing(2),
      height: theme.spacing(10),
      fontSize: theme.typography.text.md.fontSize,
    },
    lg: {
      paddingHorizontal: theme.spacing(4),
      paddingVertical: theme.spacing(2.5),
      height: theme.spacing(11),
      fontSize: theme.typography.text.lg.fontSize,
    },
    xl: {
      paddingHorizontal: theme.spacing(4.5),
      paddingVertical: theme.spacing(3),
      height: theme.spacing(12),
      fontSize: theme.typography.text.xl.fontSize,
    },
    '2xl': {
      paddingHorizontal: theme.spacing(5),
      paddingVertical: theme.spacing(4.5),
      height: theme.spacing(15),
      fontSize: theme.typography.text.xl.fontSize,
    },
  } as const;

  // base colors theo colorScheme
  const colors = {
    brand: {
      bg: theme.colors.background.brand_solid,
      text: theme.colors.text.brand_secondary,
      border: theme.colors.border.brand_alt,
    },
    error: {
      bg: theme.colors.background.error_solid,
      text: theme.colors.text.error_primary,
      border: theme.colors.border.border_error,
    },
    success: {
      bg: theme.colors.background.success_solid,
      text: theme.colors.text.success_primary,
      border: theme.colors.border.border_success,
    },
    warning: {
      bg: theme.colors.background.warning_solid,
      text: theme.colors.text.warning_primary,
      border: theme.colors.border.border_warning,
    },
    gray: {
      bg: theme.colors.background.brand_primary_alt,
      text: theme.colors.text.gray_primary,
      border: theme.colors.border.primary,
    },
  }[colorScheme];

  // Normalize 'liquid' to 'ghost' within style factory to avoid undefined
  const normalizedVariant = variant === 'liquid' ? 'ghost' : variant;
  // Store if this is a whiteShadow variant before normalization
  const isWhiteShadow = variant === 'whiteShadow';

  // variant overrides
  const variantStyles = {
    solid: {
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      textColor: theme.colors.text.primary_on_brand,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      textColor: colors.text,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      textColor: colors.text,
    },
    link: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      textColor: colors.text,
    },
    whiteShadow: {
      backgroundColor: colors.bg,
      borderWidth: 0,
      borderColor: 'transparent',
      textColor: theme.colors.text.primary_on_brand,
      // shadow
      shadowColor: 'white',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
  }[normalizedVariant];

  // pressed + disabled
  const pressedStyle = pressed ? { opacity: 0.85 } : {};
  const disabledStyle = disabled || loading ? { opacity: 0.65 } : {};
  const fullWidthStyle = fullWidth ? { flex: 1 } : {};

  // shadow variants
  const shadowStyles = {
    none: {},
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
  };

  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.full,
      // Allow outer shadow for whiteShadow variant or when custom shadow is applied
      overflow: isWhiteShadow || (shadow !== 'none' && !isWhiteShadow) ? 'visible' : 'hidden',
      ...sizeStyles[size],
      // Only override padding for link variant, preserve sizeStyles padding for others
      ...(normalizedVariant === 'link'
        ? {
          paddingHorizontal: 0,
          paddingVertical: 0,
          padding: 0,
        }
        : {
          // For non-link variants, use sizeStyles padding but allow icon-only override
          paddingHorizontal: sizeStyles[size].paddingHorizontal,
          paddingVertical: sizeStyles[size].paddingVertical,
          ...(isIconOnly ? { padding: theme.spacing(2) } : {}),
        }),
      backgroundColor: variantStyles.backgroundColor,
      borderWidth: variantStyles.borderWidth,
      borderColor: variantStyles.borderColor,
      // Apply whiteShadow outer shadow when requested
      ...(isWhiteShadow
        ? {
          shadowColor: 'white',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }
        : {}),
      // Apply custom shadow when not whiteShadow variant and shadow is not 'none'
      ...(!isWhiteShadow && shadow !== 'none' ? shadowStyles[shadow] : {}),
      ...pressedStyle,
      ...disabledStyle,
      ...fullWidthStyle,
    },
    text: {
      fontWeight: '600',
      color: textColor || (variant === 'liquid' ? '#000000' : variantStyles.textColor),
      fontSize: sizeStyles[size].fontSize,
    },
    // Simulate an inner white glow for whiteShadow using a semi-transparent overlay
    innerOverlay: {
      ...(StyleSheet as any).absoluteFillObject,
      borderRadius: theme.radius.full,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    gradientOverlay: {
      ...(StyleSheet as any).absoluteFillObject,
      borderRadius: theme.radius.full,
    },
  });
}

export default Button;
