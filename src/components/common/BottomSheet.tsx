import React, { useRef, useCallback, useImperativeHandle, forwardRef, useEffect, ReactNode, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, StyleProp, Platform, Modal, PanResponder, Animated, Dimensions } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/common/Button';

export type BottomSheetRef = {
    present: (index?: number) => void;
    dismiss: () => void;
};

type BottomSheetProps = {
    // Control
    isOpened?: boolean;
    onIsOpenedChange?: (opened: boolean) => void;
    onDismiss?: () => void;

    // Appearance
    title?: string;
    isDarkBackground?: boolean;
    detents?: (number | 'auto')[];
    cornerRadius?: number;
    grabber?: boolean;

    // Header customization
    headerLeft?: ReactNode;
    headerRight?: ReactNode;
    showCloseButton?: boolean;

    // Content
    children: ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    backgroundBlur?: 'dark' | 'light' | 'system-thick-material-dark'
    backgroundColor?: string
};

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(({
    isOpened,
    onIsOpenedChange,
    onDismiss,
    title,
    isDarkBackground = true,
    detents = [0.6, 0.9],
    cornerRadius = 24,
    grabber = true,
    headerLeft,
    headerRight,
    showCloseButton = true,
    children,
    contentContainerStyle,
    backgroundBlur,
    backgroundColor
}, ref) => {
    const sheetRef = useRef<TrueSheet>(null);

    const [androidVisible, setAndroidVisible] = React.useState(false);

    // Android resizable sheet state
    const screenHeight = Dimensions.get('window').height;
    const minSheetHeight = screenHeight * 0.3; // 30% min
    const maxSheetHeight = screenHeight * 0.95; // 95% max
    const initialSheetHeight = screenHeight * (typeof detents[0] === 'number' ? detents[0] : 0.6);

    const sheetHeight = useRef(new Animated.Value(initialSheetHeight)).current;
    const lastSheetHeight = useRef(initialSheetHeight);
    const wasVisible = useRef(false);

    // Reset height ONLY when sheet transitions from hidden to visible
    useEffect(() => {
        if (androidVisible && !wasVisible.current) {
            const targetHeight = screenHeight * (typeof detents[0] === 'number' ? detents[0] : 0.6);
            sheetHeight.setValue(targetHeight);
            lastSheetHeight.current = targetHeight;
        }
        wasVisible.current = androidVisible;
    }, [androidVisible, screenHeight, detents, sheetHeight]);

    // handleClose - moved up to be available in panResponder
    const handleClose = useCallback(() => {
        if (Platform.OS === 'android') {
            setAndroidVisible(false);
            onIsOpenedChange?.(false);
            onDismiss?.();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [onIsOpenedChange, onDismiss]);

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
            // Store the current height when drag starts
            lastSheetHeight.current = (sheetHeight as any)._value || initialSheetHeight;
        },
        onPanResponderMove: (_, gestureState) => {
            // Dragging up = negative dy = increase height
            // Dragging down = positive dy = decrease height
            const newHeight = lastSheetHeight.current - gestureState.dy;
            const clampedHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, newHeight));
            sheetHeight.setValue(clampedHeight);
        },
        onPanResponderRelease: (_, gestureState) => {
            const currentHeight = lastSheetHeight.current - gestureState.dy;

            // If dragged down significantly or with velocity, dismiss
            if (gestureState.dy > 100 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                handleClose();
                return;
            }

            // Snap to nearest detent
            const detentHeights = detents.map(d =>
                typeof d === 'number' ? screenHeight * d : screenHeight * 0.4 // 'auto'
            );

            // Find closest detent
            let closestDetent = detentHeights[0];
            let minDiff = Math.abs(currentHeight - closestDetent);
            for (const detentHeight of detentHeights) {
                const diff = Math.abs(currentHeight - detentHeight);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestDetent = detentHeight;
                }
            }

            // Animate to closest detent
            Animated.spring(sheetHeight, {
                toValue: Math.max(minSheetHeight, Math.min(maxSheetHeight, closestDetent)),
                useNativeDriver: false,
                friction: 8,
                tension: 65,
            }).start();

            lastSheetHeight.current = closestDetent;
        },
    }), [detents, screenHeight, minSheetHeight, maxSheetHeight, sheetHeight, initialSheetHeight, handleClose]);

    // Dynamic colors based on background
    const textColor = isDarkBackground ? '#fff' : '#000';
    const closeButtonBg = isDarkBackground ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';

    // Expose present/dismiss via ref
    useImperativeHandle(ref, () => ({
        present: (index?: number) => {
            if (Platform.OS === 'android') {
                setAndroidVisible(true);
            } else {
                sheetRef.current?.present(index ?? 0);
            }
            onIsOpenedChange?.(true);
        },
        dismiss: () => {
            if (Platform.OS === 'android') {
                setAndroidVisible(false);
                onIsOpenedChange?.(false);
                onDismiss?.();
            } else {
                sheetRef.current?.dismiss();
                onIsOpenedChange?.(false);
                onDismiss?.();
            }
        },
    }));

    // Sync with external isOpened prop
    useEffect(() => {
        if (isOpened) {
            if (Platform.OS === 'android') {
                setAndroidVisible(true);
            } else {
                sheetRef.current?.present(0);
            }
        } else if (isOpened === false) {
            if (Platform.OS === 'android') {
                setAndroidVisible(false);
            } else {
                sheetRef.current?.dismiss();
            }
        }
    }, [isOpened]);

    const handleDismiss = useCallback(() => {
        onIsOpenedChange?.(false);
        onDismiss?.();
    }, [onIsOpenedChange, onDismiss]);

    const renderHeader = () => {
        // If no title and no custom header components and no close button, skip header
        if (!title && !headerLeft && !headerRight && !showCloseButton) {
            return null;
        }

        return (
            <View style={styles.header}>
                {/* Left side */}
                <View style={styles.headerLeft}>
                    {headerLeft}
                </View>

                {/* Title (centered) */}
                <View style={styles.headerCenter}>
                    {title && (
                        <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
                            {title}
                        </Text>
                    )}
                </View>

                {/* Right side */}
                <View style={styles.headerRight}>
                    {headerRight ?? (
                        showCloseButton && (
                            <Button
                                style={[styles.closeButton, { backgroundColor: closeButtonBg }]}
                                onPress={handleClose}
                                startIcon={() => <Ionicons name="close" size={20} color={textColor} />}
                                isIconOnly
                            />
                        )
                    )}
                </View>
            </View>
        );
    };

    if (Platform.OS === 'android') {
        const bgColor = isDarkBackground ? '#1e1e1e' : '#ffffff';
        const grabberColor = isDarkBackground ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
        return (
            <Modal
                visible={androidVisible}
                transparent
                animationType="fade"
                onRequestClose={handleClose}
                statusBarTranslucent
            >
                <View style={styles.androidBackdrop}>
                    <Pressable style={styles.androidBackdropPressable} onPress={handleClose} />
                    <Animated.View
                        style={[
                            styles.androidSheetContainer,
                            {
                                backgroundColor: bgColor,
                                borderTopLeftRadius: cornerRadius,
                                borderTopRightRadius: cornerRadius,
                                height: sheetHeight,
                            }
                        ]}
                    >
                        {/* Grabber for resize */}
                        {grabber && (
                            <View {...panResponder.panHandlers} style={styles.androidGrabberContainer}>
                                <View style={[styles.androidGrabber, { backgroundColor: grabberColor }]} />
                            </View>
                        )}
                        <View style={[styles.container, { flex: 1 }, contentContainerStyle]}>
                            {renderHeader()}
                            <View style={{ flex: 1 }}>
                                {children}
                            </View>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        );
    }

    // Calculate content height for iOS TrueSheet (flex:1 doesn't work inside TrueSheet)
    const largestDetent = Math.max(...detents.map(d => typeof d === 'number' ? d : 0.6));
    const sheetContentHeight = screenHeight * largestDetent - 100; // subtract header + grabber + safe area

    return (
        <TrueSheet
            ref={sheetRef}
            detents={detents}
            cornerRadius={cornerRadius}
            grabber={grabber}
            backgroundColor={backgroundColor ?? 'transparent'}
            backgroundBlur={backgroundBlur ? backgroundBlur : isDarkBackground ? 'dark' : 'light'}
            onDidDismiss={handleDismiss}
            blurOptions={{
                intensity: backgroundBlur ? 100 : isDarkBackground ? 90 : 40,
                interaction: false,
            }}
        >
            <View style={[styles.container, { minHeight: sheetContentHeight }, contentContainerStyle]}>
                {renderHeader()}
                <View style={{ flex: 1, minHeight: sheetContentHeight - 60 }}>
                    {children}
                </View>
            </View>
        </TrueSheet>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        minHeight: 56,
    },
    headerLeft: {
        flex: 1,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerRight: {
        flex: 1,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    androidBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    androidBackdropPressable: {
        flex: 1,
    },
    androidSheetContainer: {
        width: '100%',
        overflow: 'hidden',
    },
    androidGrabberContainer: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: 12,
    },
    androidGrabber: {
        width: 36,
        height: 5,
        borderRadius: 3,
    },
});
