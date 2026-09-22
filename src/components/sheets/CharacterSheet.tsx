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
    Platform,
    Dimensions,
    Modal,
} from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import MaskedView from "@react-native-masked-view/masked-view";
import { IconWoman } from "@tabler/icons-react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useRewardedAd } from "../../hooks/useRewardedAd";
import { AdGateDialog } from "../AdGateDialog";
import { AdUnlockBadge } from "../ads/AdUnlockBadge";
import { consumeNoFillGrant, loadUnlocks, markUnlocked, requiresAd, subscribeUnlocks } from "../../services/unlockService";
import { AdUnits } from "../../config/ads";
import { supabase } from "../../config/supabase";
import { localizeCharacters } from "../../cache/charactersCache";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetRef } from "../common/BottomSheet";
import { LinearGradient } from 'expo-linear-gradient';
import { purchaseItem } from "../../services/checkinService";
import LockIcon from "../icons/LockIcon";
import { track } from "../../services/trackEvents";

const BG = "#0F0A1E";
const ACCENT = "#FF4D8D";

/**
 * Fixed tile width instead of `flex: 1`: with flex, a last row holding one or
 * two characters stretched them across the whole sheet.
 */
const GRID_COLUMNS = 3;
const GRID_PADDING = 16;
const GRID_GAP = 10;
const TILE_W =
    (Dimensions.get("window").width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

interface Character {
    id: string;
    name: string;
    thumbnail_url: string | null;
    avatar?: string | null;
    small_thumb_url?: string | null;
    small_avatar?: string | null;
    /** Short looping demo clip; the hero plays it once it has buffered. */
    video_url?: string | null;
    description: string | null;
    tier: string | null;
    available?: boolean;
    price_ruby?: number | null;
    data?: {
        /** Flagged teaser: shown with a SOON badge, never selectable. */
        coming_soon?: boolean;
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
        const insets = useSafeAreaInsets();
    const [characters, setCharacters] = useState<Character[]>([]);
    const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
    const [tempUnlocked, setTempUnlocked] = useState<Set<string>>(new Set());
    const { showForGate } = useRewardedAd(AdUnits.rewarded, "change_character");
    /** Character awaiting the user's answer in the ad-gate dialog. */
    const [gateFor, setGateFor] = useState<Character | null>(null);
    /** Bumped whenever something unlocks, so the badges disappear immediately. */
    const [, setUnlockTick] = useState(0);
    useEffect(() => {
        loadUnlocks(userId);
        return subscribeUnlocks(() => setUnlockTick((n) => n + 1));
    }, []);
    /** Tile being previewed in the hero — not yet the active character. */
    const [focusedId, setFocusedId] = useState<string | null>(null);
    /** True once her demo clip has a frame to show; gates the crossfade. */
    const [videoReady, setVideoReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const shimmerOpacity = useRef(new Animated.Value(0.3)).current;


    useImperativeHandle(ref, () => ({
        present: () => onIsOpenedChange(true),
        dismiss: () => onIsOpenedChange(false),
    }));

    const load = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        setErrorMessage(null);
        try {
            const { data, error } = await supabase
                .from("characters")
                .select("id, name, thumbnail_url, avatar, description, tier, data, available, price_ruby, video_url, small_thumb_url, small_avatar")
                .eq("is_public", true)
                // Available characters, plus the ones deliberately flagged as
                // coming soon. Everything else unavailable stays hidden — that
                // was twenty-two retired tiles that looked pickable and did
                // nothing when tapped.
                .or("available.eq.true,data->>coming_soon.eq.true")
                .order("order", { ascending: true });
            if (error) throw error;
            if (data) setCharacters(await localizeCharacters(data as Character[]));

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
        // A new hero means a new clip: drop back to the still until it buffers,
        // or the previous character's video stays on screen under her portrait.
        setVideoReady(false);
        if (isOpened && characters.length === 0) {
            load();
        }
    }, [isOpened, currentCharacterId]);

    // Switching preview tiles swaps the clip too.
    useEffect(() => { setVideoReady(false); }, [focusedId]);

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
            onIsOpenedChange(false);
            onSelect(char);
        },
        [onSelect, onIsOpenedChange]
    );

    const goPro = useCallback(() => {
        onIsOpenedChange(false);
        onIsOpenedChange(false);
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
            // iOS: an ad presented while this native sheet is up opens
            // underneath it — invisible, never rewarded. Close the sheet first.
            if (Platform.OS === "ios") {
                onIsOpenedChange(false);
                onIsOpenedChange(false);
                await new Promise((r) => setTimeout(r, 550));
            }
            const outcome = await showForGate();
            if (outcome === "dismissed") return; // saw it, backed out
            if (outcome === "unavailable" && !consumeNoFillGrant()) {
                // No ad could be served. One asset per run is forgiven so our
                // own no-fill does not block a feature; past that we stop,
                // rather than handing over the whole catalogue for free.
                Alert.alert(t("common.error"), t("ads.no_fill"));
                return;
            }
            await markUnlocked("character", char.id, userId);
            applySelection(char);
        },
        [isPro, showForGate, applySelection, onIsOpenedChange]
    );

    /**
     * What stands between the user and this character, by the same rules the
     * pickers use (see `lockStateOf`):
     *
     *   free + no price → one rewarded ad
     *   free + price    → ruby
     *   pro  + no price → PRO
     *   pro  + price    → PRO first, then ruby
     *
     * It used to offer "upgrade OR pay ruby" on a priced PRO character, which
     * showed a non-subscriber two different prices for the same person.
     */
    const lockOf = useCallback(
        (c: Character): "free" | "ad" | "pro" | "ruby" => {
            if (c.id === currentCharacterId) return "free";
            if (ownedIds.has(c.id) || tempUnlocked.has(c.id)) return "free";
            const price = c.price_ruby ?? 0;
            if (c.tier === "pro") {
                if (!isPro) return "pro";
                return price > 0 ? "ruby" : "free";
            }
            if (price > 0) return "ruby";
            return isPro ? "free" : "ad";
        },
        [isPro, ownedIds, tempUnlocked, currentCharacterId]
    );

    /** Blur/veil the art for anything that cannot be used right now. */
    const isLockedFor = useCallback(
        (c: Character) => lockOf(c) === "pro" || lockOf(c) === "ruby",
        [lockOf]
    );

    const handleSelect = useCallback(
        (char: Character) => {
            if (char.available === false) return;
            const isOwned = ownedIds.has(char.id) || tempUnlocked.has(char.id);
            // Only PRO-tier characters need the paywall; free ones fall through
            // to the rewarded gate below.
            const lock = lockOf(char);

            // PRO is the gate, and it is the only offer — never a second price
            // alongside it.
            if (lock === "pro") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                track.unlockSelect("character", char.id, 0, "pro");
                Alert.alert(t("char.locked"), t("char.need_pro", { name: char.name }), [
                    { text: t("common.cancel"), style: "cancel" },
                    { text: t("common.upgrade_pro"), onPress: goPro },
                ]);
                return;
            }

            // Priced: confirm the spend before taking the ruby.
            if (lock === "ruby") {
                const price = char.price_ruby ?? 0;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                track.unlockSelect("character", char.id, price, "hearts");
                Alert.alert(
                    t("char.buy_title", { name: char.name }),
                    t("char.buy_body", { name: char.name, n: price }),
                    [
                        { text: t("common.cancel"), style: "cancel" },
                        { text: t("char.buy_confirm", { n: price }), onPress: () => doBuy(char, price) },
                    ]
                );
                return;
            }

            // Re-picking the current character is a no-op — never charge an ad.
            if (char.id === currentCharacterId) return applySelection(char);

            // One ad per character, ever. Already paid for, or PRO, goes
            // straight through.
            if (!requiresAd("character", char.id, !!isPro)) return applySelection(char);

            Haptics.selectionAsync();
            setGateFor(char);
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

    /**
     * PRO-locked, i.e. behind the paywall or a ruby purchase.
     *
     * This used to ignore `tier` entirely and treat every character the user
     * did not already own as locked — which meant the six free characters were
     * paywalled along with the twenty-six PRO ones, and no free character was
     * ever reachable. Costumes and backgrounds already keyed off tier; this
     * brings characters in line.
     *
     * A free character is not locked. It costs one rewarded ad the first time,
     * which is a separate gate (see requiresAd).
     */
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
                        // Dimmed, but still legible — it has to sell her.
                        !isAvailable && { opacity: 0.78 },
                    ]}
                >
                    <Image
                        // Same artwork as the hero and the play screen, just
                        // the small copy. It used to read `small_thumb_url`,
                        // which for the older characters is a stale file from a
                        // previous CDN — so every tile showed a different
                        // picture from the hero above it.
                        source={{
                            uri:
                                item.small_avatar ??
                                item.avatar ??
                                item.small_thumb_url ??
                                item.thumbnail_url ??
                                undefined,
                        }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                        // The hero already blurs a PRO character; the grid did
                        // not, so a locked tile showed the art in full while
                        // the same art was obscured above it.
                        // No blur anywhere on this page: the art is what the
                        // page is for. The veil alone marks a locked tile.
                    />
                    {/* Flat black veil over locked art, matching yuuki's
                        `ColoredBox(black 42%)`. It sits under the badges and
                        the name scrim, so only the artwork is dimmed. */}
                    {locked && isAvailable && <View style={styles.tileVeil} />}
                    <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.85)"]}
                        style={styles.tileScrim}
                    />

                    {locked && isAvailable && (
                        <View style={styles.tileLock}>
                            <LockIcon size={16} color="#fff" />
                        </View>
                    )}
                    {!locked && isAvailable && requiresAd("character", item.id, !!isPro) && (
                        <View style={styles.tileAdBadge}>
                            <AdUnlockBadge compact />
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

    /**
     * Mirrors the real page: hero block with her name and stats on the left,
     * then the 3-column grid, then the CTA bar. It used to be six full-width
     * 136pt rows — a shape this page never takes — so the content appeared to
     * jump to a different screen the moment it loaded.
     */
    const renderSkeleton = () => (
        <View style={{ flex: 1 }}>
            <View style={[styles.hero, { height: 330 + insets.top }]}>
                <Animated.View style={[styles.skHeroPortrait, { opacity: shimmerOpacity }]} />
                <View style={[styles.heroInfo, { top: 18 + insets.top }]}>
                    <Animated.View style={[styles.skBar, { width: "62%", height: 26, opacity: shimmerOpacity }]} />
                    <Animated.View style={[styles.skBar, { width: "34%", height: 14, marginTop: 10, opacity: shimmerOpacity }]} />
                    <Animated.View style={[styles.skBar, { width: "92%", height: 11, marginTop: 16, opacity: shimmerOpacity }]} />
                    <Animated.View style={[styles.skBar, { width: "80%", height: 11, marginTop: 7, opacity: shimmerOpacity }]} />
                    <Animated.View style={[styles.skBar, { width: "46%", height: 11, marginTop: 7, opacity: shimmerOpacity }]} />
                </View>
            </View>

            <View style={styles.skGrid}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <Animated.View key={i} style={[styles.skTile, { opacity: shimmerOpacity }]} />
                ))}
            </View>

            <View style={styles.bottomBar}>
                <Animated.View style={[styles.skCta, { opacity: shimmerOpacity }]} />
            </View>
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
        // Locked characters stay on the blurred still — a clip cannot be
        // blurred the way the image is, so playing it would leak the art.
        const heroVideo = heroLocked ? null : (focusedChar.video_url || null);
        const heroLock = lockOf(focusedChar);
        const ctaLabel =
            heroLock === "pro" ? t("char.unlock_pro")
            : heroLock === "ruby" ? t("char.buy_confirm", { n: focusedChar.price_ruby ?? 0 })
            : heroLock === "ad" ? t("char.watch_to_switch")
            : t("char.start_chatting");

        return (
            <View style={{ flex: 1 }}>
                {/* ─── Hero: portrait pinned right, info over the dark left ─── */}
                <View style={[styles.hero, { height: 330 + insets.top }]}>
                    {/* The portrait's left edge is feathered to transparent
                        (yuuki's ShaderMask) so it dissolves into the dark page
                        instead of ending on a hard vertical cut against it. */}
                    <MaskedView
                        style={styles.heroPortrait}
                        maskElement={
                            <LinearGradient
                                colors={["transparent", "#000"]}
                                locations={[0, 0.12]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={StyleSheet.absoluteFill}
                            />
                        }
                    >
                        <Image
                            source={{ uri: heroImg }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            contentPosition="top"
                            transition={220}
                        />
                        {/* Her demo clip takes over once it has buffered; until
                            then the still above is what shows, so the hero is
                            never blank while the video loads. */}
                        {!!heroVideo && (
                            <Video
                                key={heroVideo}
                                source={{ uri: heroVideo }}
                                style={[StyleSheet.absoluteFill, !videoReady && { opacity: 0 }]}
                                resizeMode={ResizeMode.COVER}
                                shouldPlay
                                isLooping
                                isMuted
                                onReadyForDisplay={() => setVideoReady(true)}
                                onError={() => setVideoReady(false)}
                            />
                        )}
                    </MaskedView>

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

                    <View style={[styles.heroInfo, { top: 18 + insets.top }]}>
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
                                    <Text style={styles.statValue}>{t("char.age_years", { n: focusedChar.data.old })}</Text>
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
                    numColumns={GRID_COLUMNS}
                    columnWrapperStyle={{ gap: GRID_GAP, justifyContent: "flex-start" }}
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
                                name={heroLock === "pro" ? "lock-closed"
                                    : heroLock === "ruby" ? "diamond"
                                    : heroLock === "ad" ? "play"
                                    : "chatbubble-ellipses"}
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

    // A full page, not a sheet: choosing who you spend your time with is the
    // app's biggest decision, and a 95% sheet still framed it as a popover.
    const pageArt = focusedChar?.avatar ?? focusedChar?.thumbnail_url ?? null;

    return (
        <Modal
            visible={isOpened}
            animationType="slide"
            presentationStyle="fullScreen"
            statusBarTranslucent
            onRequestClose={() => {
                onIsOpenedChange(false);
            }}
        >
            <View style={styles.page}>
                {/* Her art, blurred, as the page's own backdrop. */}
                <LinearGradient colors={["#1A0A2E", BG]} style={StyleSheet.absoluteFill} />
                {!!pageArt && (
                    <Image
                        source={{ uri: pageArt }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        contentPosition="top center"
                        blurRadius={45}
                        transition={300}
                    />
                )}
                <LinearGradient
                    colors={["rgba(15,10,30,0.55)", "rgba(15,10,30,0.86)", "rgba(15,10,30,0.98)"]}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                />

                <Pressable
                    onPress={() => onIsOpenedChange(false)}
                    hitSlop={10}
                    style={[styles.pageClose, { top: insets.top + 8 }]}
                >
                    <Ionicons name="close" size={20} color="#fff" />
                </Pressable>

                {renderContent()}
            <AdGateDialog
                visible={gateFor !== null}
                body={t("ads.gate_body_char", { name: gateFor?.name ?? "" })}
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
            </View>
        </Modal>
    );
});

export default CharacterSheet;

const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: BG },
    pageClose: {
        position: "absolute",
        right: 16,
        zIndex: 10,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "rgba(0,0,0,0.4)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
        alignItems: "center",
        justifyContent: "center",
    },
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
    gridContent: { paddingHorizontal: GRID_PADDING, paddingBottom: 16, gap: GRID_GAP },
    tile: {
        width: TILE_W, aspectRatio: 0.74, borderRadius: 14, overflow: "hidden",
        backgroundColor: "#1B1430", borderWidth: 2, borderColor: "transparent",
    },
    tileFocused: { borderColor: ACCENT },
    tileScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "55%" },
    tileVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
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
    tileAdBadge: { position: "absolute", top: 6, right: 6 },
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
    // Skeleton pieces, sized from the same constants the real page uses so the
    // two line up exactly.
    skHeroPortrait: {
        position: "absolute", top: 0, bottom: 0, right: 0, width: "70%",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    skBar: { borderRadius: 7, backgroundColor: "rgba(255,255,255,0.10)" },
    skGrid: {
        flexDirection: "row", flexWrap: "wrap",
        paddingHorizontal: GRID_PADDING, paddingTop: 12,
        gap: GRID_GAP,
    },
    skTile: {
        width: TILE_W, aspectRatio: 0.74, borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    skCta: { height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
});
