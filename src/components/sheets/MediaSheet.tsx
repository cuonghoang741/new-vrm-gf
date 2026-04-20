import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Dimensions,
    Animated,
    Modal,
    ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Video, ResizeMode } from "expo-av";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconPhoto, IconVideo, IconLock, IconX } from "@tabler/icons-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { analyticsService } from "../../services/AnalyticsService";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_COUNT = 3;
const ITEM_GAP = 3;
const ITEM_SIZE = (SCREEN_WIDTH - 40 - ITEM_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

interface MediaItem {
    id: string;
    url: string;
    thumbnail: string | null;
    tier: string | null;
    media_type: string; // "image" | "video"
    content_type: string | null;
}

interface MediaSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    characterId: string | null;
    onOpenSubscription?: () => void;
}

export type MediaSheetRef = BottomSheetRef;

type TabKey = "image" | "video";

const MediaSheet = forwardRef<MediaSheetRef, MediaSheetProps>(
    ({ isOpened, onIsOpenedChange, characterId, onOpenSubscription }, ref) => {
        const sheetRef = useRef<BottomSheetRef>(null);
        const { isPro } = useSubscription();

        const [activeTab, setActiveTab] = useState<TabKey>("image");
        const [images, setImages] = useState<MediaItem[]>([]);
        const [videos, setVideos] = useState<MediaItem[]>([]);
        const [loading, setLoading] = useState(false);
        const [errorMessage, setErrorMessage] = useState<string | null>(null);
        const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
        const shimmerOpacity = useRef(new Animated.Value(0.3)).current;

        useImperativeHandle(ref, () => ({
            present: (index?: number) => sheetRef.current?.present(index),
            dismiss: () => sheetRef.current?.dismiss(),
        }));

        const load = useCallback(async () => {
            if (!characterId || loading) return;
            setLoading(true);
            setErrorMessage(null);
            try {
                const { data, error } = await supabase
                    .from("medias")
                    .select("id, url, thumbnail, tier, media_type, content_type")
                    .eq("character_id", characterId)
                    .eq("available", true)
                    .order("created_at", { ascending: false });
                if (error) throw error;
                if (data) {
                    setImages(data.filter((m) => m.media_type === "photo"));
                    setVideos(data.filter((m) => m.media_type === "video"));
                }
            } catch (e: any) {
            } finally {
                setLoading(false);
            }
        }, [characterId, loading]);

        useEffect(() => {
            if (isOpened && characterId) {
                load();
            }
        }, [isOpened, characterId]);

        useEffect(() => {
            if (loading) {
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(shimmerOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                        Animated.timing(shimmerOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
                    ])
                ).start();
            } else {
                shimmerOpacity.stopAnimation();
                shimmerOpacity.setValue(0.3);
            }
        }, [loading]);

        const handleMediaPress = useCallback(
            (item: MediaItem) => {
                const isLocked = item.tier === "pro" && !isPro;
                if (isLocked) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onOpenSubscription?.();
                    return;
                }

                // Log Analytics
                analyticsService.logMediaView(item.id, item.media_type === "photo" ? "image" : "video");

                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedMedia(item);
            },
            [isPro, onOpenSubscription]
        );

        const renderMediaItem = useCallback(
            ({ item }: { item: MediaItem }) => {
                const isLocked = item.tier === "pro" && !isPro;
                const isVideo = item.media_type === "video";

                return (
                    <Pressable
                        onPress={() => handleMediaPress(item)}
                        style={({ pressed }) => [styles.mediaItem, pressed && { opacity: 0.8 }]}
                    >
                        <Image
                            source={{ uri: item.thumbnail ?? item.url }}
                            style={styles.mediaThumbnail}
                            contentFit="cover"
                            transition={200}
                        />

                        {/* Video indicator */}
                        {isVideo && (
                            <View style={styles.videoIndicator}>
                                <Ionicons name="play" size={14} color="#fff" />
                            </View>
                        )}

                        {/* PRO blur overlay */}
                        {isLocked && (
                            <View style={styles.lockedOverlay}>
                                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.lockBadge}>
                                    <IconLock size={16} color="#fff" />
                                </View>
                                <Text style={styles.lockText}>PRO</Text>
                            </View>
                        )}
                    </Pressable>
                );
            },
            [isPro, handleMediaPress]
        );

        const activeData = activeTab === "image" ? images : videos;

        const renderSkeleton = () => (
            <View style={styles.skeletonGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <Animated.View key={i} style={[styles.skeletonItem, { opacity: shimmerOpacity }]} />
                ))}
            </View>
        );

        const renderContent = () => {
            if (loading && images.length === 0 && videos.length === 0) {
                return <View style={{ flex: 1 }}>{renderSkeleton()}</View>;
            }
            if (errorMessage) {
                return (
                    <View style={styles.centerContainer}>
                        <Text style={styles.errorText}>Failed to load</Text>
                        <Pressable onPress={load}>
                            <Text style={styles.retryText}>Retry</Text>
                        </Pressable>
                    </View>
                );
            }
            if (activeData.length === 0) {
                return (
                    <View style={styles.centerContainer}>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>
                            No {activeTab === "image" ? "images" : "videos"} yet
                        </Text>
                    </View>
                );
            }
            return (
                <View style={{ flex: 1 }}>
                    <FlatList
                        data={activeData}
                        renderItem={renderMediaItem}
                        keyExtractor={(item) => item.id}
                        numColumns={COLUMN_COUNT}
                        contentContainerStyle={styles.gridContent}
                        columnWrapperStyle={styles.gridRow}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            );
        };

        return (
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                backgroundBlur="system-thick-material-dark"
                title="Gallery"
                isDarkBackground
                detents={[0.7, 0.95]}
            >
                <View style={{ flex: 1 }}>
                    {/* Tabs */}
                    <View style={styles.tabBar}>
                        <Pressable
                            style={[styles.tab, activeTab === "image" && styles.tabActive]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTab("image");
                            }}
                        >
                            <IconPhoto size={18} color={activeTab === "image" ? "#8B5CF6" : "rgba(255,255,255,0.4)"} />
                            <Text style={[styles.tabText, activeTab === "image" && styles.tabTextActive]}>
                                Images ({images.length})
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tab, activeTab === "video" && styles.tabActive]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTab("video");
                            }}
                        >
                            <IconVideo size={18} color={activeTab === "video" ? "#8B5CF6" : "rgba(255,255,255,0.4)"} />
                            <Text style={[styles.tabText, activeTab === "video" && styles.tabTextActive]}>
                                Videos ({videos.length})
                            </Text>
                        </Pressable>
                    </View>

                    {/* Content */}
                    {renderContent()}

                    {/* Lightbox Modal */}
                    <Modal
                        visible={!!selectedMedia}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setSelectedMedia(null)}
                    >
                        <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill}>
                            <View style={styles.lightboxContainer}>
                                <Pressable
                                    style={styles.closeLightbox}
                                    onPress={() => setSelectedMedia(null)}
                                >
                                    <IconX color={activeTab === "image" ? (images.length > 0 ? "#fff" : "rgba(255,255,255,0.8)") : "#fff"} size={28} />
                                </Pressable>

                                {selectedMedia?.media_type === "photo" ? (
                                    <Image
                                        source={{ uri: selectedMedia.url }}
                                        style={styles.lightboxImage}
                                        contentFit="contain"
                                    />
                                ) : (
                                    <Video
                                        source={{ uri: selectedMedia?.url || "" }}
                                        rate={1.0}
                                        volume={1.0}
                                        isMuted={false}
                                        resizeMode={ResizeMode.CONTAIN}
                                        shouldPlay
                                        useNativeControls
                                        style={styles.lightboxVideo}
                                    />
                                )}
                            </View>
                        </BlurView>
                    </Modal>
                </View>
            </BottomSheet>
        );
    }
);

export default MediaSheet;

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 200,
    },
    errorText: { fontSize: 16, color: "#fff", marginBottom: 8 },
    retryText: { fontSize: 16, fontWeight: "600", color: "#8B5CF6" },

    // Tabs
    tabBar: {
        flexDirection: "row",
        marginHorizontal: 20,
        marginBottom: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 3,
    },
    tab: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    tabActive: {
        backgroundColor: "rgba(139, 92, 246, 0.15)",
    },
    tabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "rgba(255,255,255,0.4)",
    },
    tabTextActive: {
        color: "#8B5CF6",
    },

    // Grid
    gridContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    gridRow: {
        gap: ITEM_GAP,
        marginBottom: ITEM_GAP,
    },

    // Media item
    mediaItem: {
        width: ITEM_SIZE,
        height: ITEM_SIZE * 1.3,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    mediaThumbnail: {
        width: "100%",
        height: "100%",
    },
    videoIndicator: {
        position: "absolute",
        bottom: 6,
        right: 6,
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: "rgba(0,0,0,0.6)",
        alignItems: "center",
        justifyContent: "center",
    },

    // Locked overlay
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        overflow: "hidden",
    },
    lockBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(139, 92, 246, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    lockText: {
        fontSize: 10,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 0.5,
    },

    // Skeleton
    skeletonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: ITEM_GAP,
        paddingHorizontal: 20,
    },
    skeletonItem: {
        width: ITEM_SIZE,
        height: ITEM_SIZE * 1.3,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    // Lightbox
    lightboxContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
    },
    closeLightbox: {
        position: "absolute",
        top: 60,
        right: 25,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
    lightboxImage: {
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH * 1.5,
    },
    lightboxVideo: {
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH * 1.5,
    },
});
