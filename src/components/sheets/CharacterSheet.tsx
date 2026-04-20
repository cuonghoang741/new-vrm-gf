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
import {
    IconLock,
    IconWoman,
} from "@tabler/icons-react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { Dimensions } from "react-native";

const { width } = Dimensions.get("window");
const GRID_PADDING = 20;
const GRID_GAP = 10;
const ITEM_WIDTH = (width - (GRID_PADDING * 2) - (GRID_GAP * 2)) / 3;

interface Character {
    id: string;
    name: string;
    thumbnail_url: string | null;
    avatar?: string | null;
    description: string | null;
    tier: string | null;
    available?: boolean;
    data?: {
        height_cm?: number;
        rounds?: { r1: number; r2: number; r3: number };
        old?: number;
    };
}

interface CharacterSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    currentCharacterId: string | null;
    onSelect: (character: Character) => void;
    isPro?: boolean;
    onOpenSubscription?: () => void;
    userId?: string;
}

export type CharacterSheetRef = BottomSheetRef;

const CharacterSheet = forwardRef<CharacterSheetRef, CharacterSheetProps>(({
    isOpened,
    onIsOpenedChange,
    currentCharacterId,
    onSelect,
    isPro = false,
    onOpenSubscription,
    userId,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const [characters, setCharacters] = useState<Character[]>([]);
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
                .from("characters")
                .select("id, name, thumbnail_url, avatar, description, tier, data, available")
                .eq("is_public", true)
                .order("order", { ascending: true });
            if (error) throw error;
            if (data) setCharacters(data);

            // Fetch owned character IDs
            if (userId) {
                const { data: owned } = await supabase
                    .from("user_assets")
                    .select("item_id")
                    .eq("user_id", userId)
                    .eq("item_type", "character");
                if (owned) setOwnedIds(new Set(owned.map(o => o.item_id)));
            }
        } catch (e: any) {
            console.error("[CharacterSheet] Failed to load:", e);
            setErrorMessage(e.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [loading, userId]);

    useEffect(() => {
        if (isOpened && characters.length === 0) {
            load();
        }
    }, [isOpened]);

    // Shimmer animation
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
        (char: Character) => {
            if (char.available === false) return;
            const isOwned = ownedIds.has(char.id);
            // Switching characters requires PRO or ownership
            if (!isPro && !isOwned && char.id !== currentCharacterId) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onIsOpenedChange(false);
                sheetRef.current?.dismiss();
                setTimeout(() => onOpenSubscription?.(), 300);
                return;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(char);
        },
        [onSelect, onIsOpenedChange, isPro, onOpenSubscription, currentCharacterId, ownedIds]
    );

    const renderItem = useCallback(
        ({ item }: { item: Character }) => {
            const isSelected = item.id === currentCharacterId;
            const isOwned = ownedIds.has(item.id);
            const isAvailable = item.available !== false;
            const isLocked = !isPro && !isOwned && !isSelected;

            return (
                <Pressable
                    onPress={() => handleSelect(item)}
                    disabled={!isAvailable}
                    style={({ pressed }) => [
                        styles.gridItem,
                        pressed && styles.pressed,
                        !isAvailable && { opacity: 0.8 },
                    ]}
                >
                    <View style={[
                        styles.avatarContainer,
                        isSelected && { borderColor: "#8B5CF6", backgroundColor: "rgba(139, 92, 246, 0.1)" }
                    ]}>
                        <Image
                            source={{ uri: item.thumbnail_url ?? undefined }}
                            style={styles.avatar}
                            contentFit="cover"
                            transition={200}
                        />
                        {isLocked && isAvailable && !isSelected && (
                            <View style={styles.lockOverlay}>
                                <View style={styles.lockIconBadge}>
                                    <Ionicons name="lock-closed" size={12} color="#FFF" />
                                </View>
                            </View>
                        )}
                        {!isAvailable && (
                            <View style={styles.comingSoonOverlay}>
                                <Text style={styles.comingSoonText}>SOON</Text>
                            </View>
                        )}
                        {isSelected && !isLocked && (
                            <View style={styles.selectedBadge}>
                                <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                        )}

                        {/* Stats Overlay */}
                        {isAvailable && (
                            <View style={styles.statsOverlay}>
                                {item.data?.height_cm && item.data?.old && (
                                    <Text style={styles.statLine}>
                                        {item.data.height_cm}cm • {item.data.old}yr
                                    </Text>
                                )}
                                {item.data?.rounds && (
                                    <Text style={styles.statLine}>
                                        {item.data.rounds.r1}-{item.data.rounds.r2}-{item.data.rounds.r3}
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>
                    <Text style={styles.characterName} numberOfLines={1}>
                        {item.name}
                    </Text>
                </Pressable>
            );
        },
        [currentCharacterId, handleSelect, isPro, ownedIds]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonItem, { opacity: shimmerOpacity }]} />
            ))}
        </View>
    );

    const renderContent = () => {
        if (loading && characters.length === 0) {
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
        if (characters.length === 0) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: "rgba(255,255,255,0.5)" }}>No characters found</Text>
                </View>
            );
        }
        return (
            <View style={{ flex: 1 }}>
                <FlatList
                    data={characters}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    numColumns={3}
                    columnWrapperStyle={styles.columnWrapper}
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
            title="Characters"
            isDarkBackground
            detents={[0.85, 0.95]}
        >
            {renderContent()}
        </BottomSheet>
    );
});

export default CharacterSheet;

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        minHeight: 200,
    },
    errorText: { fontSize: 16, color: "#fff", marginBottom: 8 },
    retryText: { fontSize: 16, fontWeight: "600", color: "#8B5CF6" },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 8,
    },
    gridItem: {
        width: ITEM_WIDTH,
        alignItems: "center",
        marginBottom: GRID_GAP + 6,
    },
    pressed: {
        transform: [{ scale: 0.95 }],
    },
    avatarContainer: {
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
    comingSoonOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.3)",
        alignItems: "center",
        justifyContent: "center",
    },
    comingSoonText: {
        fontSize: 8,
        fontWeight: "900",
        color: "#fff",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
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
    characterName: {
        fontSize: 12,
        fontWeight: "700",
        color: "#FFFFFF",
        textAlign: "center",
        width: "100%",
        marginTop: 2,
    },
    statsOverlay: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        paddingVertical: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    statLine: {
        fontSize: 8,
        fontWeight: "900",
        color: "#FFF",
        textTransform: "uppercase",
        letterSpacing: 0.2,
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
});
