import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated, ImageBackground, Platform } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface VoiceLoadingOverlayProps {
    visible: boolean;
    characterName?: string;
    characterAvatar?: string;
    backgroundImage?: string;
}

export const VoiceLoadingOverlay: React.FC<VoiceLoadingOverlayProps> = ({
    visible,
    characterName = 'Character',
    characterAvatar,
    backgroundImage,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: visible ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [visible]);

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.container,
                { opacity: fadeAnim },
                !visible && { pointerEvents: 'none' }
            ]}
        >
            {/* Background Image Layer */}
            {backgroundImage && (
                <Image
                    source={{ uri: backgroundImage }}
                    style={[StyleSheet.absoluteFill, styles.backgroundImage]}
                    contentFit="cover"
                    transition={200}
                />
            )}

            {/* Character Layer (on top of background, also blurred via next layer) */}
            <Image
                source={{ uri: characterAvatar }}
                style={[StyleSheet.absoluteFill, styles.backgroundImage]}
                contentFit="cover"
                transition={200}
            />
            <BlurView
                style={StyleSheet.absoluteFill}
                intensity={Platform.OS === 'ios' ? 40 : 20}
                tint="dark"
            />
            <View style={[StyleSheet.absoluteFill, styles.darkOverlay]} />

            <View style={styles.content}>
                <View style={styles.avatarContainer}>
                    <Image source={{ uri: characterAvatar }} style={styles.avatar} />
                </View>
                <Text style={styles.name}>{characterName}</Text>
                <Text style={styles.status}>Calling...</Text>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 200, // Cover chat messages (zIndex 100)
        alignItems: 'center',
        justifyContent: 'center',
    },
    backgroundImage: {
        width: '100%',
        height: '100%',
    },
    darkOverlay: {
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    content: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        marginBottom: 16,
        padding: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 60,
    },
    name: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 8,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    status: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 16,
        fontWeight: '500',
    },
});

