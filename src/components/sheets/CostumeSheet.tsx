import { useTranslation } from "react-i18next";
import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Animated,
    Dimensions,
    Alert,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";

import * as Haptics from "expo-haptics";
import { useRewardedAd } from "../../hooks/useRewardedAd";
import { AdGateDialog } from "../AdGateDialog";
import { AdUnlockBadge } from "../ads/AdUnlockBadge";
import { consumeNoFillGrant, loadUnlocks, markUnlocked, requiresAd, subscribeUnlocks } from "../../services/unlockService";
import { AdUnits } from "../../config/ads";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { purchaseItem } from "../../services/checkinService";
import RubyIcon from "../icons/RubyIcon";

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
    price_ruby?: number | null;
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
    const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
    const [costumes, setCostumes] = useState<Costume[]>([]);
    const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
    const [tempUnlocked, setTempUnlocked] = useState<Set<string>>(new Set());
    const { showForGate } = useRewardedAd(AdUnits.rewarded, "change_costume");
    /** Outfit awaiting the user's answer in the ad-gate dialog. */
    const [gateFor, setGateFor] = useState<Costume | null>(null);
    /** Bumped whenever something unlocks, so the badges disappear immediately. */
    const [, setUnlockTick] = useState(0);
    useEffect(() => {
        loadUnlocks(userId);
        return subscribeUnlocks(() => setUnlockTick((n) => n + 1));
    }, []);
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
                .select("id, costume_name, thumbnail, model_url, url, tier, price_ruby")
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
            setErrorMessage(e.message || t("common.failed_load"));
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

    const applySelection = useCallback(
        (costume: Costume) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(costume);
        },
        [onSelect, onIsOpenedChange]
    );

    const goPro = useCallback(() => {
        onIsOpenedChange(false);
        sheetRef.current?.dismiss();
        setTimeout(() => onOpenSubscription?.(), 300);
    }, [onIsOpenedChange, onOpenSubscription]);

    const doBuy = useCallback(
        async (costume: Costume, price: number) => {
            if (!userId) return;
            const res = await purchaseItem(userId, "character_costume", costume.id);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setTempUnlocked((prev) => new Set(prev).add(costume.id));
                applySelection(costume);
            } else if (res.error === "insufficient") {
                Alert.alert(
                    t("common.not_enough_ruby"),
                    `You need ${res.need} ruby but have ${res.have}. Check in daily to earn more!`,
                    [{ text: "OK" }, { text: t("common.upgrade_pro"), onPress: goPro }]
                );
            } else {
                Alert.alert(t("common.purchase_failed"), res.error || t("common.try_again"));
            }
        },
        [userId, applySelection, goPro]
    );

    /**
     * Free outfits are gated behind a user-initiated rewarded ad: the user is
     * told what they are agreeing to and taps "Watch ad" themselves. PRO skips
     * it. If we cannot actually serve an ad we let the change through — the
     * feature must not break because AdMob had no fill.
     */
    const gateWithRewardedAd = useCallback(
        async (costume: Costume) => {
            if (isPro) return applySelection(costume);
            const outcome = await showForGate();
            if (outcome === "dismissed") return; // saw it, backed out
            if (outcome === "unavailable" && !consumeNoFillGrant()) {
                // No ad could be served. One asset per run is forgiven so our
                // own no-fill does not block a feature; past that we stop,
                // rather than handing over the whole catalogue for free.
                Alert.alert(t("common.error"), t("ads.no_fill"));
                return;
            }
            await markUnlocked("costume", costume.id, userId);
            applySelection(costume);
        },
        [isPro, showForGate, applySelection]
    );

    const handleSelect = useCallback(
        (costume: Costume) => {
            const isProItem = costume.tier === "pro";
            const isOwned = ownedIds.has(costume.id) || tempUnlocked.has(costume.id);
            if (isProItem && !isPro && !isOwned) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                const price = costume.price_ruby ?? 0;
                const buttons: any[] = [{ text: t("common.cancel"), style: "cancel" }];
                buttons.push({ text: t("common.upgrade_pro"), onPress: goPro });
                if (price > 0 && userId) {
                    buttons.push({ text: `Buy • ${price} 💎`, onPress: () => doBuy(costume, price) });
                }
                Alert.alert(
                    t("cos.locked"),
                    price > 0
                        ? `Unlock with ${price} 💎 ruby, or upgrade PRO to unlock everything.`
                        : t("cos.locked_body"),
                    buttons
                );
                return;
            }

            // Already wearing it — no ad for a no-op.
            if (costume.model_url === currentCostumeUrl) return applySelection(costume);

            // One ad per outfit, ever.
            if (!requiresAd("costume", costume.id, !!isPro)) return applySelection(costume);

            Haptics.selectionAsync();
            setGateFor(costume);
        },
        [isPro, ownedIds, tempUnlocked, userId, goPro, doBuy, applySelection, currentCostumeUrl, gateWithRewardedAd, t]
    );

    const renderItem = useCallback(
        ({ item }: { item: Costume }) => {
            const isSelected = item.model_url === currentCostumeUrl;
            const isProItem = item.tier === "pro";
            const isOwned = ownedIds.has(item.id) || tempUnlocked.has(item.id);
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
                        styles.avatarContainer,
                        isSelected && { borderColor: "#FF6FA5", backgroundColor: "rgba(255, 111, 165, 0.1)" }
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
                        {isLocked && (item.price_ruby ?? 0) > 0 && (
                            <View style={styles.priceBadge}>
                                <RubyIcon size={10} color="#FF6FA5" />
                                <Text style={styles.priceBadgeText}>{item.price_ruby}</Text>
                            </View>
                        )}
                        {!isLocked && !isSelected && requiresAd("costume", item.id, !!isPro) && (
                            <View style={styles.tileAdBadge}>
                                <AdUnlockBadge compact />
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
        [currentCostumeUrl, handleSelect, isPro, ownedIds, tempUnlocked]
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
                    <Text style={styles.errorText}>{t("common.failed_load")}</Text>
                    <Pressable onPress={load}>
                        <Text style={styles.retryText}>{t("common.retry")}</Text>
                    </Pressable>
                </View>
            );
        }
        if (costumes.length === 0) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: "rgba(255,255,255,0.5)" }}>{t("cos.none")}</Text>
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
            title={t("cos.title")}
            isDarkBackground
            detents={[0.7, 0.95]}
        >
            {renderContent()}
            <AdGateDialog
                visible={gateFor !== null}
                body={t("ads.gate_body_cos")}
                onWatch={() => {
                    const c = gateFor;
                    setGateFor(null);
                    if (c) gateWithRewardedAd(c);
                }}
                onUpgrade={() => {
                    setGateFor(null);
                    goPro();
                }}
                onCancel={() => setGateFor(null)}
            />
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
    retryText: { fontSize: 16, fontWeight: "600", color: "#FF6FA5" },
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
    tileAdBadge: { position: "absolute", top: 6, right: 6 },
    priceBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: "rgba(0,0,0,0.65)",
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 9,
    },
    priceBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
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
        backgroundColor: "#FF6FA5",
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
