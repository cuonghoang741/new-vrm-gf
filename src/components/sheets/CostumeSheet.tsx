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

interface Costume {
    id: string;
    costume_name: string;
    thumbnail: string | null;
    model_url: string | null;
    url: string | null;
    tier: string | null;
}

interface CostumeSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    characterId: string | null;
    currentCostumeUrl: string | null;
    onSelect: (costume: Costume) => void;
    isPro?: boolean;
    onOpenSubscription?: () => void;
    userId?: string;
}

export type CostumeSheetRef = BottomSheetRef;

const CostumeSheet = forwardRef<CostumeSheetRef, CostumeSheetProps>(({
    isOpened,
    onIsOpenedChange,
    characterId,
    currentCostumeUrl,
    onSelect,
    isPro = false,
    onOpenSubscription,
    userId,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const [costumes, setCostumes] = useState<Costume[]>([]);
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
        if (!characterId || loading) return;
        setLoading(true);
        setErrorMessage(null);
        try {
            const { data, error } = await supabase
                .from("character_costumes")
                .select("id, costume_name, thumbnail, model_url, url, tier")
                .eq("character_id", characterId)
                .eq("available", true)
                .order("created_at", { ascending: true });
            if (error) throw error;
            if (data) setCostumes(data);

            // Fetch owned costume IDs
            if (userId) {
                const { data: owned } = await supabase
                    .from("user_assets")
                    .select("item_id")
                    .eq("user_id", userId)
                    .eq("item_type", "character_costume");
                if (owned) setOwnedIds(new Set(owned.map(o => o.item_id)));
            }
        } catch (e: any) {
            console.error("[CostumeSheet] Failed to load:", e);
            setErrorMessage(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [characterId, loading, userId]);

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

    // Auto-scroll to active item
    useEffect(() => {
        if (!isOpened || costumes.length === 0 || !currentCostumeUrl) return;

        const index = costumes.findIndex(c => c.model_url === currentCostumeUrl);
        if (index === -1) return;

        const timer = setTimeout(() => {
            if (listRef.current && index < costumes.length) {
                try {
                    listRef.current.scrollToIndex({
                        index,
                        animated: true,
                        viewPosition: 0.5
                    });
                } catch (e) {
                    console.warn("[CostumeSheet] Auto-scroll failed:", e);
                }
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [isOpened, currentCostumeUrl, costumes.length]);

    const handleSelect = useCallback(
        (costume: Costume) => {
            const isProItem = costume.tier === "pro";
            const isOwned = ownedIds.has(costume.id);
            if (isProItem && !isPro) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onIsOpenedChange(false);
                sheetRef.current?.dismiss();
                setTimeout(() => onOpenSubscription?.(), 300);
                return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(costume);
        },
        [onSelect, onIsOpenedChange, isPro, onOpenSubscription, ownedIds]
    );

    const renderItem = useCallback(
        ({ item }: { item: Costume }) => {
            const isSelected = item.model_url === currentCostumeUrl;
            const isProItem = item.tier === "pro";
            const isOwned = ownedIds.has(item.id);
            const isLocked = isProItem && !isPro;

            return (
                <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                        styles.gridItem,
                        pressed && styles.pressed,
                    ]}
                >
                    <View style={[
                        styles.avatarContainer,
                        isSelected && { borderColor: "#8B5CF6", backgroundColor: "rgba(139, 92, 246, 0.1)" }
                    ]}>
                        <Image
                            source={{ uri: item.thumbnail ?? undefined }}
                            style={styles.avatar}
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
                                <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                        )}
                    </View>
                    <Text style={styles.costumeName} numberOfLines={1}>
                        {item.costume_name}
                    </Text>
                </Pressable>
            );
        },
        [currentCostumeUrl, handleSelect, isPro, ownedIds]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonItem, { opacity: shimmerOpacity }]} />
            ))}
        </View>
    );

    const renderContent = () => {
        if (loading && costumes.length === 0) {
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
        if (costumes.length === 0) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: "rgba(255,255,255,0.5)" }}>No costumes available</Text>
                </View>
            );
        }
        return (
            <View style={{ flex: 1 }}>
                <FlatList
                    ref={listRef}
                    data={costumes}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    numColumns={3}
                    columnWrapperStyle={styles.columnWrapper}
                    getItemLayout={(data, index) => {
                        // Approximate height: (ITEM_WIDTH / 0.72) + name label + vertical gaps/margins
                        const itemHeight = (ITEM_WIDTH / 0.72) + 16 + GRID_GAP + 6;
                        const rowHeight = itemHeight;
                        return { length: rowHeight, offset: rowHeight * Math.floor(index / 3), index };
                    }}
                    onScrollToIndexFailed={(info) => {
                        console.warn("[CostumeSheet] Scroll to index failed:", info);
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
            title="Costumes"
            isDarkBackground
            detents={[0.7, 0.95]}
        >
            {renderContent()}
        </BottomSheet>
    );
});

export default CostumeSheet;

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
    gridItemSelected: {
        // No background, maybe a subtle scale or glow?
        // Let's just use the badge and maybe a border on the avatar
    },
    pressed: {
        transform: [{ scale: 0.95 }],
    },
    avatarContainer: {
        width: "100%",
        aspectRatio: 0.72, // Portrait for full vertical previews
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        marginBottom: 6,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 2,
        borderColor: "transparent",
    },
    avatar: {
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
    selectedBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        backgroundColor: "#8B5CF6",
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.3)",
    },
    costumeName: {
        fontSize: 12,
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
        aspectRatio: 0.8,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
});
