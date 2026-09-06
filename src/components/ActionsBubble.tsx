import React, { useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import {
    IconUser,
    IconWoman,
    IconMap2,
    IconPhoto,
    IconMusic,
    IconX,
    IconCube,
    IconPhoneCall,
    IconPhoneOff,
    IconVideo,
    IconCrown,
    IconChevronDown,
    IconChevronUp,
    IconSettings,
    IconBadge3d,
    IconGift,
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
    onOpenCheckin: () => void;
}

export default function ActionsBubble({
    conversationStatus,
    agentElevenlabsId,
    isPro,
    is3DMode,
    isBackgroundDark = true,
    isDancing,
    isCameraMode,
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
}: ActionsBubbleProps) {
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
            {/* ─── Toggle Labels Button ─── */}
            <Button
                variant="liquid"
                size="sm"
                tintColor={surface.glass}
                borderColor={surface.border}
                isIconOnly
                startIcon={showLabels ? IconChevronUp : IconChevronDown}
                startIconColor={iconColor}
                textColor={iconColor}
                onPress={() => setShowLabels(!showLabels)}
            />

            {/* ─── Normal mode: show all action buttons ─── */}
            {!isInCall && (
                <>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconGift}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCheckin}
                            isIconOnly={!showLabels}
                        >
                            Daily
                        </Button>
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: surface.glass, shadowColor: surface.accent }]} />
                    </View>
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
                        Settings
                    </Button>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconUser}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCharacter}
                            isIconOnly={!showLabels}
                        >
                            Character
                        </Button>
                        <View style={[styles.notificationDot, { backgroundColor: surface.accent, borderColor: surface.glass, shadowColor: surface.accent }]} />
                    </View>

                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            tintColor={surface.glass}
                            borderColor={surface.border}
                            startIcon={IconWoman}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCostume}
                            isIconOnly={!showLabels}
                        >
                            Costume
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
                        Location
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
                            Gallery
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
                            {isDancing ? "Stop" : "Dance"}
                        </Button>
                        {!isPro && <View style={[styles.proBadgeMini, { backgroundColor: surface.gold }]}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
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
                    {isCameraMode ? "Cam On" : "FaceTime"}
                </Button>
            )}

            {/* ─── Call / End Call button (always visible if agent exists) ─── */}
            {agentElevenlabsId && (
                <View>
                    <Button
                        variant={isInCall ? "solid" : "liquid"}
                        colorScheme={isInCall ? "error" : undefined}
                        size="sm"
                        tintColor={surface.glass}
                        borderColor={surface.border}
                        startIcon={isInCall ? IconPhoneOff : IconPhoneCall}
                        startIconColor={isInCall ? surface.danger : iconColor}
                        textColor={isInCall ? surface.danger : iconColor}
                        onPress={onToggleCall}
                        isIconOnly={!showLabels}
                    >
                        {isInCall ? "End Call" : "Call"}
                    </Button>
                    {/* {!isPro && !isInCall && <View style={[styles.proBadgeMini, { backgroundColor: surface.gold }]}><Text style={styles.proBadgeMiniText}>PRO</Text></View>} */}
                </View>
            )}

            {/* ─── PRO badge (hidden during call) ─── */}
            {!isPro && !isInCall && (
                <Button
                    variant="liquid"
                    size="sm"
                    tintColor={surface.glass}
                    borderColor={surface.border}
                    startIcon={IconCrown}
                    startIconColor={surface.gold}
                    textColor={surface.gold}
                    onPress={onOpenSubscription}
                    isIconOnly={!showLabels}
                >
                    PRO
                </Button>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    actionsBubble: {
        position: "absolute",
        right: 20,
        top: Platform.OS === "ios" ? 60 : 40,
        gap: 12,
        zIndex: 50,
        alignItems: "flex-end",
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
