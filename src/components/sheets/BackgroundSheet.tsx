import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Animated,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";

interface Background {
    id: string;
    name: string;
    thumbnail: string | null;
    image: string;
    tier: string | null;
    video_url: string | null;
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
                .select("id, name, thumbnail, image, tier, video_url")
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
            const isPro_item = item.tier === "pro";
            const isOwned = ownedIds.has(item.id);

            return (
                <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                        styles.rowItem,
                        isSelected && styles.rowItemSelected,
                        pressed && styles.pressed,
                    ]}
                >
                    <View style={styles.previewContainer}>
                        <Image
                            source={{ uri: item.thumbnail ?? item.image }}
                            style={styles.preview}
                            contentFit="cover"
                            transition={200}
                        />
                        {isSelected && (
                            <View style={styles.selectedBadge}>
                                <Ionicons name="checkmark" size={14} color="#fff" />
                            </View>
                        )}
                        {!!item.video_url && (
                            <View style={styles.videoBadge}>
                                <Ionicons name="play" size={10} color="#fff" />
                            </View>
                        )}
                    </View>

                    <View style={styles.rowContent}>
                        <View style={styles.rowTitleContainer}>
                            <Text style={styles.rowName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            {isPro_item && !isPro && (
                                <View style={styles.proPill}>
                                    <Text style={styles.proPillText}>PRO</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    <View style={styles.rowRight}>
                        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.2)" />
                    </View>
                </Pressable>
            );
        },
        [currentBackgroundId, handleSelect, isPro, ownedIds]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonContainer}>
            {Array.from({ length: 5 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonRow, { opacity: shimmerOpacity }]} />
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
                    data={backgrounds}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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

    rowItem: {
        flexDirection: "row", alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20,
        padding: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    },
    rowItemSelected: {
        backgroundColor: "rgba(139, 92, 246, 0.15)", borderColor: "#8B5CF6",
    },
    pressed: {
        transform: [{ scale: 0.98 }], backgroundColor: "rgba(255,255,255,0.12)",
    },
    previewContainer: { position: "relative", marginRight: 16 },
    preview: {
        width: 88, height: 56, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.2)",
    },
    videoBadge: {
        position: "absolute", top: 4, left: 4,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
    },
    selectedBadge: {
        position: "absolute", bottom: -6, right: -6,
        backgroundColor: "#8B5CF6", width: 22, height: 22, borderRadius: 11,
        alignItems: "center", justifyContent: "center",
        borderWidth: 2, borderColor: "#000",
    },
    rowContent: { flex: 1, justifyContent: "center" },
    rowTitleContainer: { flexDirection: "row", alignItems: "center" },
    rowName: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
    proPill: {
        backgroundColor: "#8b5cf6", paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, marginLeft: 8, borderWidth: 1, borderColor: "rgba(255,255,255,1)",
    },
    proPillText: { fontSize: 9, fontWeight: "900", color: "#fff" },
    rowRight: { marginLeft: 12, alignItems: "center", justifyContent: "center" },

    skeletonContainer: { paddingHorizontal: 20, gap: 12 },
    skeletonRow: {
        width: "100%", height: 76, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)",
    },
});
