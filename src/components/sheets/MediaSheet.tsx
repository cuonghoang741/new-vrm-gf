import { useTranslation } from "react-i18next";
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
import { IconFlag, IconPhoto, IconVideo, IconX } from "@tabler/icons-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { useSubscription } from "../../contexts/SubscriptionContext";
import { analyticsService } from "../../services/AnalyticsService";
import { track } from "../../services/trackEvents";
import { lockStateOf, useItemUnlock, type UnlockableItem } from "../../hooks/useItemUnlock";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import LockIcon from "../icons/LockIcon";
import { ReportDialog } from "./ReportDialog";
import { isReported } from "../../services/reportService";

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
    /** > 0 means it is bought, not merely subscribed to. */
    price_ruby: number | null;
    /** Bond level with her before this is on offer at all. */
    unlock_relationship_level: number | null;
    /** 'default' | 'ads' | 'ruby' | 'pro'; the authority over tier and price. */
    unlock_type: string | null;
}

interface MediaSheetProps {
    /** Selected character's picture, blurred behind the sheet (Yuuki style). */
    sceneImage?: string | null;
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    characterId: string | null;
    onOpenSubscription?: () => void;
    /** Everything below feeds the shared unlock flow; see `useItemUnlock`. */
    userId?: string | null;
    onOpenQuests?: () => void;
    bondLevel?: number;
    bondProgress?: number | null;
    characterName?: string;
    onOpenBond?: () => void;
}

export type MediaSheetRef = BottomSheetRef;

type TabKey = "image" | "video";

const MediaSheet = forwardRef<MediaSheetRef, MediaSheetProps>(
    ({
        isOpened, onIsOpenedChange, characterId, onOpenSubscription, sceneImage,
        userId, onOpenQuests, bondLevel, bondProgress, characterName, onOpenBond,
    }, ref) => {
        const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
        const { isPro } = useSubscription();

        const [activeTab, setActiveTab] = useState<TabKey>("image");
        const [images, setImages] = useState<MediaItem[]>([]);
        const [videos, setVideos] = useState<MediaItem[]>([]);
        const [loading, setLoading] = useState(false);
        const [errorMessage, setErrorMessage] = useState<string | null>(null);
        const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
        const [reportOpen, setReportOpen] = useState(false);
        const [reportedNow, setReportedNow] = useState(false);
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
                    .select("id, url, thumbnail, tier, media_type, content_type, price_ruby, unlock_relationship_level, unlock_type")
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
            if (!isOpened) return;
            track.galleryView();
            if (characterId) load();
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

        const close = useCallback(() => {
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
        }, [onIsOpenedChange]);

        /**
         * The same unlock flow every other picker uses.
         *
         * It used to be `tier === 'pro'` and nothing else, which meant the
         * seven free photos priced at 150 ruby opened for nothing and the ones
         * behind a bond level opened early. Tier, price and level all live in
         * `medias`; `lockStateOf` is what reads them.
         */
        const unlock = useItemUnlock({
            isPro,
            userId,
            bondLevel,
            bondProgress,
            characterName,
            onOpenBond,
            placement: "gallery",
            adBody: t("ads.gate_body_media"),
            onOpenPaywall: () => {
                close();
                setTimeout(() => onOpenSubscription?.(), 300);
            },
            onOpenQuests: () => {
                close();
                setTimeout(() => onOpenQuests?.(), 450);
            },
            closeSheet: close,
            kind: "gallery",
        });

        const toItem = useCallback(
            (m: MediaItem): UnlockableItem => ({
                type: "media",
                id: m.id,
                unlock: m.unlock_type as any,
                tier: m.tier,
                unlockAtLevel: m.unlock_relationship_level,
                price: m.price_ruby,
                name: t(m.media_type === "video" ? "media.one_video" : "media.one_photo"),
                image: m.thumbnail ?? m.url,
            }),
            [t]
        );

        const open = useCallback((item: MediaItem) => {
            analyticsService.logMediaView(item.id, item.media_type === "photo" ? "image" : "video");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedMedia(item);
        }, []);

        const handleMediaPress = useCallback(
            (item: MediaItem) => {
                unlock.request(toItem(item), () => open(item));
            },
            [unlock.request, toItem, open]
        );

        const renderMediaItem = useCallback(
            ({ item }: { item: MediaItem }) => {
                const state = lockStateOf(toItem(item), isPro, bondLevel ?? 5);
                const isLocked = state !== "free";
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
                            blurRadius={isLocked ? 28 : 0}
                        />

                        {/* Video indicator */}
                        {isVideo && (
                            <View style={styles.videoIndicator}>
                                <Ionicons name="play" size={14} color="#fff" />
                            </View>
                        )}

                        {/* What it costs, not just that it costs something.
                            A blurred tile that says PRO when the real price is
                            150 ruby sends the user to the wrong screen. */}
                        {isLocked && (
                            <View style={styles.lockedOverlay}>
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,6,20,0.4)" }]} />
                                <View style={styles.lockBadge}>
                                    {state === "ad" ? (
                                        <Ionicons name="play" size={15} color="#fff" />
                                    ) : state === "level" ? (
                                        <Ionicons name="heart" size={15} color="#fff" />
                                    ) : (
                                        <LockIcon size={16} color="#fff" />
                                    )}
                                </View>
                                {state === "ruby" ? (
                                    <View style={styles.lockPrice}>
                                        <RubyIcon size={11} color={SHEET.ruby} />
                                        <Text style={styles.lockText}>{item.price_ruby}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.lockText}>
                                        {state === "ad"
                                            ? t("media.lock_ad")
                                            : state === "level"
                                                ? `Lv ${item.unlock_relationship_level}`
                                                : "PRO"}
                                    </Text>
                                )}
                            </View>
                        )}
                    </Pressable>
                );
            },
            [isPro, handleMediaPress, toItem, bondLevel, t]
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
                        <Text style={styles.errorText}>{t("common.failed_load")}</Text>
                        <Pressable onPress={load}>
                            <Text style={styles.retryText}>{t("common.retry")}</Text>
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
                title={t("media.title")}
                sceneImage={sceneImage ?? null}
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
                            <IconPhoto size={18} color={activeTab === "image" ? "#FF6FA5" : "rgba(255,255,255,0.4)"} />
                            <Text style={[styles.tabText, activeTab === "image" && styles.tabTextActive]}>
                                {t("media.images")} ({images.length})
                            </Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tab, activeTab === "video" && styles.tabActive]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setActiveTab("video");
                            }}
                        >
                            <IconVideo size={18} color={activeTab === "video" ? "#FF6FA5" : "rgba(255,255,255,0.4)"} />
                            <Text style={[styles.tabText, activeTab === "video" && styles.tabTextActive]}>
                                {t("media.videos")} ({videos.length})
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

                                {/* Flagging a photo. Always visible next to the
                                    close button rather than hidden behind a
                                    long-press: Google Play rejected the build
                                    for having no way to report AI content, and
                                    a way nobody can find is the same thing. */}
                                <Pressable
                                    style={styles.reportLightbox}
                                    hitSlop={8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setReportOpen(true);
                                    }}
                                >
                                    <IconFlag color="rgba(255,255,255,0.85)" size={20} />
                                    <Text style={styles.reportLightboxText}>
                                        {reportedNow || isReported(selectedMedia?.id)
                                            ? t("report.reported")
                                            : t("report.action_media")}
                                    </Text>
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

                    {unlock.dialogs}

                    <ReportDialog
                        visible={reportOpen}
                        kind="media"
                        targetId={selectedMedia?.id}
                        snapshot={selectedMedia?.url}
                        onClose={() => setReportOpen(false)}
                        onReported={() => {
                            setReportedNow(true);
                            // Take it off the screen it was reported from.
                            setSelectedMedia(null);
                        }}
                    />
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
    retryText: { fontSize: 16, fontWeight: "600", color: "#FF6FA5" },

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
        backgroundColor: "rgba(255, 111, 165, 0.15)",
    },
    tabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "rgba(255,255,255,0.4)",
    },
    tabTextActive: {
        color: "#FF6FA5",
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
        backgroundColor: "rgba(255, 111, 165, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    lockPrice: { flexDirection: "row", alignItems: "center", gap: 3 },
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
    reportLightbox: {
        position: "absolute",
        top: 60,
        left: 25,
        zIndex: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    reportLightboxText: { color: "rgba(255,255,255,0.85)", fontSize: 13.5, fontWeight: "700" },
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
