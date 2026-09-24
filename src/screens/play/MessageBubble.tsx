import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import type { ChatMessage } from "../../services/chatService";
import type { SurfaceTokens } from "../../theme/surface";
import LockIcon from "../../components/icons/LockIcon";
import RubyIcon from "../../components/icons/RubyIcon";
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
    lock,
    onReport,
    reported,
}: {
    item: ChatMessage;
    isPro: boolean;
    characterName: string;
    surface: SurfaceTokens;
    /**
     * Tapping media she sent. The bubble does not decide what happens — the
     * screen runs the same unlock flow the gallery does, because a photo is a
     * photo whether it arrived in a sheet or in the conversation.
     */
    onLockedPress: () => void;
    /** What stands between the user and this photo right now. */
    lock?: "free" | "ad" | "pro" | "pro_or_ruby" | "ruby" | "level";
    /**
     * Long-pressing anything she said or sent. Required by Google Play's
     * AI-Generated Content policy: offensive output has to be reportable from
     * inside the app.
     */
    onReport?: (item: ChatMessage) => void;
    /** Already flagged by this user — the content is replaced by a notice. */
    reported?: boolean;
}) {
    const { t } = useTranslation();
    const isAI = item.role === "model";
    const isUser = item.role === "user";
    const hasText = item.text.trim().length > 0;
    // `lock` is the authority when the screen supplies it; the tier check is
    // the fallback for messages that predate it.
    const lockState = lock ?? (item.mediaTier === "pro" && !isPro ? "pro" : "free");
    const isLocked = lockState !== "free";
    // Only her side is reportable: reporting your own typing helps nobody.
    const canReport = isAI && !!onReport;
    const report = () => {
        if (!canReport) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onReport!(item);
    };

    // Once flagged, the message itself is gone — leaving it on screen while
    // telling the user we agree it was offensive is the worst of both.
    if (reported) {
        return (
            <View style={[localStyles.reportedRow, { alignSelf: isUser ? "flex-end" : "flex-start" }]}>
                <Ionicons name="flag" size={12} color="rgba(255,255,255,0.4)" />
                <Text style={localStyles.reportedText}>{t("report.hidden")}</Text>
            </View>
        );
    }

    return (
        // The row is what caps the width, against the list's full-width
        // parent — a percentage Yoga can actually resolve.
        <View style={[localStyles.row, { alignSelf: isUser ? "flex-end" : "flex-start" }]}>
            {item.mediaUrl && (
                <Pressable
                    onPress={onLockedPress}
                    onLongPress={report}
                    delayLongPress={350}
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
                            // Blur the picture itself, the way the gallery grid
                            // does. A BlurView laid on top barely registers on
                            // Android, so a locked photo was arriving fully
                            // legible with a padlock drawn over it — which is
                            // no lock at all.
                            blurRadius={isLocked ? 42 : 0}
                        />
                    )}

                    {isLocked && (
                        <View style={styles.lockedMediaOverlay}>
                            {/* A video frame cannot be blurred at the source,
                                so that one still needs something opaque. */}
                            <View
                                style={[
                                    StyleSheet.absoluteFill,
                                    {
                                        backgroundColor:
                                            item.mediaType === "video"
                                                ? "rgba(10,6,20,0.82)"
                                                : "rgba(10,6,20,0.35)",
                                    },
                                ]}
                            />
                            <View style={styles.lockBadge}>
                                {lockState === "ad" ? (
                                    <Ionicons name="play" size={22} color="#fff" />
                                ) : lockState === "level" ? (
                                    <Ionicons name="heart" size={22} color="#fff" />
                                ) : (
                                    <LockIcon size={24} color="#fff" />
                                )}
                            </View>
                            {/* Say the real price. "PRO ONLY" on a photo that
                                costs 150 ruby sends people to the wrong screen. */}
                            {lockState === "ruby" ? (
                                <View style={localStyles.lockPrice}>
                                    <RubyIcon size={13} color="#fff" />
                                    <Text style={styles.lockText}>{item.mediaPriceRuby}</Text>
                                </View>
                            ) : (
                                <Text style={styles.lockText}>
                                    {lockState === "ad"
                                        ? t("media.lock_ad")
                                        : lockState === "level"
                                            ? `Lv ${item.mediaUnlockLevel}`
                                            : "PRO"}
                                </Text>
                            )}
                        </View>
                    )}
                </Pressable>
            )}
            {hasText && (
                <Pressable onLongPress={report} delayLongPress={350} disabled={!canReport}>
                {isLiquidGlassSupported ? (
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
                )}
                </Pressable>
            )}
        </View>
    );
}

const localStyles = StyleSheet.create({
    // She answers in two to four bubbles at a time, so this gap is what
    // separates her sentences, not just one message from the next. At 12 they
    // ran together into one pink mass.
    row: { marginBottom: 16, maxWidth: "84%" },
    lockPrice: { flexDirection: "row", alignItems: "center", gap: 4 },
    reportedRow: {
        flexDirection: "row", alignItems: "center", gap: 6,
        marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    },
    reportedText: { color: "rgba(255,255,255,0.45)", fontSize: 12.5, fontWeight: "600" },
});
