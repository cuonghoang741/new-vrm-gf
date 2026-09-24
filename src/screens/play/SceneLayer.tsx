import React from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { CameraView } from "expo-camera";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";
import { IconBadge3d, IconCrown, IconFlame, IconPhone } from "@tabler/icons-react-native";
import { useTranslation } from "react-i18next";
import VRMViewer, { VRMViewerHandle } from "../../components/VRMViewer";
import { CharacterCard } from "../../components/CharacterCard";
import RubyIcon from "../../components/icons/RubyIcon";
import type { SurfaceTokens } from "../../theme/surface";
import { styles } from "./styles";
import { formatTrial } from "../../services/trial3d";
import { ACCENT, GOLD } from "./theme";

/**
 * Everything painted over the scene itself: the 2D/3D character layer, the
 * front-camera pip, the connecting-call overlay, the top bar with the quick
 * character switcher, and the left rail (2D/3D toggle + ruby balance).
 *
 * Purely presentational — every piece of state it reads and every action it
 * can fire is a prop. It was ~170 lines in the middle of PlayScreen's render,
 * between the sheets and the chat, which made the screen's structure hard to
 * see at all.
 */
export interface SceneLayerProps {
    is3DMode: boolean;
    setIs3DMode: (on: boolean) => void;
    /** Switch to 3D and make sure the model is actually in the scene. */
    onEnter3D: () => void;
    setVrmReady: (ready: boolean) => void;
    vrmRef: React.RefObject<VRMViewerHandle | null>;

    backgroundUrl: string | null;
    /** Sensitive-content gate is up: blur the 2D art as well as the 3D canvas. */
    blurScene?: boolean;
    characterAvatar: string | null;
    /**
     * Same art with the scenery cut out, for the 2D layer only — it is the one
     * place something is drawn behind her, so it is the only place that needs
     * a transparent PNG. Her card and the character sheet want the full
     * illustration. Null falls back to `characterAvatar`.
     */
    characterAvatarNoBg: string | null;
    characterThumbnail: string | null;
    characterName: string;
    onOpenBond: () => void;
    bondLevel?: number | null;
    /** 0..1 through the current bond level, for the card's bar. */
    bondProgress?: number | null;
    /** One of her quests is done and unclaimed — red dot on her card. */
    bondClaimable?: boolean;
    characterId: string | null;

    isPro: boolean;
    isCameraMode: boolean;
    isKeyboardVisible: boolean;
    isBackgroundDark: boolean;
    surface: SurfaceTokens;

    /** Drives the pulsing rings while a call connects. */
    pulseAnim: Animated.Value;
    voiceStatus: string;
    endCall: () => void;

    switcherChars: any[];
    onQuickSwitch: (char: any) => void;

    ruby: number;
    /** The ruby-count pill: the Quest page, where the shop lives. */
    onOpenQuests: () => void;
    /**
     * Top-left gem. For a free user this is the subscription pitch, not the
     * shop — selling ruby to someone who has not subscribed skips the offer
     * that is worth more to them and to us. PRO users already have it, so for
     * them it goes to the shop like the pill does.
     */
    onOpenGem: () => void;
    /** Check-in sheet, from the flame button. */
    onOpenCheckin: () => void;
    /** Consecutive check-in days; 0 hides the badge. */
    streak: number;
    /** Today's reward is still unclaimed — red dot. */
    needsCheckin: boolean;
    /**
     * Seconds left on the free 3D trial, or 0. While it runs, the 3D half of
     * the toggle works for a free user and wears the clock.
     */
    trialRemaining: number;
    setSubscriptionOpen: (open: boolean) => void;
}

export function SceneLayer({
    is3DMode,
    setIs3DMode,
    setVrmReady,
    onEnter3D,
    vrmRef,
    backgroundUrl,
    blurScene = false,
    characterAvatar,
    characterAvatarNoBg,
    characterThumbnail,
    characterName,
    onOpenBond,
    bondLevel,
    bondProgress,
    bondClaimable,
    characterId,
    isPro,
    isCameraMode,
    isKeyboardVisible,
    isBackgroundDark,
    surface,
    pulseAnim,
    voiceStatus,
    endCall,
    switcherChars,
    onQuickSwitch,
    ruby,
    onOpenQuests,
    onOpenGem,
    onOpenCheckin,
    streak,
    needsCheckin,
    trialRemaining,
    setSubscriptionOpen,
}: SceneLayerProps) {
    const { t } = useTranslation();

    return (
        <>
        {/* ─── Character Display Overlay ─── */}
        <View style={styles.charContainer}>
            {/* 2D Background & Static character — unmounted in 3D mode so the
                opaque 3D WebView doesn't composite over a full-screen RN layer. */}
            {!is3DMode && (
                <View style={styles.vrmFull}>
                    {backgroundUrl && (
                        <Image
                            source={{ uri: backgroundUrl }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            blurRadius={blurScene ? 30 : 0}
                        />
                    )}
                    {(characterAvatarNoBg ?? characterAvatar) && (
                        <Image
                            source={{ uri: (characterAvatarNoBg ?? characterAvatar)! }}
                            style={styles.staticCharacter}
                            // Costume art is a full illustration with its own
                            // scenery; "contain" left the scene background
                            // showing above it. Fill the screen, keep the face.
                            contentFit="cover"
                            contentPosition="top center"
                            blurRadius={blurScene ? 30 : 0}
                        />
                    )}
                </View>
            )}

            {/* 3D Mode Overlay - Always mounted to avoid slow reloads */}
            <View
                style={[
                    StyleSheet.absoluteFill,
                    {
                        opacity: is3DMode ? 1 : 0,
                        zIndex: is3DMode ? 2 : -1,
                        pointerEvents: is3DMode ? "auto" : "none"
                    }
                ]}
            >
                <VRMViewer
                    ref={vrmRef}
                    transparent={false}
                    onReady={() => setVrmReady(true)}
                />
            </View>
        </View>

        {/* User Front Camera floating pip for Video Call */}
        {isCameraMode && (
            <View style={styles.pipCameraContainer}>
                <CameraView style={styles.pipCamera} facing="front" />
            </View>
        )}

        {/* Visual Overlay when connecting (Setup Call Screen) */}
        {voiceStatus === "connecting" && (
            // Opaque colour, not blur alone: expo-blur cannot blur the GL/WebView
            // surface the scene renders into on Android, so a blur-only overlay
            // comes out transparent there.
            <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 999, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(10, 6, 20, 0.92)' }]}>
                {/* Avatar + pulsing rings container */}
                <View style={{ alignItems: 'center', justifyContent: 'center', width: 220, height: 220 }}>
                    {/* Pulsing rings – centered behind avatar */}
                    <Animated.View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255, 255, 255, 0.05)', transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.9, 1.4] }) }], opacity: pulseAnim }} />
                    <Animated.View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255, 255, 255, 0.1)', transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.2] }) }], opacity: pulseAnim }} />

                    {characterThumbnail && (
                        <Image source={{ uri: characterThumbnail }} style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' }} contentFit="cover" />
                    )}
                </View>

                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 30 }}>{characterName}</Text>
                <Animated.Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', opacity: pulseAnim, marginTop: 10 }}>{t("play.calling")}</Animated.Text>

                {/* End Call Button */}
                <Pressable
                    style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#FF5C7A', justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 100, elevation: 5, shadowColor: '#FF5C7A', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }}
                    onPress={endCall}
                >
                    <IconPhone size={32} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
                </Pressable>
            </BlurView>
        )}

        {/* Top bar */}
        <View style={styles.topBar}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {/* Diamond → Quest page. PRO lives inside it now (the PRO
                    card at the top), so PRO users get the same button with
                    a crown on it instead of a separate crown. */}
                <Pressable onPress={onOpenGem} hitSlop={8} style={styles.upgradeProInner}>
                    <RubyIcon size={20} color="#FFFFFF" />
                    {isPro && (
                        <View style={styles.crownOnGem}>
                            <IconCrown size={11} color={GOLD} fill={GOLD} />
                        </View>
                    )}
                </Pressable>
            </View>

            {/* Her card: face, name, and how close you are. Replaced the
                quick-switch carousel, which answered "who else is there" —
                not a question anyone opens this screen to ask — while hiding
                the number the whole progression loop runs on. */}
            {!isKeyboardVisible && (
                <View style={styles.switcherInBar} pointerEvents="box-none">
                    <CharacterCard
                        name={characterName}
                        // The same art the scene is drawing, not the catalogue
                        // thumbnail — otherwise her card shows one outfit while
                        // she stands there in another, and never updates when
                        // the costume changes.
                        avatar={characterAvatar ?? characterThumbnail}
                        level={bondLevel ?? null}
                        progress={bondProgress ?? null}
                        hasClaimable={!!bondClaimable}
                        surface={surface}
                        onPress={onOpenBond}
                    />
                </View>
            )}
        </View>

        <View style={styles.leftFloatingContainer}>
            <LiquidGlassView
                style={[
                    styles.liquidToggleWrapper,
                    { borderColor: surface.border },
                    Platform.OS === "android" && { backgroundColor: surface.glass },
                ]}
                effect="regular"
                interactive
                tintColor={surface.glass}
            >
                <View style={styles.toggleRow}>
                    <TouchableOpacity
                        onPress={() => {
                            if (is3DMode) {
                                setIs3DMode(false);
                            }
                        }}
                        style={[styles.toggleOption, !is3DMode && styles.toggleOptionActive]}
                    >
                        <Text style={[
                            styles.toggleLabel,
                            !is3DMode ? styles.toggleLabelActive : { color: surface.muted }
                        ]}>2D</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => {
                            if (!is3DMode) {
                                // The trial is the one window where 3D is not
                                // the paywall's job.
                                if (!isPro && trialRemaining <= 0) {
                                    setSubscriptionOpen(true);
                                } else {
                                    onEnter3D();
                                }
                            }
                        }}
                        style={[styles.toggleOption, is3DMode && styles.toggleOptionActive]}
                    >
                        <Text style={[
                            styles.toggleLabel,
                            is3DMode ? styles.toggleLabelActive : { color: surface.muted }
                        ]}>3D</Text>
                    </TouchableOpacity>
                </View>
            </LiquidGlassView>

            {/* The clock sits under the toggle rather than inside it: the pill
                is 110pt wide and already carries two labels. */}
            {trialRemaining > 0 && !isPro && (
                <View style={styles.trialPill}>
                    <IconBadge3d size={12} color="#FFFFFF" />
                    <Text style={styles.trialPillText}>{formatTrial(trialRemaining)}</Text>
                </View>
            )}
            {!isPro && (
                <View style={styles.proBadgeLeft}>
                    <Text style={styles.proBadgeLeftText}>PRO</Text>
                </View>
            )}
            {/* Ruby balance — right below the 2D/3D toggle. Tap to check in. */}
            <Pressable onPress={onOpenQuests} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                {/* Same glass as the action buttons on the right. It was a flat
                    Pressable with a solid fill, which on iOS sat visibly
                    outside the liquid-glass family everything else belongs to. */}
                {isLiquidGlassSupported ? (
                    <LiquidGlassView
                        style={[styles.rubyPill, { borderColor: surface.border, backgroundColor: "transparent" }]}
                        effect="regular"
                        interactive
                        tintColor={surface.glass}
                    >
                        <RubyIcon size={17} color={surface.accent} />
                        <Text style={[styles.rubyPillText, { color: surface.icon }]}>{ruby}</Text>
                    </LiquidGlassView>
                ) : (
                    <View style={[styles.rubyPill, { backgroundColor: surface.glass, borderColor: surface.border }]}>
                        <RubyIcon size={17} color={surface.accent} />
                        <Text style={[styles.rubyPillText, { color: surface.icon }]}>{ruby}</Text>
                    </View>
                )}
            </Pressable>

            {/* Check-in, at the foot of the left rail under the balance —
                the streak is what the balance grows from, and the top bar is
                left to the upgrade. */}
            <Pressable onPress={onOpenCheckin} hitSlop={8} style={styles.streakBtn}>
                <IconFlame size={20} color="#FF8C00" fill="#FF8C00" />
                {streak > 0 && (
                    <LinearGradient
                        colors={["#FFC400", "#FF8C00"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.streakBadge}
                    >
                        <Text style={styles.streakBadgeText}>{streak}</Text>
                    </LinearGradient>
                )}
                {needsCheckin && <View style={styles.streakDot} />}
            </Pressable>
        </View>
        </>
    );
}
