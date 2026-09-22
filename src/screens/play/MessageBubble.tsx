import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Video, ResizeMode } from "expo-av";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import type { ChatMessage } from "../../services/chatService";
import type { SurfaceTokens } from "../../theme/surface";
import LockIcon from "../../components/icons/LockIcon";
import { styles } from "./styles";

/**
 * One row of the chat list: optional media on top, the text bubble below.
 *
 * Was an inline `renderMessage` useCallback inside PlayScreen. Pulling it out
 * also fixed a stale-closure bug it had: the callback listed only
 * `[characterName, isPro]` as deps while reading `surface` too, so AI bubbles
 * kept the previous scene's glass colours after switching to a background of
 * the opposite brightness. As a component with `surface` as a prop, that
 * cannot drift.
 */
export function MessageBubble({
    item,
    isPro,
    characterName,
    surface,
    onLockedPress,
}: {
    item: ChatMessage;
    isPro: boolean;
    characterName: string;
    surface: SurfaceTokens;
    /** Tapping locked PRO media — opens the paywall. */
    onLockedPress: () => void;
}) {
    const isAI = item.role === "model";
    const isUser = item.role === "user";
    const hasText = item.text.trim().length > 0;
    const isLocked = item.mediaTier === "pro" && !isPro;

    return (
        <View style={{ marginBottom: 12, maxWidth: "85%", alignSelf: isUser ? "flex-end" : "flex-start" }}>
            {item.mediaUrl && (
                <Pressable
                    onPress={() => isLocked && onLockedPress()}
                    style={[styles.mediaContainer, { marginBottom: hasText ? 6 : 0 }]}
                >
                    {item.mediaType === "video" ? (
                        <Video
                            source={{ uri: item.mediaUrl }}
                            style={styles.messageMedia}
                            resizeMode={ResizeMode.COVER}
                            isMuted
                            shouldPlay={!isLocked}
                            isLooping
                        />
                    ) : (
                        <Image
                            source={{ uri: item.mediaUrl }}
                            style={styles.messageMedia}
                            contentFit="cover"
                        />
                    )}

                    {isLocked && (
                        <View style={styles.lockedMediaOverlay}>
                            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                            <View style={styles.lockBadge}>
                                <LockIcon size={24} color="#fff" />
                            </View>
                            <Text style={styles.lockText}>PRO ONLY</Text>
                        </View>
                    )}
                </Pressable>
            )}
            {hasText && (
                isLiquidGlassSupported ? (
                    <LiquidGlassView
                        style={[
                            styles.messageBubble,
                            isUser ? styles.userBubbleLiquid : styles.aiBubbleLiquid,
                            { marginBottom: 0 }
                        ]}
                        effect="regular"
                        tintColor={isUser ? 'rgba(255, 107, 157, 0.55)' : surface.bubble}
                    >
                        {isAI && <Text style={[styles.aiName, { color: surface.bubbleName }]}>{characterName}</Text>}
                        <Text style={[styles.messageText, isUser ? styles.userText : { color: surface.bubbleText }]}>{item.text}</Text>
                    </LiquidGlassView>
                ) : (
                    <View
                        style={[
                            styles.messageBubble,
                            isUser ? styles.userBubble : styles.aiBubble,
                            // Rose glass in both palettes — her side of the
                            // conversation should read as hers, not as another
                            // control surface.
                            !isUser && {
                                backgroundColor: surface.bubble,
                                borderColor: surface.bubbleBorder,
                                shadowColor: surface.accent,
                            },
                            { marginBottom: 0 },
                        ]}
                    >
                        {isAI && <Text style={[styles.aiName, { color: surface.bubbleName }]}>{characterName}</Text>}
                        <Text style={[styles.messageText, isUser ? styles.userText : { color: surface.bubbleText }]}>{item.text}</Text>
                    </View>
                )
            )}
        </View>
    );
}
