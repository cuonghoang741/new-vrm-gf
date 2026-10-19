import { useTranslation } from "react-i18next";
import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Alert,
    StatusBar,
    Linking,
    Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PurchasesPackage } from "react-native-purchases";
import { analyticsService } from "../../services/AnalyticsService";
import { openBrowserSafe } from "../../utils/openBrowserSafe";
import { AdsManager } from "../../services/AdsManager";
import { IconX, IconCube3dSphere, IconUsers, IconSparkles, IconAdOff, IconMessageHeart, IconBolt, IconGift, IconTrendingUp, IconHandFinger, IconCheck, IconMusic } from "@tabler/icons-react-native";
import { useSubscription } from "../../contexts/SubscriptionContext";
import VRMViewer, { VRMViewerHandle } from "../VRMViewer";
import { getCharacters } from "../../cache/charactersCache";
import { useVrmPreviewLoader } from "../../hooks/useVrmPreviewLoader";
import { supabase } from "../../config/supabase";
import { styles, HERO_H } from "./SubscriptionSheet.styles";
import { track } from "../../services/trackEvents";

import { isFlashPackage } from "../flash/ids";
import CrownIcon from "../icons/CrownIcon";

/**
 * When the hidden paywall preview is created. Just after
 * usePrefetchPaywallModel (15 s) has started downloading the model, so the
 * warm load waits for that download and reads it from disk rather than
 * streaming a second copy; and well clear of the main scene's own start-up.
 */
const WARM_DELAY_MS = 16_000;

const FEATURES = [
    // The two at the top are the ones with a number on them, and numbers are
    // what a subscription is judged by. 500 a week is the concrete one — it
    // says what PRO hands over before it says what it unlocks.
    { icon: IconGift, text: "sub.b7", color: "#FF6FA5", highlight: true },
    { icon: IconBolt, text: "sub.b6_x2", color: "#F2C14E", highlight: true },
    { icon: IconTrendingUp, text: "sub.b9_bond_x2", color: "#F2C14E", highlight: true },
    // Lv5 is the top of the bond ladder and only PRO reaches it.
    { icon: CrownIcon, text: "sub.b11_lv5", color: "#F2C14E" },
    // New, and the reason the three PRO Live2D girls are locked.
    { icon: IconSparkles, text: "sub.b10_live2d", color: "#FF9EC4" },
    { icon: IconAdOff, text: "sub.b1", color: "#FF6FA5" },
    { icon: IconMessageHeart, text: "sub.b2", color: "#FF8FB8" },
    // Free accounts get three touches a day; the prompt that follows the
    // third opens this sheet, so it has to say what PRO changes about it.
    { icon: IconHandFinger, text: "sub.b8_touch", color: "#FF8FB8" },
    { icon: IconCube3dSphere, text: "sub.b3", color: "#FF9EC4" },
    { icon: IconUsers, text: "sub.b4", color: "#7DD3A8" },
    { icon: IconSparkles, text: "sub.b5", color: "#FFC48A" },
];

interface Props {
    isOpened: boolean;
    onClose: () => void;
    onPurchaseSuccess?: () => void;
    currentModelUrl?: string | null;
    currentBackgroundUrl?: string | null;
    currentCharacterId?: string | null;
}

/**
 * The paywall, over a live 3D preview of the girl.
 *
 * Every model it shows is read from the disk cache when it is there (see
 * useVrmPreviewLoader): the first one is prefetched before the paywall is ever
 * opened, and each one shown warms its carousel neighbours. Nothing in RN
 * blurs over the live canvas — a real-time BlurView on top of WebGL was the
 * stutter — and the canvas stops drawing whenever the sheet is closed.
 */
export default function SubscriptionSheet({ isOpened, onClose, onPurchaseSuccess, currentModelUrl, currentBackgroundUrl, currentCharacterId }: Props) {
    const lastAnimRef = useRef<string>("");
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const {
        isPro,
        isLoading: contextLoading,
        packages,
        customerInfo,
        purchasePackage,
        restorePurchases,
        enableTestPro,
    } = useSubscription();

    // Hidden: tap the "TRUEMATE PRO" badge 7x to unlock PRO for on-device testing.
    const proTapRef = useRef(0);
    const proTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleSecretProTap = useCallback(() => {
        proTapRef.current += 1;
        if (proTapTimer.current) clearTimeout(proTapTimer.current);
        proTapTimer.current = setTimeout(() => { proTapRef.current = 0; }, 1500);
        if (proTapRef.current >= 7) {
            proTapRef.current = 0;
            enableTestPro();
            Alert.alert("🔓 Test PRO enabled", t("sub.testing_unlocked"));
            onClose();
        }
    }, [enableTestPro, onClose]);

    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);

    /** Plan tap — separates "saw the paywall" from "picked a plan". */
    const handleSelectPlan = useCallback(
        (pkg: PurchasesPackage | null | undefined, planName: string) => {
            if (!pkg) return;
            setSelectedPackage(pkg);
            track.proPlanSelect(pkg.packageType?.toLowerCase() ?? pkg.product.identifier);
            analyticsService.logSubscriptionSelectPlan(
                pkg.product.identifier,
                planName
            );
        },
        []
    );
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeProductId, setActiveProductId] = useState<string | null>(null);

    const vrmRef = useRef<VRMViewerHandle>(null);
    const [vrmReady, setVrmReady] = useState(false);
    /**
     * Pre-warm: for free users the preview WebView is created WARM_DELAY_MS
     * after launch, hidden and with rendering paused, and loads the model the
     * paywall opens on. Opening the paywall then only un-pauses it — the
     * character is already on screen instead of booting three.js and parsing
     * a 17 MB model in front of the user. It stays mounted (paused) after a
     * close so the next open is instant too.
     */
    const [warm, setWarm] = useState(false);
    useEffect(() => {
        if (isPro) {
            setWarm(false);
            return;
        }
        const t = setTimeout(() => setWarm(true), WARM_DELAY_MS);
        return () => clearTimeout(t);
    }, [isPro]);
    const viewerMounted = isOpened || warm;
    const preview = useVrmPreviewLoader(vrmRef, viewerMounted, vrmReady);
    /** The first model after opening skips the carousel debounce. */
    const firstLoadRef = useRef(true);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: isOpened ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isOpened]);

    // Paywall impression — the denominator for every subscription conversion
    // rate. Only counts a real open, not the initial mount while closed.
    useEffect(() => {
        if (isOpened) {
            analyticsService.logSubscriptionView();
            track.proPaywallView("home");
        }
    }, [isOpened]);

    useEffect(() => {
        if (!viewerMounted) {
            // The preview WebView is gone; reset readiness so it re-initializes
            // (and reloads the model) when it is mounted again.
            setVrmReady(false);
            firstLoadRef.current = true;
        }
    }, [viewerMounted]);

    // Draw only while visible. A paused viewer keeps its model in memory but
    // costs no GPU, so a pre-warmed paywall does not slow the main scene.
    useEffect(() => {
        if (vrmReady) vrmRef.current?.setRenderPaused(!isOpened);
    }, [isOpened, vrmReady]);

    // Test controls state
    const [characters, setCharacters] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    // Sync selectedIndex whenever characters or currentCharacterId changes
    useEffect(() => {
        if (characters.length > 0 && currentCharacterId) {
            const idx = characters.findIndex(c => c.id === currentCharacterId);
            if (idx >= 0 && idx !== selectedIndex) {
                setSelectedIndex(idx);
            }
        }
    }, [characters, currentCharacterId]);

    // Fetch characters for test carousel - once on mount
    useEffect(() => {
        const loadCharacters = async () => {
            try {
                const chars = await getCharacters();
                if (chars && chars.length > 0) {
                    setCharacters(chars);
                }
            } catch (e) {
                console.error("Failed to fetch characters:", e);
            }
        };
        loadCharacters();
    }, []);

    const selectedChar = characters[selectedIndex];

    const [costumes, setCostumes] = useState<any[]>([]);
    const [selectedCostume, setSelectedCostume] = useState<any | null>(null);
    const [isCostumesLoading, setIsCostumesLoading] = useState(false);
    const [shouldBlurPreview, setShouldBlurPreview] = useState(false);
    const shimmerOpacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        if (isCostumesLoading) {
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
    }, [isCostumesLoading]);

    // Fetch costumes when selected character changes
    useEffect(() => {
        if (!selectedChar) return;
        setCostumes([]);
        setSelectedCostume(null);
        setIsCostumesLoading(true);

        const loadCostumes = async () => {
            const { data } = await supabase
                .from("character_costumes")
                .select("id, costume_name, thumbnail, model_url")
                .eq("character_id", selectedChar.id)
                .eq("available", true)
                .order("created_at", { ascending: true });

            if (data && data.length > 0) {
                setCostumes(data);
            }
            setIsCostumesLoading(false);
        };
        loadCostumes();
    }, [selectedChar?.id]);

    // Keep blur state in sync with selectedCostume, but don't turn it off immediately on null
    // to prevent revealing the previous character when switching.
    useEffect(() => {
        if (selectedCostume) {
            setShouldBlurPreview(true);
        }
    }, [selectedCostume]);

    const loadActiveModel = useCallback(() => {
        if (!vrmRef.current || !vrmReady) return;

        const modelUrl = selectedCostume?.model_url || selectedChar?.base_model_url || currentModelUrl;
        if (modelUrl) {
            console.log("[SubscriptionSheet] Loading model:", modelUrl);
            preview.showModel(modelUrl);
        } else if (!currentModelUrl) {
            vrmRef.current.loadModelByName("001/001_vrm/001_01.vrm");
        }

        const bgImage = selectedChar?.backgrounds?.image || currentBackgroundUrl;
        if (bgImage) {
            vrmRef.current.setBackgroundImage(bgImage);
        }
    }, [selectedChar, selectedCostume, vrmReady, currentModelUrl, currentBackgroundUrl, preview.showModel]);

    useEffect(() => {
        if (!vrmReady) return;
        // Nothing to debounce on open — the user has not swiped yet.
        if (firstLoadRef.current) {
            firstLoadRef.current = false;
            loadActiveModel();
            return;
        }
        // Debounce rapid carousel switching so only the final selection loads.
        const t = setTimeout(() => loadActiveModel(), 250);
        return () => clearTimeout(t);
    }, [vrmReady, loadActiveModel]);

    const goToPrev = () => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) => (prev === 0 ? characters.length - 1 : prev - 1));
    };

    const goToNext = () => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) => (prev === characters.length - 1 ? 0 : prev + 1));
    };

    const handleDanceTest = useCallback(() => {
        // Add a slight delay to ensure the VRM is fully visible and the internal WebGL loader
        // has finished its 500ms idle animation fallback inside index.html.
        setTimeout(() => {
            // Standing poses only. "Making a snow angel" lies the model on the
            // floor, and the paywall camera then frames her shins.
            const pool = [
                "Dance - Give Your Soul.fbx",
                "Feminine - Exaggerated 2.fbx",
                "Heart-Flutter Pose.fbx",
                "Sly - Finger gun gesture.fbx"
            ];

            let next = pool[Math.floor(Math.random() * pool.length)];
            lastAnimRef.current = next;

            vrmRef.current?.loadAnimationByName(next);
        }, 600);
    }, []);

    const handleModelLoaded = useCallback(() => {
        handleDanceTest();
        // Warm the carousel neighbours so the next swipe opens from disk.
        const n = characters.length;
        preview.onShown(n > 1 ? [
            characters[(selectedIndex + 1) % n]?.base_model_url,
            characters[(selectedIndex - 1 + n) % n]?.base_model_url,
        ] : []);
        // If no costume is selected (e.g. after a character change), remove the blur
        if (!selectedCostume) {
            setShouldBlurPreview(false);
        }
    }, [selectedCostume, handleDanceTest, characters, selectedIndex, preview.onShown]);

    // Real blur on the 3D canvas while previewing a costume (tease the locked look).
    useEffect(() => {
        if (vrmReady) vrmRef.current?.setPreviewBlur(shouldBlurPreview);
    }, [shouldBlurPreview, vrmReady]);

    // Find plans. Weekly and monthly only — yearly is gone: a year of an AI
    // companion is a long thing to ask someone to commit to on the day they
    // installed it, and the ones who would have taken it will take monthly.
    // The flash-sale package lives in the same offering, and its key contains
    // "week" — without dropping it first the weekly slot matches the DISCOUNTED
    // package (it sorts first) and the standard paywall shows a sale price to
    // everyone, permanently.
    const sellable = packages.filter((p) => !isFlashPackage(p));

    const weeklyPackage = sellable.find(
        (p) =>
            p.packageType === "WEEKLY" ||
            p.identifier.toLowerCase().includes("week") ||
            p.product.identifier.toLowerCase().includes("week")
    );
    const monthlyPackage = sellable.find(
        (p) =>
            p.packageType === "MONTHLY" ||
            p.identifier.toLowerCase().includes("month") ||
            p.product.identifier.toLowerCase().includes("month")
    );

    /** A month against the ~4.35 weeks it replaces. */
    const WEEKS_PER_MONTH = 4.345;

    const discountPercentage = useMemo(() => {
        if (!weeklyPackage || !monthlyPackage) return null;
        const weekly = weeklyPackage.product.price;
        const monthly = monthlyPackage.product.price;
        if (weekly <= 0) return null;
        const pct = Math.round(((weekly * WEEKS_PER_MONTH - monthly) / (weekly * WEEKS_PER_MONTH)) * 100);
        // The label around it already says "save", so no "OFF" suffix here.
        return pct > 0 ? `${pct}%` : null;
    }, [weeklyPackage, monthlyPackage]);

    // Default to monthly: it is the better value of the two, and the badge on
    // it says so.
    useEffect(() => {
        if (packages.length > 0 && !selectedPackage) {
            setSelectedPackage(monthlyPackage || weeklyPackage || sellable[0]);
        }
    }, [packages, selectedPackage, weeklyPackage, monthlyPackage]);

    // Active product - find which product the user is currently subscribed to
    useEffect(() => {
        if (!customerInfo) return;

        // 1. Check all active entitlements for a productIdentifier
        const activeEntKeys = Object.keys(customerInfo.entitlements.active);
        if (activeEntKeys.length > 0) {
            const firstEnt = customerInfo.entitlements.active[activeEntKeys[0]];
            setActiveProductId(firstEnt.productIdentifier);
            console.log("[SubscriptionSheet] Active product from entitlement:", firstEnt.productIdentifier);
            return;
        }

        // 2. Fallback: check activeSubscriptions array
        if (customerInfo.activeSubscriptions && customerInfo.activeSubscriptions.length > 0) {
            setActiveProductId(customerInfo.activeSubscriptions[0]);
            console.log("[SubscriptionSheet] Active product from activeSubscriptions:", customerInfo.activeSubscriptions[0]);
            return;
        }

        console.log("[SubscriptionSheet] No active product found. Entitlements:", JSON.stringify(customerInfo.entitlements, null, 2));
    }, [customerInfo]);

    const handleSubscribe = async () => {
        if (!selectedPackage) {
            Alert.alert(t("common.error"), t("sub.no_plan"));
            return;
        }
        const plan = selectedPackage.packageType?.toLowerCase() ?? selectedPackage.product.identifier;
        setIsProcessing(true);
        track.proSubscribeSelect(plan);
        const result = await purchasePackage(selectedPackage);
        setIsProcessing(false);

        if (result.success) {
            track.proSubscribeSuccess(
                plan,
                selectedPackage.product.price,
                selectedPackage.product.currencyCode
            );
            onPurchaseSuccess?.();
            onClose();
        } else {
            track.proSubscribeFailed(plan, result.error ?? "error");
            if (result.error && result.error !== "cancelled") {
                Alert.alert(t("sub.purchase_failed_title"), result.error);
            }
        }
    };

    const handleRestore = async () => {
        track.proRestoreSelect();
        setIsProcessing(true);
        const result = await restorePurchases();
        setIsProcessing(false);

        if (result.isPro) {
            onPurchaseSuccess?.();
            Alert.alert(t("sub.success"), t("sub.restored"), [{ text: "OK", onPress: onClose }]);
        } else if (result.error) {
            Alert.alert(t("sub.restore_failed"), result.error);
        } else {
            Alert.alert(t("sub.restore"), "No active Pro subscription found.");
        }
    };

    const renderPlan = (pkg: PurchasesPackage, kind: "weekly" | "monthly") => {
        const selected = !isPro && selectedPackage?.identifier === pkg.identifier;
        const active = isPro && activeProductId === pkg.product.identifier;
        const badge = active
            ? t("sub.active")
            : kind === "monthly" && discountPercentage && !isPro
                ? t("sub.save", { percent: discountPercentage })
                : null;
        return (
            <Pressable
                key={kind}
                style={[styles.planCard, selected && styles.planCardSelected, active && styles.planCardActive]}
                onPress={() => !isPro && handleSelectPlan(pkg, kind)}
            >
                {badge && (
                    <LinearGradient
                        colors={active ? ["#4ADE80", "#16A34A"] : ["#FFD27A", "#FF9F43"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.planBadge}
                    >
                        <Text style={styles.planBadgeText}>{badge}</Text>
                    </LinearGradient>
                )}
                <View style={styles.planTop}>
                    <Text style={[styles.planName, (selected || active) && styles.planNameOn]}>
                        {t(kind === "weekly" ? "sub.weekly" : "sub.monthly")}
                    </Text>
                    {!isPro && (
                        <View style={[styles.radio, selected && styles.radioOn]}>
                            {selected && <IconCheck size={12} color="#fff" strokeWidth={3.2} />}
                        </View>
                    )}
                </View>
                <Text style={styles.planPrice} numberOfLines={1} adjustsFontSizeToFit>
                    {pkg.product.priceString}
                </Text>
                {/* What a month works out to per week, so the saving is
                    arithmetic the user can check rather than a claim on a
                    badge. */}
                <Text style={styles.planSub} numberOfLines={1}>
                    {kind === "monthly"
                        ? (pkg.product.price / WEEKS_PER_MONTH).toLocaleString(undefined, {
                            style: "currency",
                            currency: pkg.product.currencyCode,
                        }) + t("sub.per_week_suffix")
                        : " "}
                </Text>
            </Pressable>
        );
    };

    return (
        <Animated.View
            style={[
                styles.container,
                StyleSheet.absoluteFillObject,
                {
                    opacity: fadeAnim,
                    zIndex: isOpened ? 1000 : -1,
                    pointerEvents: isOpened ? "auto" : "none"
                }
            ]}
        >
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* The live preview. Mounted while open or pre-warmed (see
                `warm`); its canvas is paused whenever the sheet is hidden. The
                picture under it covers the moments before the model is in. */}
            <View style={[styles.stage, { height: HERO_H + 80 }]} pointerEvents="none">
                {selectedChar?.thumbnail_url ? (
                    <Image
                        source={selectedChar.thumbnail_url}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        contentPosition="top"
                        cachePolicy="disk"
                        blurRadius={18}
                    />
                ) : null}
                {viewerMounted && (
                    <VRMViewer
                        ref={vrmRef}
                        transparent={false}
                        style={StyleSheet.absoluteFillObject}
                        onReady={() => setVrmReady(true)}
                        onModelLoaded={handleModelLoaded}
                        {...preview.viewerSource}
                    />
                )}
                <LinearGradient
                    colors={["rgba(11,6,20,0.55)", "rgba(11,6,20,0)", "rgba(11,6,20,0.1)", "rgba(11,6,20,0.9)", "#0B0614"]}
                    locations={[0, 0.16, 0.5, 0.8, 1]}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 300 + insets.bottom }}
                bounces={false}
            >
                <View style={[styles.hero, { height: HERO_H }]}>
                    <View style={styles.heroText}>
                        <Pressable onPress={handleSecretProTap} hitSlop={10}>
                            <LinearGradient
                                colors={["#FFE29A", "#F5B642"]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.proBadge}
                            >
                                <CrownIcon size={14} color="#5A3300" fill="#5A3300" />
                                <Text style={styles.proBadgeText}>TRUEMATE PRO</Text>
                            </LinearGradient>
                        </Pressable>
                        <Text style={styles.heroTitle}>{t("sub.hero_title")}</Text>

                        {characters.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.avatarRow}
                                style={styles.avatarScroll}
                            >
                                {characters.map((c, i) => (
                                    <Pressable
                                        key={c.id}
                                        onPress={() => setSelectedIndex(i)}
                                        style={[styles.avatar, i === selectedIndex && styles.avatarOn]}
                                    >
                                        <Image
                                            source={c.small_thumb_url ?? c.thumbnail_url}
                                            style={styles.avatarImg}
                                            contentFit="cover"
                                            contentPosition="top"
                                            cachePolicy="disk"
                                        />
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}

                        <View style={styles.toolsRow}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ flex: 1 }}
                                contentContainerStyle={styles.costumeRow}
                            >
                                {isCostumesLoading
                                    ? [1, 2, 3, 4].map((k) => (
                                        <Animated.View key={k} style={[styles.costume, styles.costumeBone, { opacity: shimmerOpacity }]} />
                                    ))
                                    : costumes.map((c) => (
                                        <Pressable
                                            key={c.id}
                                            onPress={() => setSelectedCostume(c)}
                                            style={[styles.costume, selectedCostume?.id === c.id && styles.costumeOn]}
                                        >
                                            <Image
                                                source={c.thumbnail ?? undefined}
                                                style={styles.costumeImg}
                                                contentFit="cover"
                                                cachePolicy="disk"
                                            />
                                        </Pressable>
                                    ))}
                            </ScrollView>
                            <Pressable
                                onPress={handleDanceTest}
                                style={({ pressed }) => [styles.danceBtn, pressed && { opacity: 0.75 }]}
                                hitSlop={6}
                            >
                                <IconMusic size={18} color="#fff" />
                            </Pressable>
                        </View>
                    </View>
                </View>

                {/* ─── What PRO gives ─── */}
                <View style={styles.features}>
                    {FEATURES.map((f, i) => (
                        <View
                            key={f.text}
                            style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureDivider]}
                        >
                            <View style={[styles.featureIcon, { backgroundColor: f.color + "22" }]}>
                                <f.icon size={18} color={f.color} />
                            </View>
                            <Text style={[styles.featureText, f.highlight && styles.featureTextHL]}>
                                {t(f.text)}
                            </Text>
                            {f.highlight && (
                                <View style={styles.x2Pill}>
                                    <Text style={styles.x2PillText}>×2</Text>
                                </View>
                            )}
                        </View>
                    ))}
                </View>
                {/* PRO opens the PRO-only catalogue; it does not hand over the
                    ruby-priced items inside it. Say so here rather than let
                    the purchase say it. */}
                <Text style={styles.finePrint}>{t("sub.fine_print")}</Text>
            </ScrollView>

            {/* Close sits over the scroll so it never scrolls away. */}
            <Pressable
                onPress={() => {
                    track.proPaywallClose(selectedPackage?.packageType?.toLowerCase());
                    onClose();
                }}
                hitSlop={10}
                style={({ pressed }) => [styles.closeBtn, { top: insets.top + 10 }, pressed && { opacity: 0.7 }]}
            >
                <IconX color="#fff" size={20} />
            </Pressable>

            {/* ─── Plans + CTA, pinned ─── */}
            <LinearGradient
                colors={["rgba(11,6,20,0)", "#0B0614"]}
                locations={[0, 0.62]}
                style={[styles.bottomFade, { bottom: 0 }]}
                pointerEvents="none"
            />
            <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 10 }]}>
                <View style={styles.plansRow}>
                    {weeklyPackage && renderPlan(weeklyPackage, "weekly")}
                    {monthlyPackage && renderPlan(monthlyPackage, "monthly")}
                </View>

                {isPro ? (
                    <Pressable
                        style={styles.ctaManage}
                        onPress={() => { AdsManager.suppressNextResumeAd(); Linking.openURL("https://apps.apple.com/account/subscriptions"); }}
                    >
                        <Text style={styles.ctaManageText}>{t("sub.manage")}</Text>
                    </Pressable>
                ) : (
                    <Pressable
                        style={({ pressed }) => [styles.cta, (isProcessing || contextLoading) && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.985 }] }]}
                        onPress={isProcessing || contextLoading ? undefined : handleSubscribe}
                    >
                        <LinearGradient
                            colors={["#FF6FA3", "#FF2E74"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.ctaGradient}
                        >
                            {isProcessing ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <CrownIcon size={18} color="#fff" fill="#fff" />
                                    <Text style={styles.ctaText}>{t("sub.cta")}</Text>
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                )}

                <View style={styles.footerLinks}>
                    <Pressable onPress={handleRestore} hitSlop={6}>
                        <Text style={styles.footerLink}>{t("sub.restore")}</Text>
                    </Pressable>
                    <Text style={styles.footerDot}>·</Text>
                    <Pressable onPress={() => openBrowserSafe("https://truemate.netlify.app/terms")} hitSlop={6}>
                        <Text style={styles.footerLink}>Terms</Text>
                    </Pressable>
                    <Text style={styles.footerDot}>·</Text>
                    <Pressable onPress={() => openBrowserSafe("https://truemate.netlify.app/privacy")} hitSlop={6}>
                        <Text style={styles.footerLink}>Privacy</Text>
                    </Pressable>
                    <Text style={styles.footerDot}>·</Text>
                    <Pressable onPress={() => openBrowserSafe("https://truemate.netlify.app/eula")} hitSlop={6}>
                        <Text style={styles.footerLink}>EULA</Text>
                    </Pressable>
                </View>
            </View>
        </Animated.View>
    );
}
