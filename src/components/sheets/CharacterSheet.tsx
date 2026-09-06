import { useTranslation } from "react-i18next";
import React, { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Animated,
    Alert,
} from "react-native";
import { Image } from "expo-image";
import { IconWoman } from "@tabler/icons-react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useRewardedAd } from "../../hooks/useRewardedAd";
import { AdUnits } from "../../config/ads";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { LinearGradient } from 'expo-linear-gradient';
import { purchaseItem } from "../../services/checkinService";
import LockIcon from "../icons/LockIcon";

const BG = "#0F0A1E";
const ACCENT = "#FF4D8D";

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
    price_ruby?: number | null;
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
    const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
    const [tempUnlocked, setTempUnlocked] = useState<Set<string>>(new Set());
    const { showForGate } = useRewardedAd(AdUnits.rewarded, "change_character");
    /** Tile being previewed in the hero — not yet the active character. */
    const [focusedId, setFocusedId] = useState<string | null>(null);
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
                .select("id, name, thumbnail_url, avatar, description, tier, data, available, price_ruby")
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
            setErrorMessage(e.message || t("common.failed_load"));
        } finally {
            setLoading(false);
        }
    }, [loading, userId]);

    useEffect(() => {
        // Reopening always starts on the active character, never on whatever
        // tile happened to be previewed last time.
        if (isOpened) setFocusedId(currentCharacterId);
        if (isOpened && characters.length === 0) {
            load();
        }
    }, [isOpened, currentCharacterId]);

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

    const applySelection = useCallback(
        (char: Character) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
            onSelect(char);
        },
        [onSelect, onIsOpenedChange]
    );

    const goPro = useCallback(() => {
        onIsOpenedChange(false);
        sheetRef.current?.dismiss();
        setTimeout(() => onOpenSubscription?.(), 300);
    }, [onIsOpenedChange, onOpenSubscription]);

    const doBuy = useCallback(
        async (char: Character, price: number) => {
            if (!userId) return;
            const res = await purchaseItem(userId, "character", char.id);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setTempUnlocked((prev) => new Set(prev).add(char.id));
                applySelection(char);
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
     * Switching to an already-owned/free character costs a rewarded ad. The
     * user opts in explicitly; PRO skips it; and if no ad can be served we let
     * the switch happen rather than blocking on our own no-fill.
     */
    const gateWithRewardedAd = useCallback(
        async (char: Character) => {
            if (isPro) return applySelection(char);
            const outcome = await showForGate();
            if (outcome === "dismissed") return;
            applySelection(char);
        },
        [isPro, showForGate, applySelection]
    );

    const handleSelect = useCallback(
        (char: Character) => {
            if (char.available === false) return;
            const isOwned = ownedIds.has(char.id) || tempUnlocked.has(char.id);
            // Switching characters requires PRO, ownership, or buying with ruby.
            if (!isPro && !isOwned && char.id !== currentCharacterId) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                const price = char.price_ruby ?? 0;
                const buttons: any[] = [{ text: t("common.cancel"), style: "cancel" }];
                buttons.push({ text: t("common.upgrade_pro"), onPress: goPro });
                if (price > 0 && userId) {
                    buttons.push({ text: `Buy • ${price} 💎`, onPress: () => doBuy(char, price) });
                }
                Alert.alert(
                    t("char.locked"),
                    price > 0
                        ? `Unlock ${char.name} with ${price} 💎 ruby, or upgrade PRO to unlock everything.`
                        : `Upgrade to PRO to unlock ${char.name}.`,
                    buttons
                );
                return;
            }

            // Re-picking the current character is a no-op — never charge an ad.
            if (char.id === currentCharacterId) return applySelection(char);

            if (isPro) return applySelection(char);

            Haptics.selectionAsync();
            Alert.alert(
                t("ads.gate_title"),
                t("ads.gate_body_char", { name: char.name }),
                [
                    { text: t("common.cancel"), style: "cancel" },
                    { text: t("common.upgrade_pro"), onPress: goPro },
                    { text: t("ads.watch_ad"), onPress: () => gateWithRewardedAd(char) },
                ]
            );
        },
        [isPro, ownedIds, tempUnlocked, currentCharacterId, userId, goPro, doBuy, applySelection, gateWithRewardedAd, t]
    );

    // Tapping a tile only FOCUSES it — the hero previews her and nothing
    // switches until the user presses the button. Keeps an accidental tap in a
    // 3-wide grid from costing a rewarded ad or a model reload.
    const focusedChar =
        characters.find((c) => c.id === focusedId) ??
        characters.find((c) => c.id === currentCharacterId) ??
        characters[0];

    const focus = useCallback((c: Character) => {
        Haptics.selectionAsync();
        setFocusedId(c.id);
    }, []);

    const isLockedFor = useCallback(
        (c: Character) =>
            !isPro &&
            !(ownedIds.has(c.id) || tempUnlocked.has(c.id)) &&
            c.id !== currentCharacterId,
        [isPro, ownedIds, tempUnlocked, currentCharacterId]
    );

    const renderTile = useCallback(
        ({ item }: { item: Character }) => {
            const isFocused = item.id === focusedId;
            const isCurrent = item.id === currentCharacterId;
            const isAvailable = item.available !== false;
            const locked = isLockedFor(item);

            return (
                <Pressable
                    onPress={() => focus(item)}
                    disabled={!isAvailable}
                    style={({ pressed }) => [
                        styles.tile,
                        isFocused && styles.tileFocused,
                        pressed && { opacity: 0.85 },
                        !isAvailable && { opacity: 0.45 },
                    ]}
                >
                    <Image
                        source={{ uri: item.small_thumb_url ?? item.thumbnail_url ?? undefined }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                    />
                    <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.85)"]}
                        style={styles.tileScrim}
                    />

                    {locked && isAvailable && (
                        <View style={styles.tileLock}>
                            <LockIcon size={16} color="#fff" />
                        </View>
                    )}
                    {isCurrent && (
                        <View style={styles.tileCurrent}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                    )}
                    {!isAvailable && (
                        <View style={styles.tileSoon}>
                            <Text style={styles.tileSoonText}>SOON</Text>
                        </View>
                    )}

                    <Text style={styles.tileName} numberOfLines={1}>
                        {item.name}
                    </Text>
                </Pressable>
            );
        },
        [focusedId, currentCharacterId, focus, isLockedFor]
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
                    <Text style={styles.errorText}>{t("common.failed_load")}</Text>
                    <Pressable onPress={load}>
                        <Text style={styles.retryText}>{t("common.retry")}</Text>
                    </Pressable>
                </View>
            );
        }
        if (characters.length === 0 || !focusedChar) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: "rgba(255,255,255,0.5)" }}>{t("char.none")}</Text>
                </View>
            );
        }

        const heroLocked = isLockedFor(focusedChar);
        const heroImg =
            focusedChar.avatar ?? focusedChar.thumbnail_url ?? undefined;
        const ctaLabel = heroLocked
            ? t("char.unlock_pro")
            : focusedChar.id === currentCharacterId || isPro
                ? t("char.start_chatting")
                : t("char.watch_to_switch");

        return (
            <View style={{ flex: 1 }}>
                {/* ─── Hero: portrait pinned right, info over the dark left ─── */}
                <View style={styles.hero}>
                    <View style={styles.heroPortrait}>
                        <Image
                            source={{ uri: heroImg }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            contentPosition="top"
                            transition={220}
                            blurRadius={heroLocked ? 18 : 0}
                        />
                    </View>

                    {/* Left-to-right scrim: near-solid on the left so the name
                        stays legible, gone by ~60% so her face is untouched. */}
                    <LinearGradient
                        colors={["rgba(15,10,30,0.96)", "rgba(15,10,30,0.67)", "rgba(15,10,30,0)"]}
                        locations={[0, 0.3, 0.6]}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />
                    {/* Bottom fade so the hero dissolves into the grid. */}
                    <LinearGradient
                        colors={["transparent", "#0F0A1E"]}
                        locations={[0.55, 1]}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />

                    {heroLocked && (
                        <View style={styles.heroLockBadge}>
                            <LockIcon size={26} color="#fff" />
                        </View>
                    )}

                    <View style={styles.heroInfo}>
                        <View style={styles.heroNameRow}>
                            <Text style={styles.heroName} numberOfLines={1}>
                                {focusedChar.name}
                            </Text>
                            {focusedChar.tier === "pro" && !isPro && (
                                <View style={styles.proPill}>
                                    <Text style={styles.proPillText}>PRO</Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.heroChips}>
                            {focusedChar.data?.old != null && (
                                <View style={styles.statChip}>
                                    <Text style={styles.statValue}>{focusedChar.data.old} yr</Text>
                                </View>
                            )}
                            {focusedChar.data?.height_cm != null && (
                                <View style={styles.statChip}>
                                    <MaterialCommunityIcons name="human-male-height" size={12} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.statValue}>{focusedChar.data.height_cm}cm</Text>
                                </View>
                            )}
                            {focusedChar.data?.rounds && (
                                <View style={styles.statChip}>
                                    <IconWoman size={12} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.statValue}>
                                        {focusedChar.data.rounds.r1}-{focusedChar.data.rounds.r2}-{focusedChar.data.rounds.r3}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {!!focusedChar.description && (
                            <Text style={styles.heroStory} numberOfLines={4}>
                                {focusedChar.description}
                            </Text>
                        )}
                    </View>
                </View>

                {/* ─── "Choose your partner" ─── */}
                <View style={styles.pickerHeader}>
                    <Ionicons name="sparkles" size={14} color={ACCENT} />
                    <Text style={styles.pickerHeaderText} numberOfLines={1}>
                        {t("char.choose_partner")}
                    </Text>
                    <Ionicons name="sparkles" size={14} color={ACCENT} />
                </View>

                {/* ─── Grid ─── */}
                <FlatList
                    data={characters}
                    renderItem={renderTile}
                    keyExtractor={(item) => item.id}
                    numColumns={3}
                    columnWrapperStyle={{ gap: 10 }}
                    contentContainerStyle={styles.gridContent}
                    showsVerticalScrollIndicator={false}
                />

                {/* ─── Commit ─── */}
                <View style={styles.bottomBar}>
                    <Pressable
                        onPress={() => handleSelect(focusedChar)}
                        style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                    >
                        <LinearGradient
                            colors={heroLocked ? ["#3A2A4A", "#3A2A4A"] : ["#FF6FA3", "#FF2E74"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <Ionicons
                                name={heroLocked ? "lock-closed" : focusedChar.id === currentCharacterId || isPro ? "chatbubble-ellipses" : "play"}
                                size={18}
                                color="#fff"
                            />
                            <Text style={styles.ctaText}>{ctaLabel}</Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        );
    };

    return (
        <BottomSheet
            ref={sheetRef}
            isOpened={isOpened}
            onIsOpenedChange={onIsOpenedChange}
            backgroundBlur="system-thick-material-dark"
            isDarkBackground
            backgroundColor="#0F0A1E"
            detents={[0.95]}
        >
            {renderContent()}
        </BottomSheet>
    );
});

export default CharacterSheet;

const styles = StyleSheet.create({
    // ─── Hero ───
    hero: { height: 330, width: "100%", backgroundColor: BG, overflow: "hidden" },
    heroPortrait: { position: "absolute", top: 0, bottom: 0, right: 0, width: "70%" },
    heroLockBadge: {
        position: "absolute", right: "28%", top: "42%",
        width: 60, height: 60, borderRadius: 30,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.35)",
        borderWidth: 1.6, borderColor: "rgba(255,255,255,0.75)",
    },
    heroInfo: { position: "absolute", left: 20, top: 18, bottom: 22, width: "56%" },
    heroNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    heroName: {
        color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 0.3,
        flexShrink: 1, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 8,
    },
    heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    heroStory: {
        color: "rgba(255,255,255,0.92)", fontSize: 13.5, lineHeight: 19,
        marginTop: 12, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6,
    },

    // ─── "Choose your partner" ───
    pickerHeader: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, paddingHorizontal: 20, paddingVertical: 10,
    },
    pickerHeaderText: {
        color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2, flexShrink: 1,
    },

    // ─── Grid ───
    gridContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
    tile: {
        flex: 1, aspectRatio: 0.74, borderRadius: 14, overflow: "hidden",
        backgroundColor: "#1B1430", borderWidth: 2, borderColor: "transparent",
    },
    tileFocused: { borderColor: ACCENT },
    tileScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
    tileName: {
        position: "absolute", left: 7, right: 7, bottom: 7,
        color: "#fff", fontSize: 12, fontWeight: "700",
    },
    tileLock: {
        position: "absolute", top: 6, right: 6,
        width: 26, height: 26, borderRadius: 13,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    tileCurrent: {
        position: "absolute", top: 6, left: 6,
        width: 22, height: 22, borderRadius: 11,
        alignItems: "center", justifyContent: "center", backgroundColor: ACCENT,
    },
    tileSoon: {
        position: "absolute", top: 6, left: 6,
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, backgroundColor: "#475569",
    },
    tileSoonText: { color: "#fff", fontSize: 8, fontWeight: "800" },

    // ─── Commit ───
    bottomBar: {
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18,
        backgroundColor: BG,
        borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
    },
    cta: {
        height: 54, borderRadius: 16, flexDirection: "row",
        alignItems: "center", justifyContent: "center", gap: 10,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },

    centerContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        minHeight: 200,
    },
    errorText: { fontSize: 16, color: "#fff", marginBottom: 8 },
    retryText: { fontSize: 16, fontWeight: "600", color: "#FF6FA5" },

    // Row

    // Avatar

    // Content

    // Stats
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
