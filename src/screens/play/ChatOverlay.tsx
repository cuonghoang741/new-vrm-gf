import React from "react";
import { Animated, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import { IconPhoneCall, IconPhoneOff, IconSend } from "@tabler/icons-react-native";
import Button from "../../components/common/Button";
import type { ChatMessage } from "../../services/chatService";
import type { SurfaceTokens } from "../../theme/surface";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { styles, PLAY_BANNER_H } from "./styles";

import { ACCENT } from "./theme";
/**
 * The chat half of PlayScreen: message list, composer, and the anchored
 * banner pinned beneath it.
 *
 * The banner stays inside this component on purpose — it belongs to the
 * composer's layout, and the rule that it hides with the keyboard up is a
 * property of this region, not of the screen.
 */
export interface ChatOverlayProps {
    displayMessages: ChatMessage[];
    renderMessage: (info: { item: ChatMessage }) => React.ReactElement;
    flatListRef: React.RefObject<FlatList<ChatMessage> | null>;

    inputText: string;
    setInputText: (text: string) => void;
    handleSend: () => void;
    characterName: string;

    keyboardPadding: number;
    isBackgroundDark: boolean;
    surface: SurfaceTokens;
    /** False for PRO or while the keyboard is up — see PlayScreen. */
    showPlayBanner: boolean;

    /** Null when she has no voice — the call button then never renders. */
    agentElevenlabsId: string | null;
    isInCall: boolean;
    onToggleCall: () => void;

    /** Disables the composer and drives the three-dot typing indicator. */
    isSending: boolean;
    dot1Anim: Animated.Value;
    dot2Anim: Animated.Value;
    dot3Anim: Animated.Value;
}

export function ChatOverlay({
    displayMessages,
    renderMessage,
    flatListRef,
    inputText,
    setInputText,
    handleSend,
    characterName,
    keyboardPadding,
    isBackgroundDark,
    surface,
    showPlayBanner,
    agentElevenlabsId,
    isInCall,
    onToggleCall,
    isSending,
    dot1Anim,
    dot2Anim,
    dot3Anim,
}: ChatOverlayProps) {
    const { t } = useTranslation();
    /** Something to send, and nothing in flight. */
    const canSend = !!inputText.trim() && !isSending;
    return (
        <View
            style={styles.chatOverlay}
            pointerEvents="box-none"
        >
            {/* The banner is PlayScreen's now, pinned to the bottom of the
                screen, so hiding the chat no longer takes the ad with it.
                What is left here is the space it occupies. */}
            <View
                style={[
                    styles.chatContainer,
                    { paddingBottom: keyboardPadding + (showPlayBanner ? PLAY_BANNER_H : 0) },
                ]}
                pointerEvents="box-none"
            >
                {/* A scrim under the whole chat block. The scene behind is
                    artwork we do not control — snow, neon, a white room — and
                    tinting the bubbles alone was not enough to keep small text
                    readable on the bright ones. */}
                <LinearGradient
                    colors={["transparent", "rgba(10,6,20,0.35)", "rgba(10,6,20,0.72)"]}
                    locations={[0, 0.45, 1]}
                    style={styles.chatScrim}
                    pointerEvents="none"
                />

                {/* The list is capped at 30% of the screen, so an older bubble is
                    usually cut mid-way at its top edge — which read as a stray
                    white bar. The mask fades that edge out instead. */}
                <MaskedView
                    style={styles.chatMessagesWrapper}
                    pointerEvents="box-none"
                    maskElement={
                        <LinearGradient
                            style={{ flex: 1 }}
                            colors={["transparent", "#000"]}
                            locations={[0, 0.18]}
                        />
                    }
                >
                    <FlatList
                        ref={flatListRef}
                        data={displayMessages}
                        renderItem={renderMessage}
                        keyExtractor={(item) => item.id}
                        style={styles.messageList}
                        contentContainerStyle={styles.messageListContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                        ListFooterComponent={
                            isSending ? (
                                isLiquidGlassSupported ? (
                                    <LiquidGlassView
                                        style={[styles.messageBubble, styles.aiBubbleLiquid]}
                                        effect="regular"
                                        tintColor="rgba(15, 5, 30, 0.4)"
                                    >
                                        <Text style={styles.aiName}>{characterName}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingTop: 4 }}>
                                            {[dot1Anim, dot2Anim, dot3Anim].map((anim, i) => (
                                                <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,107,157,0.95)', marginHorizontal: 2, transform: [{ translateY: anim }] }} />
                                            ))}
                                        </View>
                                    </LiquidGlassView>
                                ) : (
                                    <View style={[styles.messageBubble, styles.aiBubble]}>
                                        <Text style={styles.aiName}>{characterName}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingTop: 4 }}>
                                            {[dot1Anim, dot2Anim, dot3Anim].map((anim, i) => (
                                                <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,107,157,0.95)', marginHorizontal: 2, transform: [{ translateY: anim }] }} />
                                            ))}
                                        </View>
                                    </View>
                                )
                            ) : null
                        }
                    />
                </MaskedView>

                <View
                    style={[
                        styles.inputBar,
                        // The banner now carries the home-indicator inset, so
                        // the composer must not also reserve it or the two
                        // end up separated by dead space.
                        showPlayBanner && { paddingBottom: 10 },
                    ]}
                >
                    {/* Call sits at the head of the composer: talking to her
                        and typing to her are the same act, so the two live in
                        one row instead of the call hiding in the icon rail. */}
                    {!!agentElevenlabsId && (
                        <Pressable
                            onPress={onToggleCall}
                            hitSlop={6}
                            style={({ pressed }) => [styles.callBtnGhost, pressed && { opacity: 0.55 }]}
                        >
                            {isInCall
                                ? <IconPhoneOff size={24} color="#FFFFFF" />
                                : <IconPhoneCall size={24} color="#FFFFFF" />}
                        </Pressable>
                    )}

                    {isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[
                                styles.liquidInputWrapper,
                                { borderColor: surface.bubbleBorder, borderWidth: 1 },
                            ]}
                            effect="regular"
                            interactive
                            // Same rose as her bubble: the composer sat in a
                            // neutral grey veil and read as belonging to a
                            // different app than the conversation above it.
                            tintColor={surface.bubble}
                        >
                            <TextInput
                                style={[styles.textInputLiquid, { color: surface.bubbleText }]}
                                placeholder={t("play.message_ph", { name: characterName })}
                                placeholderTextColor={surface.bubbleName}
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                maxLength={500}
                                returnKeyType="default"
                                blurOnSubmit={false}
                            />
                        </LiquidGlassView>
                    ) : (
                        <View
                            style={[
                                styles.inputBlurWrapper,
                                { backgroundColor: surface.bubble, borderColor: surface.bubbleBorder },
                            ]}
                        >
                            <TextInput
                                // Was hardcoded white, which vanished against
                                // the pale bubble on light backgrounds.
                                style={[styles.textInputLiquid, { color: surface.bubbleText }]}
                                placeholder={t("play.message_ph", { name: characterName })}
                                placeholderTextColor={surface.bubbleName}
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                maxLength={500}
                                returnKeyType="default"
                                blurOnSubmit={false}
                            />
                        </View>
                    )}
                    {/* The two states have to look different. Both used to be
                        a translucent rose over a rose composer, separated only
                        by the 0.65 opacity the Button applies when disabled —
                        so a ready-to-send button looked exactly as dead as an
                        empty one. Solid accent when there is something to
                        send, muted glass when there is not. */}
                    <Button
                        variant="liquid"
                        isIconOnly
                        startIcon={IconSend}
                        startIconSize={20}
                        startIconColor={canSend ? "#FFFFFF" : surface.muted}
                        tintColor={canSend ? ACCENT : surface.glass}
                        onPress={handleSend}
                        disabled={!canSend}
                        style={styles.sendBtnLiquid}
                    />
                </View>

            </View>
        </View>
    );
}
