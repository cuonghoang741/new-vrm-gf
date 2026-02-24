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

interface Costume {
    id: string;
    costume_name: string;
    thumbnail: string | null;
    model_url: string | null;
    tier: string | null;
}

interface CostumeSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    characterId: string | null;
    currentCostumeUrl: string | null;
    onSelect: (costume: Costume) => void;
}

export type CostumeSheetRef = BottomSheetRef;

const CostumeSheet = forwardRef<CostumeSheetRef, CostumeSheetProps>(({
    isOpened,
    onIsOpenedChange,
    characterId,
    currentCostumeUrl,
    onSelect,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const [costumes, setCostumes] = useState<Costume[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
                .select("id, costume_name, thumbnail, model_url, tier")
                .eq("character_id", characterId)
                .eq("available", true)
                .order("created_at", { ascending: true });
            if (error) throw error;
            if (data) setCostumes(data);
        } catch (e: any) {
            console.error("[CostumeSheet] Failed to load:", e);
            setErrorMessage(e.message || "Failed to load");
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

    const handleSelect = useCallback(
        (costume: Costume) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(costume);
        },
        [onSelect, onIsOpenedChange]
    );

    const renderItem = useCallback(
        ({ item }: { item: Costume }) => {
            const isSelected = item.model_url === currentCostumeUrl;
            const isPro = item.tier === "pro";

            return (
                <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [
                        styles.rowItem,
                        isSelected && styles.rowItemSelected,
                        pressed && styles.pressed,
                    ]}
                >
                    <View style={styles.rowAvatarContainer}>
                        <Image
                            source={{ uri: item.thumbnail ?? undefined }}
                            style={styles.rowAvatar}
                            contentFit="cover"
                            transition={200}
                        />
                        {isSelected && (
                            <View style={styles.selectedBadge}>
                                <Ionicons name="checkmark" size={14} color="#fff" />
                            </View>
                        )}
                    </View>

                    <View style={styles.rowContent}>
                        <View style={styles.rowTitleContainer}>
                            <Text style={styles.rowName} numberOfLines={1}>
                                {item.costume_name}
                            </Text>
                            {isPro && (
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
        [currentCostumeUrl, handleSelect]
    );

    const renderSkeleton = () => (
        <View style={styles.skeletonContainer}>
            {Array.from({ length: 4 }).map((_, i) => (
                <Animated.View key={i} style={[styles.skeletonRow, { opacity: shimmerOpacity }]} />
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
                    data={costumes}
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

    rowItem: {
        flexDirection: "row", alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20,
        padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
    },
    rowItemSelected: {
        backgroundColor: "rgba(139, 92, 246, 0.15)", borderColor: "#8B5CF6",
    },
    pressed: {
        transform: [{ scale: 0.98 }], backgroundColor: "rgba(255,255,255,0.12)",
    },
    rowAvatarContainer: { position: "relative", marginRight: 16 },
    rowAvatar: {
        width: 60, height: 60, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.2)",
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
        width: "100%", height: 84, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)",
    },
});
