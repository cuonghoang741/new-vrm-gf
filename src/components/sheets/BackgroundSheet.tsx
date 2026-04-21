import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Animated,
    Dimensions,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";

const { width } = Dimensions.get("window");
const GRID_PADDING = 20;
const GRID_GAP = 10;
const ITEM_WIDTH = (width - (GRID_PADDING * 2) - (GRID_GAP * 2)) / 3;

interface Background {
    id: string;
    name: string;
    thumbnail: string | null;
    image: string;
    tier: string | null;
    video_url: string | null;
    is_dark?: boolean;
}

interface BackgroundSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    currentBackgroundId: string | null;
    onSelect: (bg: Background) => void;
    isPro?: boolean;
    onOpenSubscription?: () => void;
    userId?: string;
}

export type BackgroundSheetRef = BottomSheetRef;

const BackgroundSheet = forwardRef<BackgroundSheetRef, BackgroundSheetProps>(({
    isOpened,
    onIsOpenedChange,
    currentBackgroundId,
    onSelect,
    isPro = false,
    onOpenSubscription,
    userId,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const [backgrounds, setBackgrounds] = useState<Background[]>([]);
    const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const listRef = useRef<FlatList>(null);
    const shimmerOpacity = useRef(new Animated.Value(0.3)).current;

    useImperativeHandle(ref, () => ({
        present: (index?: number) => sheetRef.current?.present(index),
        dismiss: () => sheetRef.current?.dismiss(),
    }));

    const load = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        setErrorMessage(null);
        try {
            const { data, error } = await supabase
                .from("backgrounds")
                .select("id, name, thumbnail, image, tier, video_url, is_dark")
                .eq("available", true)
                .eq("public", true)
                .order("created_at", { ascending: true });
            if (error) throw error;
            if (data) setBackgrounds(data);

            // Fetch owned background IDs
            if (userId) {
                const { data: owned } = await supabase
                    .from("user_assets")
                    .select("item_id")
                    .eq("user_id", userId)
                    .eq("item_type", "background");
                if (owned) setOwnedIds(new Set(owned.map(o => o.item_id)));
            }
        } catch (e: any) {
            console.error("[BackgroundSheet] Failed to load:", e);
            setErrorMessage(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [loading, userId]);

    useEffect(() => {
        if (isOpened && backgrounds.length === 0) {
            load();
        }
    }, [isOpened]);

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

    // Auto-scroll to active item
    useEffect(() => {
        if (!isOpened || backgrounds.length === 0 || !currentBackgroundId) return;

        const index = backgrounds.findIndex(bg => bg.id === currentBackgroundId);
        if (index === -1) return;

        const timer = setTimeout(() => {
            if (listRef.current && index < backgrounds.length) {
                try {
                    listRef.current.scrollToIndex({
                        index,
                        animated: true,
                        viewPosition: 0.5
                    });
                } catch (e) {
                    console.warn("[BackgroundSheet] Auto-scroll failed:", e);
                }
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [isOpened, currentBackgroundId, backgrounds.length]);

    const handleSelect = useCallback(
        (bg: Background) => {
            const isProItem = bg.tier === "pro";
            const isOwned = ownedIds.has(bg.id);
            if (isProItem && !isPro && !isOwned) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onIsOpenedChange(false);
                sheetRef.current?.dismiss();
                setTimeout(() => onOpenSubscription?.(), 300);
                return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(bg);
        },
        [onSelect, onIsOpenedChange, isPro, onOpenSubscription, ownedIds]
    );

    const renderItem = useCallback(
        ({ item }: { item: Background }) => {
            const isSelected = item.id === currentBackgroundId;
            const isProItem = item.tier === "pro";
            const isOwned = ownedIds.has(item.id);
            const isLocked = isProItem && !isPro && !isOwned;

            return (
                <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                        styles.gridItem,
                        pressed && styles.pressed,
                    ]}
                >
                    <View style={[
                        styles.previewContainer,
                        isSelected && { borderColor: "#8B5CF6", backgroundColor: "rgba(139, 92, 246, 0.1)" }
                    ]}>
                        <Image
                            source={{ uri: item.thumbnail ?? item.image }}
                            style={styles.preview}
                            contentFit="cover"
                            transition={200}
                        />
                        {isLocked && !isSelected && (
                            <View style={styles.lockOverlay}>
                                <View style={styles.lockIconBadge}>
                                    <Ionicons name="lock-closed" size={12} color="#FFF" />
                                </View>
                            </View>
                        )}
                        {isSelected && !isLocked && (
                            <View style={styles.selectedBadge}>
                                <Ionicons name="checkmark" size={10} color="#fff" />
                            </View>
                        )}
                        {!!item.video_url && (
                            <View style={styles.videoBadge}>
                                <Ionicons name="play" size={8} color="#fff" />
                            </View>
                        )}

                        <View style={[item.is_dark ? styles.darkBadge : styles.lightBadge, styles.badgeAbsolute]}>
                            <Ionicons name={item.is_dark ? "moon" : "sunny"} size={8} color={item.is_dark ? "#fff" : "#FFB800"} />
                            <Text style={item.is_dark ? styles.modeText : styles.modeTextLight}>{item.is_dark ? "D" : "L"}</Text>
                        </View>
                    </View>

                    <Text style={styles.bgName} numberOfLines={1}>
                        {item.name}
                    </Text>
                </Pressable>
            );
        },
        [currentBackgroundId, handleSelect, isPro, ownedIds]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonItem, { opacity: shimmerOpacity }]} />
            ))}
        </View>
    );

    const renderContent = () => {
        if (loading && backgrounds.length === 0) {
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
        if (backgrounds.length === 0) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: "rgba(255,255,255,0.5)" }}>No backgrounds found</Text>
                </View>
            );
        }
        return (
            <View style={{ flex: 1 }}>
                <FlatList
                    ref={listRef}
                    data={backgrounds}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    numColumns={3}
                    columnWrapperStyle={styles.columnWrapper}
                    getItemLayout={(data, index) => {
                        // Approximate height: (ITEM_WIDTH / 0.72) + name label + vertical gaps/margins
                        const itemHeight = (ITEM_WIDTH / 0.72) + 20 + GRID_GAP + 6;
                        const rowHeight = itemHeight; 
                        return { length: rowHeight, offset: rowHeight * Math.floor(index / 3), index };
                    }}
                    onScrollToIndexFailed={(info) => {
                        console.warn("[BackgroundSheet] Scroll to index failed:", info);
                    }}
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
            title="Location"
            isDarkBackground
            detents={[0.7, 0.95]}
        >
            {renderContent()}
        </BottomSheet>
    );
});

export default BackgroundSheet;

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1, alignItems: "center", justifyContent: "center",
        padding: 20, minHeight: 200,
    },
    errorText: { fontSize: 16, color: "#fff", marginBottom: 8 },
    retryText: { fontSize: 16, fontWeight: "600", color: "#8B5CF6" },
    listContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },

    gridItem: {
        width: ITEM_WIDTH,
        alignItems: "center",
        marginBottom: GRID_GAP + 6,
    },
    pressed: {
        transform: [{ scale: 0.95 }],
    },
    previewContainer: {
        width: "100%",
        aspectRatio: 0.72,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        marginBottom: 6,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 2,
        borderColor: "transparent",
    },
    preview: {
        width: "100%",
        height: "100%",
    },
    lockOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    lockIconBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        backgroundColor: "rgba(0,0,0,0.6)",
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
    },
    videoBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: "rgba(0,0,0,0.6)",
        alignItems: "center",
        justifyContent: "center",
    },
    selectedBadge: {
        position: "absolute",
        bottom: 6,
        right: 6,
        backgroundColor: "#8B5CF6",
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.3)",
    },
    bgName: {
        fontSize: 11,
        fontWeight: "600",
        color: "#FFFFFF",
        textAlign: "center",
        width: "100%",
    },
    columnWrapper: {
        justifyContent: "flex-start",
        gap: GRID_GAP,
    },
    skeletonGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: GRID_PADDING,
        gap: GRID_GAP,
    },
    skeletonItem: {
        width: ITEM_WIDTH,
        aspectRatio: 0.72,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.06)",
        marginBottom: GRID_GAP,
    },
    badgeAbsolute: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        marginTop: 0,
        backgroundColor: 'rgba(255,255,255,0.85)',
        paddingHorizontal: 4,
    },
    darkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 4,
        alignSelf: 'flex-start',
        gap: 3,
    },
    lightBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 4,
        alignSelf: 'flex-start',
        gap: 3,
    },
    modeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#FFF',
        textTransform: 'uppercase',
    },
    modeTextLight: {
        fontSize: 9,
        fontWeight: '800',
        color: '#000',
        textTransform: 'uppercase',
    },
});
