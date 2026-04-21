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
    IconChevronRight,
    IconLock,
    IconWoman,
} from "@tabler/icons-react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { LinearGradient } from 'expo-linear-gradient';

interface Character {
    id: string;
    name: string;
    thumbnail_url: string | null;
    avatar?: string | null;
    small_thumb_url?: string | null;
    small_avatar?: string | null;
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
                        styles.rowItem,
                        isSelected && styles.rowItemSelected,
                        pressed && styles.pressed,
                        !isAvailable && { opacity: 0.5 },
                    ]}
                >
                    {/* Avatar */}
                    <View style={styles.rowAvatarContainer}>
                        <Image
                            source={{ uri: item.small_thumb_url ?? item.thumbnail_url ?? undefined }}
                            style={styles.rowAvatar}
                            contentFit="cover"
                            transition={200}
                        />
                        <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.4)']}
                            style={styles.avatarGradient}
                        />
                        {isSelected && (
                            <View style={styles.selectedBadge}>
                                <Ionicons name="checkmark" size={14} color="#fff" />
                            </View>
                        )}
                    </View>

                    {/* Content */}
                    <View style={styles.rowContent}>
                        <View style={styles.rowTitleContainer}>
                            <Text style={styles.rowName} numberOfLines={1}>
                                {item.name}
                            </Text>
                            {isLocked && isAvailable && (
                                <LinearGradient
                                    colors={['#8B5CF6', '#D946EF']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.proPill}
                                >
                                    <Text style={styles.proPillText}>PRO</Text>
                                </LinearGradient>
                            )}
                            {!isAvailable && (
                                <View style={[styles.proPill, { backgroundColor: '#475569', borderColor: 'transparent' }]}>
                                    <Text style={styles.proPillText}>COMING SOON</Text>
                                </View>
                            )}
                        </View>
                        {item.description && (
                            <Text style={styles.rowDescription} numberOfLines={1}>
                                {item.description}
                            </Text>
                        )}

                        {/* Stats */}
                        <View style={styles.rowStats}>
                            {item.data?.height_cm && (
                                <View style={styles.statChip}>
                                    <MaterialCommunityIcons name="human-male-height" size={12} color="rgba(255,255,255,0.6)" />
                                    <Text style={styles.statValue}>{item.data.height_cm}cm</Text>
                                </View>
                            )}
                            {item.data?.rounds && (
                                <View style={styles.statChip}>
                                    <IconWoman size={12} color="rgba(255,255,255,0.6)" />
                                    <Text style={styles.statValue}>
                                        {item.data.rounds.r1}-{item.data.rounds.r2}-{item.data.rounds.r3}
                                    </Text>
                                </View>
                            )}
                            {item.data?.old && (
                                <View style={styles.statChip}>
                                    <Text style={styles.statValue}>{item.data.old} yr</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Right */}
                    <View style={styles.rowRight}>
                        <View style={styles.chevronCircle}>
                            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
                        </View>
                    </View>
                </Pressable>
            );
        },
        [currentCharacterId, handleSelect, isPro, ownedIds]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonContainer}>
            {Array.from({ length: 6 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonRow, { opacity: shimmerOpacity }]} />
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

    // Row
    rowItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    rowItemSelected: {
        backgroundColor: "rgba(139, 92, 246, 0.15)",
        borderColor: "#8B5CF6",
    },
    pressed: {
        transform: [{ scale: 0.98 }],
        backgroundColor: "rgba(255,255,255,0.12)",
    },

    // Avatar
    rowAvatarContainer: { 
        position: "relative", 
        marginRight: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    rowAvatar: {
        width: 84,
        height: 112,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    avatarGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        borderRadius: 14,
    },
    selectedBadge: {
        position: "absolute",
        bottom: -4,
        right: -4,
        backgroundColor: "#8B5CF6",
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#1A1A1A",
        elevation: 4,
    },

    // Content
    rowContent: { flex: 1, justifyContent: "center", paddingVertical: 2 },
    rowTitleContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6,
    },
    rowName: { 
        fontSize: 19, 
        fontWeight: "900", 
        color: "#FFFFFF",
        letterSpacing: 0.3,
    },
    rowDescription: {
        fontSize: 13,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 10,
        lineHeight: 16,
    },

    // Stats
    rowStats: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
    },
    statChip: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.1)",
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        gap: 4,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    statValue: {
        fontSize: 11,
        fontWeight: "700",
        color: "rgba(255,255,255,0.8)",
    },

    // Right
    rowRight: { marginLeft: 8, alignItems: "center", justifyContent: "center" },
    chevronCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
    },

    // Badges
    proPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        marginLeft: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    proPillText: { fontSize: 10, fontWeight: "900", color: "#fff" },

    // Skeleton
    skeletonContainer: { paddingHorizontal: 20, gap: 12 },
    skeletonRow: {
        width: "100%",
        height: 136,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
});
