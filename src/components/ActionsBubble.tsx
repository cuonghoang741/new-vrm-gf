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
} from "@tabler/icons-react-native";
import Button from "./common/Button";

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
}: ActionsBubbleProps) {
    const isInCall = ["connected", "connecting"].includes(conversationStatus);
    const [showLabels, setShowLabels] = useState(false);

    const iconColor = isBackgroundDark ? '#FFFFFF' : '#0F051E';

    return (
        <View style={styles.actionsBubble}>
            {/* ─── Toggle Labels Button ─── */}
            <Button
                variant="liquid"
                size="sm"
                isIconOnly
                startIcon={showLabels ? IconChevronUp : IconChevronDown}
                startIconColor={iconColor}
                textColor={iconColor}
                onPress={() => setShowLabels(!showLabels)}
            />

            {/* ─── Normal mode: show all action buttons ─── */}
            {!isInCall && (
                <>
                    <Button
                        variant="liquid"
                        size="sm"
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
                            startIcon={IconUser}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCharacter}
                            isIconOnly={!showLabels}
                        >
                            Character
                        </Button>
                        <View style={styles.notificationDot} />
                    </View>

                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconWoman}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenCostume}
                            isIconOnly={!showLabels}
                        >
                            Costume
                        </Button>
                        <View style={styles.notificationDot} />
                    </View>
                    {/* <Button
                        variant="liquid"
                        size="sm"
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
                            startIcon={IconPhoto}
                            startIconColor={iconColor}
                            textColor={iconColor}
                            onPress={onOpenGallery}
                            isIconOnly={!showLabels}
                        >
                            Gallery
                        </Button>
                        <View style={styles.notificationDot} />
                    </View>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={isDancing ? IconX : IconMusic}
                            startIconColor={isDancing ? "#EF4444" : iconColor}
                            textColor={isDancing ? "#EF4444" : iconColor}
                            onPress={onToggleDance}
                            isIconOnly={!showLabels}
                        >
                            {isDancing ? "Stop" : "Dance"}
                        </Button>
                        {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                    </View>

                </>
            )}

            {/* ─── Call mode: FaceTime toggle + red End Call ─── */}
            {isInCall && (
                <Button
                    variant="liquid"
                    size="sm"
                    startIcon={IconVideo}
                    startIconColor={isCameraMode ? "#EF4444" : iconColor}
                    textColor={isCameraMode ? "#EF4444" : iconColor}
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
                        startIcon={isInCall ? IconPhoneOff : IconPhoneCall}
                        startIconColor={isInCall ? "#EF4444" : iconColor}
                        textColor={isInCall ? "#EF4444" : iconColor}
                        onPress={onToggleCall}
                        isIconOnly={!showLabels}
                    >
                        {isInCall ? "End Call" : "Call"}
                    </Button>
                    {/* {!isPro && !isInCall && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>} */}
                </View>
            )}

            {/* ─── PRO badge (hidden during call) ─── */}
            {!isPro && !isInCall && (
                <Button
                    variant="liquid"
                    size="sm"
                    startIcon={IconCrown}
                    startIconColor="#FBBF24"
                    textColor="#FBBF24"
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
        backgroundColor: '#F59E0B',
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
        backgroundColor: '#EF4444',
        zIndex: 60,
    },
});
