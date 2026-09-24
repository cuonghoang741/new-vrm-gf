import React, { useState } from "react";
import { View, Text, StyleSheet, Platform, Image, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import {
    IconUser,
    IconHanger,
    IconMap2,
    IconPhoto,
    IconMusic,
    IconX,
    IconCube,
    IconPhoneCall,
    IconPhoneOff,
    IconVideo,
    IconChevronLeft,
    IconChevronRight,
    IconSettings,
    IconBadge3d,
    IconGift,
    IconCalendarCheck,
    IconMessage,
    IconMessageOff,
} from "@tabler/icons-react-native";
import Button from "./common/Button";
import { surfaceOn } from "../theme/surface";

// Shared accent palette (kept in sync with PlayScreen / girlfriend-3d-aiva)
const ACCENT = "#FF3D7F";                     // rose accent
const GOLD = "#F2C14E";                        // premium / PRO
const GLASS_FILL = "rgba(32, 16, 54, 0.72)";   // legible dark-violet glass
const TEXT_BRIGHT = "#F4ECFB";                 // lavender-white icons/text
const DANGER = "#FF5C7A";                      // stop / end-call

interface ActionsBubbleProps {
    conversationStatus: string;
    agentElevenlabsId: string | null;
    isPro: boolean;
    is3DMode: boolean;
    isDancing: boolean;
    isBackgroundDark?: boolean;
    isCameraMode: boolean;
    onOpenCharacter: () => void;
    onOpenCostume: () => void;
    onOpenScene: () => void;
    onOpenGallery: () => void;
    onToggleDance: () => void;
    onToggle3D: () => void;
    onToggleCall: () => void;
    onToggleCamera: () => void;
    onOpenSubscription: () => void;
    onOpenSettings: () => void;
    /** Show or hide the chat overlay, so the scene can be seen unobstructed. */
    onToggleChat: () => void;
    chatVisible: boolean;
    onOpenCheckin: () => void;
    /** Quest page (daily/special quests, free ruby, ruby shop). */
    onOpenQuests: () => void;
}

export default function ActionsBubble({
    conversationStatus,
    agentElevenlabsId,
    isPro,
    is3DMode,
    isBackgroundDark = true,
    isDancing,
    isCameraMode,
    onToggleChat,
    chatVisible,
    onOpenCharacter,
    onOpenCostume,
    onOpenScene,
    onOpenGallery,
    onToggleDance,
    onToggle3D,
    onToggleCall,
    onToggleCamera,
    onOpenSubscription,
    onOpenSettings,
    onOpenCheckin,
    onOpenQuests,
}: ActionsBubbleProps) {
    const { t } = useTranslation();
    const isInCall = ["connected", "connecting"].includes(conversationStatus);
    const [showLabels, setShowLabels] = useState(false);

    // Contrast against whatever scene is behind: dark glass + light icons over
    // a dark background, light glass + dark icons over a light one. Most of the
    // background library is light, so the old always-dark glass was fighting
    // the scene more often than not.
    const surface = surfaceOn(isBackgroundDark);
    const iconColor = surface.icon;

    return (
        <View style={styles.actionsBubble}>
            {/* ─── Normal mode: show all action buttons ─── */}
            {!isInCall && (
                <>
                    {/* No glass bubble on this one.
                        Every other button in the rail is a glyph that needs a
                        plate to sit on; this one is a picture of the people
                        you would be switching to, and a plate around it only
                        makes it smaller and greyer. It is the odd one out on
                        purpose — that is what makes it findable. */}
                    <Pressable
                        onPress={onOpenCharacter}
                        hitSlop={6}
                        style={({ pressed }) => [styles.charBtn, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
                    >
                        <Image
                            source={require("../../assets/icon-characters.png")}
                            style={styles.charIcon}
                            resizeMode="contain"
                        />
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: "rgba(20,10,30,0.9)", shadowColor: surface.accent }]} />
                        {showLabels && (
                            <Text style={[styles.charLabel, { color: iconColor }]}>{t("act.character")}</Text>
                        )}
                    </Pressable>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconGift}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenQuests}
                            isIconOnly={!showLabels}
                        >
                            {t("act.quests")}
                        </Button>
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: surface.glass, shadowColor: surface.accent }]} />
                    </View>
                    <Button
                        variant="liquid"
                        size="sm"
                        tintColor={surface.glass}
                        borderColor={surface.border}
                        startIcon={IconCalendarCheck}
                        startIconColor={iconColor}
                        textColor={iconColor}
                        onPress={onOpenCheckin}
                        isIconOnly={!showLabels}
                    >
                        {t("act.checkin")}
                    </Button>
                    <Button
                        variant="liquid"
                        size="sm"
                        tintColor={surface.glass}
                        borderColor={surface.border}
                        startIcon={IconSettings}
                        startIconColor={iconColor}
                        textColor={iconColor}
                        onPress={onOpenSettings}
                        isIconOnly={!showLabels}
                    >
                        {t("act.settings")}
                    </Button>

                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconHanger}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCostume}
                            isIconOnly={!showLabels}
                        >
                            {t("act.costume")}
                        </Button>
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: surface.glass, shadowColor: surface.accent }]} />
                    </View>
                    {/* <Button
                        variant="liquid"
                        size="sm"
                        tintColor={surface.glass}
                        borderColor={surface.border}
                        startIcon={is3DMode ? IconCube : IconBadge3d}
                        startIconColor={iconColor}
                        textColor={iconColor}
                        onPress={onToggle3D}
                        isIconOnly={!showLabels}
                    >
                        {is3DMode ? "3D" : "2D"}
                    </Button> */}
                    <Button
                        variant="liquid"
                        size="sm"
                        tintColor={surface.glass}
                        borderColor={surface.border}
                        startIcon={IconMap2}
                        startIconColor={iconColor}
                        textColor={iconColor}
                        onPress={onOpenScene}
                        isIconOnly={!showLabels}
                    >
                        {t("act.location")}
                    </Button>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconPhoto}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenGallery}
                            isIconOnly={!showLabels}
                        >
                            {t("act.gallery")}
                        </Button>
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: surface.glass, shadowColor: surface.accent }]} />
                    </View>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={isDancing ? IconX : IconMusic}
                            startIconColor={isDancing ? surface.danger : iconColor}
                            textColor={isDancing ? surface.danger : iconColor}
                            onPress={onToggleDance}
                            isIconOnly={!showLabels}
                        >
                            {isDancing ? t("act.stop") : t("act.dance")}
                        </Button>
                        {/* No badge: the button opens the dance picker, where
                            every dance shows its own lock (free, ad, PRO, ruby). */}
                    </View>

                </>
            )}

            {/* ─── Call mode: FaceTime toggle + red End Call ─── */}
            {isInCall && (
                <Button
                    variant="liquid"
                    size="sm"
                    tintColor={surface.glass}
                    borderColor={surface.border}
                    startIcon={IconVideo}
                    startIconColor={isCameraMode ? surface.danger : iconColor}
                    textColor={isCameraMode ? surface.danger : iconColor}
                    onPress={onToggleCamera}
                    isIconOnly={!showLabels}
                >
                    {isCameraMode ? t("act.cam_on") : "FaceTime"}
                </Button>
            )}

            {/* ─── Show / hide the chat, so the scene can be seen clean ─── */}
            {!isInCall && (
                <Button
                    variant="liquid"
                    size="sm"
                    tintColor={surface.glass}
                    borderColor={surface.border}
                    startIcon={chatVisible ? IconMessageOff : IconMessage}
                    startIconColor={iconColor}
                    textColor={iconColor}
                    onPress={onToggleChat}
                    isIconOnly={!showLabels}
                >
                    {chatVisible ? t("play.hide_chat") : t("play.show_chat")}
                </Button>
            )}
            {/* ─── Labels on/off ───
                Last in the rail, not first: it is the one control that is
                about the rail rather than about her, and it opens sideways,
                so a left chevron says where the labels will appear. */}
            <Button
                variant="liquid"
                size="sm"
                tintColor={surface.glass}
                borderColor={surface.border}
                isIconOnly
                startIcon={showLabels ? IconChevronRight : IconChevronLeft}
                startIconColor={iconColor}
                textColor={iconColor}
                onPress={() => setShowLabels(!showLabels)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    /** The character picker: a picture, not a glyph on a plate. */
    charBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 2 },
    charIcon: { width: 52, height: 52 },
    charLabel: { fontSize: 11, fontWeight: "700", marginTop: 2 },
    actionsBubble: {
        position: "absolute",
        right: 20,
        top: Platform.OS === "ios" ? 60 : 40,
        gap: 12,
        zIndex: 50,
        alignItems: "flex-end",
    },
    adBadgeMini: {
        position: 'absolute',
        top: -6,
        right: -6,
    },
    proBadgeMini: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: GOLD,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
    },
    proBadgeMiniText: {
        color: '#FFF',
        fontSize: 8,
        fontFamily: 'PixelifySans_700Bold',
    },
    notificationDot: {
        position: 'absolute',
        top: -1,
        right: -1,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: ACCENT,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.9)',
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
        elevation: 6,
        zIndex: 60,
    },
});
