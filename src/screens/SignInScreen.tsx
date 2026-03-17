import React, { useState, useCallback, useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Dimensions,
    Platform,
    Alert,
    FlatList,
    Image,
    ImageBackground,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
    IconChevronLeft,
    IconChevronRight,
} from "@tabler/icons-react-native";
import AppleLogo from "../components/icons/AppleLogo";
import GoogleLogo from "../components/icons/GoogleLogo";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { authService } from "../services/authService";
import { fetchAndCacheCharacters } from "../cache/charactersCache";

WebBrowser.maybeCompleteAuthSession();

const { width, height } = Dimensions.get("window");
const THUMBNAIL_SIZE = 56;
const APP_SCHEME = "truefeel";

interface CharacterPreview {
    id: string;
    name: string;
    description: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    base_model_url: string | null;
    bg_image: string | null;
}

function extractParamsFromUrl(url: string) {
    const parsedUrl = new URL(url);
    const hash = parsedUrl.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
        access_token: params.get("access_token"),
        refresh_token: params.get("refresh_token"),
    };
}

export default function SignInScreen() {
    const [isAppleLoading, setIsAppleLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [characters, setCharacters] = useState<CharacterPreview[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const videoRef = useRef<Video>(null);

    // Fetch public characters and cache for onboarding reuse
    useEffect(() => {
        const loadCharacters = async () => {
            try {
                const chars = await fetchAndCacheCharacters();
                if (chars.length > 0) {
                    const mapped: CharacterPreview[] = chars.map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        description: c.description,
                        video_url: c.video_url,
                        thumbnail_url: c.thumbnail_url,
                        base_model_url: c.base_model_url,
                        bg_image: c.thumbnail_url ?? null,
                    }));
                    setCharacters(mapped);
                }
            } catch (e) {
                console.error("Failed to fetch characters:", e);
            }
        };

        loadCharacters();
    }, []);

    useEffect(() => {
        WebBrowser.warmUpAsync();
        return () => {
            WebBrowser.coolDownAsync();
        };
    }, []);

    const handleAppleSignIn = useCallback(async () => {
        if (Platform.OS !== "ios") {
            Alert.alert("Not Available", "Apple Sign-In is only available on iOS.");
            return;
        }
        setIsAppleLoading(true);
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });
            if (credential.identityToken && credential.authorizationCode) {
                await authService.signInWithAppleIdToken(
                    credential.identityToken,
                    credential.authorizationCode,
                    credential.authorizationCode
                );
            }
        } catch (error: any) {
            if (error.code !== "ERR_REQUEST_CANCELED") {
                console.error("Apple Sign-In error:", error);
                Alert.alert("Error", "Failed to sign in with Apple. Please try again.");
            }
        } finally {
            setIsAppleLoading(false);
        }
    }, []);

    const handleGoogleSignIn = useCallback(async () => {
        setIsGoogleLoading(true);
        try {
            const redirectTo = `${APP_SCHEME}://auth/callback`;
            const oauthData = await authService.signInWithGoogleOAuth(redirectTo);
            if (!oauthData.url) return;
            const result = await WebBrowser.openAuthSessionAsync(
                oauthData.url,
                `${APP_SCHEME}://auth/callback`,
                { showInRecents: true }
            );
            if (result.type === "success") {
                const params = extractParamsFromUrl(result.url);
                if (params.access_token && params.refresh_token) {
                    await authService.setSessionFromParams(
                        params.access_token,
                        params.refresh_token
                    );
                }
            }
        } catch (error: any) {
            console.error("Google Sign-In error:", error);
            Alert.alert("Error", "Failed to sign in with Google. Please try again.");
        } finally {
            setIsGoogleLoading(false);
        }
    }, []);

    const goToPrev = useCallback(() => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) =>
            prev === 0 ? characters.length - 1 : prev - 1
        );
    }, [characters.length]);

    const goToNext = useCallback(() => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) =>
            prev === characters.length - 1 ? 0 : prev + 1
        );
    }, [characters.length]);

    const isLoading = isAppleLoading || isGoogleLoading;
    const selectedChar = characters[selectedIndex];

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Background: character's default background image */}
            {selectedChar?.bg_image && (
                <ImageBackground
                    source={{ uri: selectedChar.bg_image }}
                    style={styles.bgImage}
                    resizeMode="cover"
                />
            )}

            {/* Character video preview */}
            {selectedChar?.video_url && (
                <View style={styles.videoContainer}>
                    <Video
                        ref={videoRef}
                        source={{ uri: selectedChar.video_url }}
                        style={styles.video}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay
                        isLooping
                        isMuted
                    />
                </View>
            )}

            {/* Purple gradient overlay — sexy vibe */}
            <LinearGradient
                colors={[
                    "rgba(58, 12, 100, 0.4)",
                    "rgba(30, 8, 60, 0.15)",
                    "rgba(20, 5, 45, 0.5)",
                    "rgba(15, 3, 35, 0.95)",
                ]}
                locations={[0, 0.25, 0.6, 1]}
                style={styles.gradientOverlay}
                pointerEvents="none"
            />

            {/* Content */}
            <View style={styles.content} pointerEvents="box-none">
                {/* Top: Logo */}
                <View style={styles.topArea} pointerEvents="none">
                    <Text style={styles.appName}>TrueFeel</Text>
                    <Text style={styles.tagline}>Your AI Companion</Text>
                </View>

                {/* Bottom: character + auth */}
                <View style={styles.bottomArea}>
                    {/* Character info */}
                    {selectedChar && (
                        <View style={styles.characterInfo}>
                            <Text style={styles.characterName}>{selectedChar.name}</Text>
                            {selectedChar.description && (
                                <Text style={styles.characterDesc} numberOfLines={2}>
                                    {selectedChar.description}
                                </Text>
                            )}
                        </View>
                    )}

                    {/* Character carousel */}
                    {characters.length > 1 && (
                        <View style={styles.carouselRow}>
                            <TouchableOpacity
                                style={styles.arrowBtn}
                                onPress={goToPrev}
                                activeOpacity={0.7}
                            >
                                <IconChevronLeft size={18} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>

                            <FlatList
                                style={{ flex: 1, marginHorizontal: 10 }}
                                data={characters}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.thumbnailList}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item, index }) => (
                                    <TouchableOpacity
                                        onPress={() => setSelectedIndex(index)}
                                        activeOpacity={0.7}
                                        style={[
                                            styles.thumbnailWrap,
                                            index === selectedIndex && styles.thumbnailWrapActive,
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: item.thumbnail_url ?? undefined }}
                                            style={[styles.thumbnail, { borderRadius: THUMBNAIL_SIZE / 2 }]}
                                            resizeMode="cover"
                                        />
                                    </TouchableOpacity>
                                )}
                            />

                            <TouchableOpacity
                                style={styles.arrowBtn}
                                onPress={goToNext}
                                activeOpacity={0.7}
                            >
                                <IconChevronRight size={18} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Auth buttons */}
                    <Text style={styles.signInLabel}>Get started</Text>

                    {Platform.OS === "ios" && (
                        <TouchableOpacity
                            style={[styles.button, styles.appleButton]}
                            onPress={handleAppleSignIn}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            {isAppleLoading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <>
                                    <AppleLogo
                                        size={20}
                                        color="#FFFFFF"
                                    />
                                    <Text style={styles.buttonText}>Continue with Apple</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.button, styles.googleButton]}
                        onPress={handleGoogleSignIn}
                        disabled={isLoading}
                        activeOpacity={0.8}
                    >
                        {isGoogleLoading ? (
                            <ActivityIndicator color="#1a1a2e" size="small" />
                        ) : (
                            <>
                                <GoogleLogo
                                    size={20}
                                />
                                <Text style={[styles.buttonText, styles.googleButtonText]}>
                                    Continue with Google
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.termsText}>
                        By continuing, you agree to our{" "}
                        <Text style={styles.termsLink} onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/terms")}>Terms of Service</Text>,{" "}
                        <Text style={styles.termsLink} onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/privacy")}>Privacy Policy</Text> and{" "}
                        <Text style={styles.termsLink} onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/eula")}>EULA</Text>
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#0d0221",
    },
    bgImage: {
        ...StyleSheet.absoluteFillObject,
    },
    videoContainer: {
        ...StyleSheet.absoluteFillObject,
        overflow: "hidden",
    },
    video: {
        width: "100%",
        height: "100%",
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "space-between",
    },

    // ─── Top ───
    topArea: {
        alignItems: "center",
        paddingTop: Platform.OS === "ios" ? 74 : 54,
    },
    appName: {
        fontSize: 38,
        fontWeight: "800",
        color: "#FFFFFF",
        letterSpacing: 1.5,
        textShadowColor: "rgba(100, 40, 180, 0.6)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 16,
    },
    tagline: {
        fontSize: 13,
        color: "rgba(200, 170, 255, 0.7)",
        letterSpacing: 4,
        textTransform: "uppercase",
        fontWeight: "400",
        marginTop: 4,
    },

    // ─── Bottom ───
    bottomArea: {
        paddingHorizontal: 28,
        paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    characterInfo: {
        marginBottom: 14,
        alignItems: "center",
    },
    characterName: {
        fontSize: 24,
        fontWeight: "700",
        color: "#FFFFFF",
        textShadowColor: "rgba(0,0,0,0.5)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    characterDesc: {
        fontSize: 13,
        color: "rgba(200, 180, 240, 0.6)",
        textAlign: "center",
        marginTop: 4,
        lineHeight: 18,
        paddingHorizontal: 12,
    },

    // ─── Carousel ───
    carouselRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 20,
    },
    arrowBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: "rgba(100, 50, 180, 0.2)",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "rgba(150, 100, 255, 0.15)",
    },
    thumbnailList: {
        paddingHorizontal: 8,
        gap: 10,
    },
    thumbnailWrap: {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: THUMBNAIL_SIZE / 2,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "rgba(150, 100, 255, 0.2)",
    },
    thumbnailWrapActive: {
        borderColor: "#9B59FF",
        borderWidth: 2.5,
        shadowColor: "#9B59FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
        elevation: 8,
    },
    thumbnail: {
        width: "100%",
        height: "100%",
    },

    // ─── Divider ───
    divider: {
        height: 1,
        backgroundColor: "rgba(150, 100, 255, 0.12)",
        marginBottom: 16,
    },

    // ─── Auth ───
    signInLabel: {
        fontSize: 12,
        color: "rgba(200, 170, 255, 0.45)",
        letterSpacing: 2.5,
        textTransform: "uppercase",
        textAlign: "center",
        marginBottom: 14,
        fontWeight: "600",
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        width: "100%",
        height: 52,
        borderRadius: 26,
        marginBottom: 10,
        shadowColor: "#7B2FBE",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    appleButton: {
        backgroundColor: "#000000",
    },
    googleButton: {
        backgroundColor: "rgba(255, 255, 255, 0.95)",
    },
    buttonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
        letterSpacing: 0.3,
    },
    googleButtonText: {
        color: "#1a1a2e",
    },
    termsText: {
        fontSize: 11,
        color: "rgba(200, 170, 255, 0.3)",
        textAlign: "center",
        marginTop: 14,
        lineHeight: 16,
        paddingHorizontal: 16,
    },
    termsLink: {
        color: "rgba(155, 89, 255, 0.7)",
        textDecorationLine: "underline",
    },
});
