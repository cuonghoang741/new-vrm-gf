import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
    IconUser,
    IconHanger,
    IconPhoto,
    IconPhotoFilled,
    IconMusic,
    IconX,
    IconCube,
    IconPhoneCall,
    IconCrown,
} from "@tabler/icons-react-native";
import Button from "./common/Button";

interface ActionsBubbleProps {
    conversationStatus: string;
    agentElevenlabsId: string | null;
    isPro: boolean;
    is3DMode: boolean;
    isDancing: boolean;
    onOpenCharacter: () => void;
    onOpenCostume: () => void;
    onOpenScene: () => void;
    onOpenGallery: () => void;
    onToggleDance: () => void;
    onToggle3D: () => void;
    onToggleCall: () => void;
    onOpenSubscription: () => void;
}

export default function ActionsBubble({
    conversationStatus,
    agentElevenlabsId,
    isPro,
    is3DMode,
    isDancing,
    onOpenCharacter,
    onOpenCostume,
    onOpenScene,
    onOpenGallery,
    onToggleDance,
    onToggle3D,
    onToggleCall,
    onOpenSubscription,
}: ActionsBubbleProps) {
    return (
        <View style={styles.actionsBubble}>
            {!["connected", "connecting"].includes(conversationStatus) && (
                <>
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconUser}
                        onPress={onOpenCharacter}
                    >
                        Character
                    </Button>
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconHanger}
                        onPress={onOpenCostume}
                    >
                        Costume
                    </Button>
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconPhoto}
                        onPress={onOpenScene}
                    >
                        Scene
                    </Button>
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconPhotoFilled}
                        onPress={onOpenGallery}
                    >
                        Gallery
                    </Button>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={isDancing ? IconX : IconMusic}
                            startIconColor={isDancing ? "#EF4444" : undefined}
                            onPress={onToggleDance}
                        >
                            {isDancing ? "Stop" : "Dance"}
                        </Button>
                        {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                    </View>
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconCube}
                            startIconColor={is3DMode && isPro ? '#8B5CF6' : undefined}
                            onPress={onToggle3D}
                        >
                            3D
                        </Button>
                        {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                    </View>
                </>
            )}

            {agentElevenlabsId && (
                <View>
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconPhoneCall}
                        startIconColor={conversationStatus === "connected" ? '#8B5CF6' : undefined}
                        onPress={onToggleCall}
                    >
                        {["connected", "connecting"].includes(conversationStatus) ? "End Call" : "Call"}
                    </Button>
                    {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                </View>
            )}
            {!isPro && (
                <Button
                    variant="liquid"
                    size="sm"
                    startIcon={IconCrown}
                    startIconColor="#F59E0B"
                    onPress={onOpenSubscription}
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
        right: 16,
        top: 120, // Move lower to avoid settings button
        gap: 12,
        zIndex: 50,
        alignItems: "flex-end", // Align items to the right side
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
});
