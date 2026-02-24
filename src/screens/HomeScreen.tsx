import React, { useRef, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Platform,
    ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
    IconLogout,
    IconPlayerPlay,
    IconHeart,
    IconMusic,
    IconPhoto,
    IconRefresh,
    Icon3dRotate,
    IconChevronLeft,
    IconChevronRight,
} from "@tabler/icons-react-native";
import { useAuth } from "../hooks/useAuth";
import { authService } from "../services/authService";
import VRMViewer, { VRMViewerHandle } from "../components/VRMViewer";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
    const { user } = useAuth();
    const vrmRef = useRef<VRMViewerHandle>(null);
    const [isVRMReady, setIsVRMReady] = useState(false);
    const [controlsEnabled, setControlsEnabled] = useState(false);

    const handleSignOut = async () => {
        try {
            await authService.signOut();
        } catch (error) {
            console.error("Sign out error:", error);
        }
    };

    const handleVRMReady = useCallback(() => {
        setIsVRMReady(true);
    }, []);

    const handleModelLoaded = useCallback(() => {
        console.log("VRM model loaded");
    }, []);

    const toggleControls = useCallback(() => {
        const newState = !controlsEnabled;
        setControlsEnabled(newState);
        vrmRef.current?.setControlsEnabled(newState);
    }, [controlsEnabled]);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* VRM Viewer */}
            <VRMViewer
                ref={vrmRef}
                initialModelName="001/001_vrm/001_01.vrm"
                onReady={handleVRMReady}
                onModelLoaded={handleModelLoaded}
                style={styles.vrmContainer}
            />

            {/* Loading overlay */}
            {!isVRMReady && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#6633CC" />
                    <Text style={styles.loadingText}>Loading model...</Text>
                </View>
            )}

            {/* Top bar */}
            <View style={styles.topBar}>
                <View>
                    <Text style={styles.greeting}>
                        {user?.user_metadata?.full_name ?? "TrueFeel"}
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.iconButton}
                    onPress={handleSignOut}
                    activeOpacity={0.7}
                >
                    <IconLogout size={22} color="#FF6B6B" />
                </TouchableOpacity>
            </View>

            {/* Right side action buttons */}
            <View style={styles.rightActions}>
                <TouchableOpacity
                    style={[styles.actionBtn, controlsEnabled && styles.actionBtnActive]}
                    onPress={toggleControls}
                    activeOpacity={0.7}
                >
                    <Icon3dRotate
                        size={22}
                        color={controlsEnabled ? "#6633CC" : "#FFFFFF"}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => vrmRef.current?.playRandomGreeting()}
                    activeOpacity={0.7}
                >
                    <IconPlayerPlay size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => vrmRef.current?.triggerLove()}
                    activeOpacity={0.7}
                >
                    <IconHeart size={22} color="#FF6B9D" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => vrmRef.current?.triggerDance()}
                    activeOpacity={0.7}
                >
                    <IconMusic size={22} color="#48BB78" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => vrmRef.current?.loadRandomFiles()}
                    activeOpacity={0.7}
                >
                    <IconRefresh size={22} color="#FFFFFF" />
                </TouchableOpacity>
            </View>

            {/* Bottom bar: background controls */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.bgButton}
                    onPress={() => vrmRef.current?.prevBackground()}
                    activeOpacity={0.7}
                >
                    <IconChevronLeft size={20} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.bgCenterButton}
                    onPress={() => vrmRef.current?.nextBackground()}
                    activeOpacity={0.7}
                >
                    <IconPhoto size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.bgCenterText}>Background</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.bgButton}
                    onPress={() => vrmRef.current?.nextBackground()}
                    activeOpacity={0.7}
                >
                    <IconChevronRight size={20} color="#FFFFFF" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0a0a1a",
    },
    vrmContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(10, 10, 26, 0.85)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        color: "rgba(255,255,255,0.5)",
    },
    topBar: {
        position: "absolute",
        top: Platform.OS === "ios" ? 60 : 40,
        left: 20,
        right: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 5,
    },
    greeting: {
        fontSize: 20,
        fontWeight: "700",
        color: "#FFFFFF",
        textShadowColor: "rgba(0,0,0,0.5)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    rightActions: {
        position: "absolute",
        right: 16,
        top: "40%",
        transform: [{ translateY: -90 }],
        gap: 12,
        zIndex: 5,
    },
    actionBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
    },
    actionBtnActive: {
        backgroundColor: "rgba(102, 51, 204, 0.3)",
        borderColor: "rgba(102, 51, 204, 0.5)",
    },
    bottomBar: {
        position: "absolute",
        bottom: Platform.OS === "ios" ? 40 : 24,
        left: 20,
        right: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        zIndex: 5,
    },
    bgButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.4)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    bgCenterButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.4)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    bgCenterText: {
        fontSize: 14,
        color: "#FFFFFF",
        fontWeight: "500",
    },
});
