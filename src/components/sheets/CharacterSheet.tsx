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
import { useVideoPlayer, VideoView } from "expo-video";
import MaskedView from "@react-native-masked-view/masked-view";
import { IconWoman } from "@tabler/icons-react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { useRewardedAd } from "../../hooks/useRewardedAd";
import { AdGateDialog } from "../AdGateDialog";
import { AdUnlockBadge } from "../ads/AdUnlockBadge";
import { consumeNoFillGrant, isUnlocked, loadUnlocks, markOwned, markUnlocked, requiresAd, subscribeUnlocks } from "../../services/unlockService";
import { AdUnits } from "../../config/ads";
import { supabase } from "../../config/supabase";
import { localizeCharacters } from "../../cache/charactersCache";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetRef } from "../common/BottomSheet";
import { LinearGradient } from 'expo-linear-gradient';
import { isLive2dRow } from "../../live2d/types";
import { SHEET } from "../../theme/sheet";
import { CharacterPreview } from "./CharacterPreview";
import { purchaseItem } from "../../services/checkinService";
import { UnlockDialog } from "../shop/UnlockDialog";
import { refreshRuby, setRuby, useRuby } from "../../services/rubyStore";
import LockIcon from "../icons/LockIcon";
import RubyIcon from "../icons/RubyIcon";
import { track } from "../../services/trackEvents";

const BG = "#0F0A1E";
const ACCENT = "#FF4D8D";

/**
 * Fixed tile width instead of `flex: 1`: with flex, a last row holding one or
 * two characters stretched them across the whole sheet.
 */
const GRID_COLUMNS = 3;
const GRID_PADDING = 16;
/** No HOT badge below this many outfits, however thin the catalogue is. */
const HOT_MIN_COSTUMES = 4;
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
    /** How many outfits she has — the only real number in the stats row. */
    total_costumes?: number | null;
    /** For the preview: her VRM, and the scene she stands in. */
    base_model_url?: string | null;
    backgrounds?: { image?: string | null } | null;
    data?: {
        /** Flagged teaser: shown with a SOON badge, never selectable. */
        coming_soon?: boolean;
        model_type?: string;
        live2d_listed?: boolean;
        height_cm?: number;
        rounds?: { r1: number; r2: number; r3: number };
        old?: number;
        occupation?: string;
        characteristics?: string;
        hobbies?: string[];
        dislikes?: string[];
        bio?: string;
        bio_vi?: string;
        birthday?: string;
        live2d?: unknown;
    };
}

interface CharacterSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    currentCharacterId: string | null;
    onSelect: (character: Character) => void;
    isPro?: boolean;
    onOpenSubscription?: () => void;
    /** Where "get more ruby" goes. The paywall is not the answer to that. */
    onOpenQuests?: () => void;
    userId?: string;
}

export type CharacterSheetRef = BottomSheetRef;

/**
 * Social proof on the hero card, the way yuuki does it.
 *
 * Chats and hearts are invented, but derived from the character id, so a given
 * character always shows the same numbers — on every screen, every launch and
 * every device. A random number here would flicker on each render and read as
 * broken. The outfit count is real: `total_costumes` is maintained in the DB.
 */
function idHash(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
    return h;
}

function compactCount(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return Math.round(n / 1000) + "K";
    return String(n);
}

const CharacterSheet = forwardRef<CharacterSheetRef, CharacterSheetProps>(({
    isOpened,
    onIsOpenedChange,
    currentCharacterId,
    onSelect,
    isPro = false,
    onOpenSubscription,
    onOpenQuests,
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
    /**
     * Character awaiting a PRO/ruby decision. Was three `Alert.alert` chains,
     * which on Android is a grey system box with stacked buttons — nothing like
     * the unlock prompt every other picker shows. `UnlockDialog` is that prompt.
     */
    const [buyFor, setBuyFor] = useState<{ char: Character; kind: "pro" | "pro_or_ruby" | "ruby" } | null>(null);
    const [buyBusy, setBuyBusy] = useState(false);
    const rubyBalance = useRuby();
    /** Bumped whenever something unlocks, so the badges disappear immediately. */
    const [unlockTick, setUnlockTick] = useState(0);
    useEffect(() => {
        loadUnlocks(userId);
        return subscribeUnlocks(() => setUnlockTick((n) => n + 1));
        // `userId` arrives after the first render, so an empty dep list loaded
        // the anonymous set and never replaced it with the signed-in one.
    }, [userId]);
    /** Tile being previewed in the hero — not yet the active character. */
    const [focusedId, setFocusedId] = useState<string | null>(null);
    /** True once her demo clip has a frame to show; gates the crossfade. */
    const [videoReady, setVideoReady] = useState(false);
    /** The full-screen look at her: the real model and everything about her. */
    const [previewOpen, setPreviewOpen] = useState(false);
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
                .select("id, name, thumbnail_url, avatar, description, tier, data, available, price_ruby, video_url, small_thumb_url, small_avatar, total_costumes, base_model_url, backgrounds!background_default_id(image)")
                .eq("is_public", true)
                // Available characters, plus the ones deliberately flagged as
                // coming soon. Everything else unavailable stays hidden — that
                // was twenty-two retired tiles that looked pickable and did
                // nothing when tapped.
                // Live2D characters are `available = false` so older builds,
                // which cannot render them, never list them; this one lists
                // them by their own flag.
                .or("available.eq.true,data->>coming_soon.eq.true,data->>live2d_listed.eq.true")
                .order("order", { ascending: true });
            if (error) throw error;
            if (data) {
                const rows = (data as Character[]).map((c) =>
                    isLive2dRow(c) ? { ...c, available: c.data?.live2d_listed === true } : c
                );
                setCharacters(await localizeCharacters(rows));
            }

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

    /** Confirmed in `UnlockDialog`; takes the ruby and switches to her. */
    const doBuy = useCallback(async () => {
        const char = buyFor?.char;
        if (!char || !userId || buyBusy) return;
        setBuyBusy(true);
        try {
            const res = await purchaseItem(userId, "character", char.id);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setTempUnlocked((prev) => new Set(prev).add(char.id));
                // So she stays unlocked after this sheet unmounts, and so the
                // next `loadUnlocks` re-reads the server rather than trusting a
                // cache filled before the purchase.
                markOwned("character", char.id);
                refreshRuby();
                setBuyFor(null);
                applySelection(char);
                return;
            }
            if (res.error === "insufficient") {
                // No alert: correcting the balance is enough, because the dialog
                // turns its buy button into "get more ruby" as soon as the
                // balance is below the price. The old code reported "you need N
                // but have M" in hardcoded English to a ten-language app.
                setRuby((res.have as number) ?? 0);
                track.heartsInsufficient("character", char.price_ruby ?? 0, (res.have as number) ?? 0);
                return;
            }
            if (res.error === "owned") {
                setBuyFor(null);
                applySelection(char);
                return;
            }
            Alert.alert(t("common.purchase_failed"), t("common.try_again"));
        } finally {
            setBuyBusy(false);
        }
    }, [buyFor, userId, buyBusy, applySelection, t]);

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
     * A PRO character that also carries a ruby price is `pro_or_ruby`: both
     * ways in are real, and the tile says so. Showing a bare "PRO" was how
     * people ended up subscribing and only then finding out it still cost ruby.
     */
    const lockOf = useCallback(
        (c: Character): "free" | "ad" | "pro" | "pro_or_ruby" | "ruby" => {
            if (c.id === currentCharacterId) return "free";
            // Owned is owned, by whatever route. `ownedIds` is `user_assets`
            // (bought) and `tempUnlocked` is this session's purchases, but an
            // ad unlock only ever lands in `unlockService` — so a character
            // unlocked by watching an ad was shown locked again, and a purchase
            // came back locked on the next launch until `user_assets` was
            // re-read. `lockStateOf` in `useItemUnlock` asks this first for the
            // same reason; this sheet never did.
            if (isUnlocked("character", c.id)) return "free";
            if (ownedIds.has(c.id) || tempUnlocked.has(c.id)) return "free";
            const price = c.price_ruby ?? 0;
            if (c.tier === "pro") {
                if (!isPro) return price > 0 ? "pro_or_ruby" : "pro";
                return price > 0 ? "ruby" : "free";
            }
            if (price > 0) return "ruby";
            return isPro ? "free" : "ad";
        },
        // `unlockTick` is in here on purpose: the unlock cache is module state,
        // so nothing else tells this callback to rebuild when an ad unlock lands.
        [isPro, ownedIds, tempUnlocked, currentCharacterId, unlockTick]
    );

    /** Blur/veil the art for anything that cannot be used right now. */
    const isLockedFor = useCallback(
        (c: Character) => {
            const l = lockOf(c);
            return l === "pro" || l === "pro_or_ruby" || l === "ruby";
        },
        [lockOf]
    );

    const handleSelect = useCallback(
        (char: Character) => {
            if (char.available === false) return;
            const isOwned = ownedIds.has(char.id) || tempUnlocked.has(char.id);
            // Only PRO-tier characters need the paywall; free ones fall through
            // to the rewarded gate below.
            const lock = lockOf(char);

            // PRO, ruby, or both: one dialog handles all three, the same one the
            // costume/background/dance pickers use. It decides what to offer
            // from `kind`, so there is no branching left here — and it reads the
            // live ruby balance, which the old alerts only learned about by
            // failing the purchase and reporting "you need N but have M".
            if (lock === "pro" || lock === "pro_or_ruby" || lock === "ruby") {
                const price = char.price_ruby ?? 0;
                Haptics.notificationAsync(
                    lock === "ruby"
                        ? Haptics.NotificationFeedbackType.Success
                        : Haptics.NotificationFeedbackType.Warning
                );
                track.unlockSelect("character", char.id, price, lock === "ruby" ? "hearts" : "pro");
                refreshRuby();
                setBuyFor({ char, kind: lock });
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

    // Locked characters stay on the blurred still — a clip cannot be blurred
    // the way the image is, so playing it would leak the art.
    //
    // Resolved up here, not in `renderContent`, because expo-video builds its
    // player with a hook and that function sits behind early returns.
    const heroVideo =
        focusedChar && !isLockedFor(focusedChar)
            ? focusedChar.video_url || null
            : null;
    const heroPlayer = useVideoPlayer(heroVideo, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });

    const focus = useCallback((c: Character) => {
        Haptics.selectionAsync();
        setFocusedId(c.id);
    }, []);

    /**
     * What the unlock dialog keeps showing while it fades out.
     *
     * `visible` goes false one render before the modal finishes animating, so
     * reading `buyFor?.kind` directly turns a ruby dialog into the PRO upgrade
     * dialog for the length of the fade — cancelling a purchase flashes a
     * paywall. Holding the last value keeps the closing frame identical to the
     * open one. Same fix as `useItemUnlock`.
     */
    const lastBuy = useRef<typeof buyFor>(null);
    if (buyFor) lastBuy.current = buyFor;
    const shownBuy = buyFor ?? lastBuy.current;

    /**
     * "HOT" = she has noticeably more outfits than the rest, so the badge stays
     * meaningful as the catalogue grows instead of being a fixed threshold that
     * one import turns into every tile. The cut is the 75th percentile, floored
     * at HOT_MIN so a thin catalogue doesn't badge someone with two outfits.
     */
    const hotFrom = React.useMemo(() => {
        const counts = characters
            .map((c) => c.total_costumes ?? 0)
            .filter((n) => n > 0)
            .sort((a, b) => a - b);
        if (counts.length < 4) return Infinity;
        const p75 = counts[Math.floor(counts.length * 0.75)];
        return Math.max(HOT_MIN_COSTUMES, p75);
    }, [characters]);

    const isHot = useCallback(
        (c: Character) => c.available !== false && !isLive2dRow(c) && (c.total_costumes ?? 0) >= hotFrom,
        [hotFrom]
    );
    /**
     * HOT girls first, SOON (not available yet) last; each group keeps the
     * catalogue's own order. A coming-soon tile cannot be picked, so it should
     * never sit between the ones that can.
     */
    const gridCharacters = React.useMemo(() => {
        const soon = (c: Character) => c.available === false;
        return [
            ...characters.filter((c) => !soon(c) && isHot(c)),
            ...characters.filter((c) => !soon(c) && !isHot(c)),
            ...characters.filter(soon),
        ];
    }, [characters, isHot]);

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
            const lock = lockOf(item);
            const locked = isLockedFor(item);
            const tilePrice = item.price_ruby ?? 0;

            return (
                <Pressable
                    onPress={() => focus(item)}
                    disabled={!isAvailable}
                    style={({ pressed }) => [
                        styles.tile,
                        isLive2dRow(item) && styles.tileLive2d,
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

                    {/* What it costs, not just that it costs something: PRO, a
                        ruby price, or — when the character is behind both — the
                        two side by side. */}
                    {locked && isAvailable && (
                        <View style={styles.tileBadges}>
                            {(lock === "pro" || lock === "pro_or_ruby") && (
                                <View style={styles.tileProBadge}>
                                    <Text style={styles.tileProBadgeText}>PRO</Text>
                                </View>
                            )}
                            {(lock === "ruby" || lock === "pro_or_ruby") && tilePrice > 0 && (
                                <View style={styles.tileRubyBadge}>
                                    <RubyIcon size={10} color="#fff" />
                                    <Text style={styles.tileRubyBadgeText}>{tilePrice}</Text>
                                </View>
                            )}
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

                    {/* Sits above the name rather than in a corner: both top
                        corners are taken (checkmark/SOON left, PRO/ruby/ad
                        right) and HOT stacking onto a price is unreadable. */}
                    {isAvailable && isLive2dRow(item) ? (
                        <LinearGradient
                            colors={["#FF6FA3", "#A56BFF"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.tileHot}
                        >
                            <Text style={styles.tileHotText}>✦ LIVE2D</Text>
                        </LinearGradient>
                    ) : isHot(item) && (
                        <View style={styles.tileHot}>
                            <Ionicons name="flame" size={9} color="#fff" />
                            <Text style={styles.tileHotText}>HOT</Text>
                        </View>
                    )}

                    <Text style={styles.tileName} numberOfLines={1}>
                        {item.name}
                    </Text>
                </Pressable>
            );
        },
        [focusedId, currentCharacterId, focus, isLockedFor, isHot, isPro, unlockTick]
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
        const heroLock = lockOf(focusedChar);
        const ctaLabel =
            // pro_or_ruby used to fall through to "Start chatting" on a
            // character the button could not open without the unlock dialog.
            heroLock === "pro" || heroLock === "pro_or_ruby" ? t("char.unlock_pro")
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
                            <VideoView
                                player={heroPlayer}
                                style={[StyleSheet.absoluteFill, !videoReady && { opacity: 0 }]}
                                contentFit="cover"
                                nativeControls={false}
                                onFirstFrameRender={() => setVideoReady(true)}
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

                    {/* The real model, not this picture of her. Tapping the
                        portrait opens it too. */}
                    <Pressable
                        onPress={() => setPreviewOpen(true)}
                        style={StyleSheet.absoluteFill}
                        accessibilityRole="button"
                        accessibilityLabel={t("char.preview")}
                    />
                    <Pressable
                        onPress={() => setPreviewOpen(true)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.previewPill, pressed && { opacity: 0.85 }]}
                    >
                        <LinearGradient
                            colors={SHEET.modeGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.previewPillBg}
                        >
                            <Ionicons name="play" size={13} color="#fff" />
                            <Text style={styles.previewPillText}>
                                {t("char.preview")} · {isLive2dRow(focusedChar) ? "LIVE2D" : "3D"}
                            </Text>
                        </LinearGradient>
                    </Pressable>

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
                            {isLive2dRow(focusedChar) && (
                                <LinearGradient
                                    colors={["#FF6FA3", "#A56BFF"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.proPill}
                                >
                                    <Text style={styles.proPillText}>LIVE2D</Text>
                                </LinearGradient>
                            )}
                            {(heroLock === "pro" || heroLock === "pro_or_ruby") && (
                                <View style={styles.proPill}>
                                    <Text style={styles.proPillText}>PRO</Text>
                                </View>
                            )}
                            {(heroLock === "ruby" || heroLock === "pro_or_ruby") &&
                                (focusedChar.price_ruby ?? 0) > 0 && (
                                    <View style={styles.heroRubyPill}>
                                        <RubyIcon size={12} color="#fff" />
                                        <Text style={styles.heroRubyPillText}>
                                            {focusedChar.price_ruby}
                                        </Text>
                                    </View>
                                )}
                        </View>

                        <View style={styles.heroChips}>
                            {isLive2dRow(focusedChar) && (
                                <View style={styles.statChip}>
                                    <Ionicons name="hand-left-outline" size={12} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.statValue}>{t("char.live2d_chip")}</Text>
                                </View>
                            )}
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

                        {(() => {
                            const h = idHash(focusedChar.id);
                            const chats = 12000 + (h % 320) * 1000;
                            const hearts = 800 + ((h >> 7) % 240) * 100;
                            const outfits = focusedChar.total_costumes ?? 0;
                            return (
                                <View style={styles.heroStats}>
                                    <View style={styles.heroStat}>
                                        <Ionicons name="chatbubble" size={12} color="rgba(255,255,255,0.75)" />
                                        <Text style={styles.heroStatValue}>{compactCount(chats)}</Text>
                                        <Text style={styles.heroStatLabel}>{t("char.stat_chats")}</Text>
                                    </View>
                                    <View style={styles.heroStat}>
                                        <Ionicons name="heart" size={12} color="#FF6FA5" />
                                        <Text style={styles.heroStatValue}>{compactCount(hearts)}</Text>
                                        <Text style={styles.heroStatLabel}>{t("char.stat_hearts")}</Text>
                                    </View>
                                    {outfits > 0 && (
                                        <View style={styles.heroStat}>
                                            <Ionicons name="shirt" size={12} color="rgba(255,255,255,0.75)" />
                                            <Text style={styles.heroStatValue}>{outfits}</Text>
                                            <Text style={styles.heroStatLabel}>{t("char.stat_outfits")}</Text>
                                        </View>
                                    )}
                                </View>
                            );
                        })()}

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
                    data={gridCharacters}
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

                <CharacterPreview
                    visible={previewOpen}
                    character={focusedChar}
                    ctaLabel={ctaLabel}
                    ctaIcon={heroLock === "pro" || heroLock === "pro_or_ruby" ? "lock-closed"
                        : heroLock === "ruby" ? "diamond"
                        : heroLock === "ad" ? "play"
                        : "chatbubble-ellipses"}
                    locked={heroLocked}
                    showPro={heroLock === "pro" || heroLock === "pro_or_ruby"}
                    rubyPrice={heroLock === "ruby" || heroLock === "pro_or_ruby" ? focusedChar.price_ruby ?? 0 : 0}
                    onClose={() => setPreviewOpen(false)}
                    onPrimary={() => {
                        setPreviewOpen(false);
                        // The unlock prompts are modals too; iOS will not
                        // present one while this one is still animating out.
                        setTimeout(() => handleSelect(focusedChar), 350);
                    }}
                />
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
            <UnlockDialog
                visible={buyFor !== null}
                kind={shownBuy?.kind ?? "pro"}
                itemName={shownBuy?.char.name ?? ""}
                image={shownBuy?.char.thumbnail_url ?? shownBuy?.char.avatar ?? null}
                price={shownBuy?.char.price_ruby ?? 0}
                balance={rubyBalance}
                busy={buyBusy}
                onBuy={doBuy}
                onUpgrade={() => { setBuyFor(null); goPro(); }}
                onGetRuby={() => {
                    setBuyFor(null);
                    onIsOpenedChange(false);
                    setTimeout(() => onOpenQuests?.(), 300);
                }}
                onCancel={() => { if (!buyBusy) setBuyFor(null); }}
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
    heroStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    heroStat: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.12)",
    },
    heroStatValue: { color: "#fff", fontSize: 12, fontWeight: "800" },
    heroStatLabel: { color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600" },
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
    tileHot: {
        position: "absolute", left: 7, bottom: 24,
        flexDirection: "row", alignItems: "center", gap: 2,
        paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6,
        backgroundColor: "rgba(255,92,46,0.95)",
    },
    tileHotText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },
    tileLive2d: { borderWidth: 1.5, borderColor: "rgba(255,111,163,0.85)" },
    previewPill: { position: "absolute", right: 16, bottom: 26, borderRadius: 16, overflow: "hidden" },
    previewPillBg: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, height: 32 },
    previewPillText: { color: "#fff", fontSize: 12.5, fontWeight: "800", letterSpacing: 0.3 },
    tileLock: {
        position: "absolute", top: 6, right: 6,
        width: 26, height: 26, borderRadius: 13,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    tileAdBadge: { position: "absolute", top: 6, right: 6 },
    tileBadges: {
        position: "absolute", top: 6, right: 6,
        alignItems: "flex-end", gap: 4,
    },
    tileProBadge: {
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7,
        backgroundColor: "rgba(255,176,32,0.92)",
    },
    tileProBadgeText: { fontSize: 9, fontWeight: "900", color: "#2A1A00" },
    // Hồng như giá ruby trong shop (`ItemTile.gateRuby`) — trước đây là kính
    // đen nên giá ruby trông xám, không nhận ra là cùng một loại tiền.
    tileRubyBadge: {
        flexDirection: "row", alignItems: "center", gap: 3,
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7,
        backgroundColor: "rgba(214,51,108,0.92)",
    },
    tileRubyBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff" },
    heroRubyPill: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
        marginLeft: 8, backgroundColor: "rgba(214,51,108,0.92)",
    },
    heroRubyPillText: { fontSize: 11, fontWeight: "800", color: "#fff" },
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
