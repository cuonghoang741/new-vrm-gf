import React, { useEffect, useState, useMemo, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    ActivityIndicator,
    Alert,
    Modal,
    StatusBar,
    Linking,
    FlatList,
    TouchableOpacity,
    Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PurchasesPackage } from "react-native-purchases";
import * as WebBrowser from "expo-web-browser";
import {
    IconX,
    IconCube3dSphere,
    IconVideo,
    IconLock,
    IconUsers,
    IconSparkles,
    IconHeart,
    IconMusic,
    IconChevronLeft,
    IconChevronRight,
    IconCrown,
} from "@tabler/icons-react-native";
import { useSubscription } from "../../contexts/SubscriptionContext";
import VRMViewer, { VRMViewerHandle } from "../VRMViewer";
import { getCharacters } from "../../cache/charactersCache";
import { supabase } from "../../config/supabase";

const FEATURES = [
    { icon: IconCube3dSphere, text: "Full 3D VRM interaction experience", color: "#8b5cf6" },
    // { icon: IconVideo, text: "Unlimited HD Video Calls anytime", color: "#9C27B0" },
    // { icon: IconLock, text: "Unlock all secret & exclusive content", color: "#FF9800" },
    { icon: IconUsers, text: "Access every character instantly", color: "#4CAF50" },
    { icon: IconSparkles, text: "Premium costumes & animations", color: "#2196F3" },
];

interface Props {
    isOpened: boolean;
    onClose: () => void;
    onPurchaseSuccess?: () => void;
}

export default function SubscriptionSheet({ isOpened, onClose, onPurchaseSuccess }: Props) {
    const insets = useSafeAreaInsets();
    const {
        isPro,
        isLoading: contextLoading,
        packages,
        customerInfo,
        purchasePackage,
        restorePurchases,
    } = useSubscription();

    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeProductId, setActiveProductId] = useState<string | null>(null);
    const vrmRef = useRef<VRMViewerHandle>(null);

    // Test controls state
    const [characters, setCharacters] = useState<any[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Fetch characters for test carousel
    useEffect(() => {
        if (!isOpened) return;
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
    }, [isOpened]);

    const selectedChar = characters[selectedIndex];

    const [costumes, setCostumes] = useState<any[]>([]);
    const [selectedCostume, setSelectedCostume] = useState<any | null>(null);
    const [isCostumesLoading, setIsCostumesLoading] = useState(false);
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
        if (!selectedChar || !isOpened) return;
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
    }, [selectedChar?.id, isOpened]);

    useEffect(() => {
        if (!isOpened || !vrmRef.current) return;
        const modelUrl = selectedCostume?.model_url || selectedChar?.base_model_url;
        if (modelUrl) {
            vrmRef.current.loadModelByURL(modelUrl);
        }
        const bgImage = selectedChar?.backgrounds?.image;
        if (bgImage) {
            vrmRef.current.setBackgroundImage(bgImage);
        }
    }, [selectedChar, selectedCostume, isOpened]);

    const goToPrev = () => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) => (prev === 0 ? characters.length - 1 : prev - 1));
    };

    const goToNext = () => {
        if (characters.length === 0) return;
        setSelectedIndex((prev) => (prev === characters.length - 1 ? 0 : prev + 1));
    };

    const handleDanceTest = () => {
        const dances = [
            "Dance - Give Your Soul.fbx",
            "Feminine - Exaggerated 2.fbx",
            "Heart-Flutter Pose.fbx",
            "Making a snow angel.fbx",
            "Sly - Finger gun gesture.fbx"
        ];
        const randomDance = dances[Math.floor(Math.random() * dances.length)];
        vrmRef.current?.loadAnimationByName(randomDance);
    };

    // Find plans
    const yearlyPackage = packages.find(
        (p) =>
            p.packageType === "ANNUAL" ||
            p.identifier.toLowerCase().includes("year") ||
            p.identifier.toLowerCase().includes("annual") ||
            p.product.identifier.toLowerCase().includes("year")
    );
    const monthlyPackage = packages.find(
        (p) =>
            p.packageType === "MONTHLY" ||
            p.identifier.toLowerCase().includes("month") ||
            p.product.identifier.toLowerCase().includes("month")
    );

    const discountPercentage = useMemo(() => {
        if (!yearlyPackage || !monthlyPackage) return null;
        const monthly = monthlyPackage.product.price;
        const yearly = yearlyPackage.product.price;
        if (monthly <= 0) return null;
        const pct = Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
        return pct > 0 ? `${pct}% OFF` : null;
    }, [yearlyPackage, monthlyPackage]);

    // Default selection
    useEffect(() => {
        if (packages.length > 0 && !selectedPackage) {
            setSelectedPackage(yearlyPackage || monthlyPackage || packages[0]);
        }
    }, [packages, selectedPackage, yearlyPackage, monthlyPackage]);

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
            Alert.alert("Error", "No plan selected.");
            return;
        }
        setIsProcessing(true);
        const result = await purchasePackage(selectedPackage);
        setIsProcessing(false);

        if (result.success) {
            onPurchaseSuccess?.();
            onClose();
        } else if (result.error && result.error !== "cancelled") {
            Alert.alert("Purchase Failed", result.error);
        }
    };

    const handleRestore = async () => {
        setIsProcessing(true);
        const result = await restorePurchases();
        setIsProcessing(false);

        if (result.isPro) {
            onPurchaseSuccess?.();
            Alert.alert("Success", "Purchases restored!", [{ text: "OK", onPress: onClose }]);
        } else if (result.error) {
            Alert.alert("Restore Failed", result.error);
        } else {
            Alert.alert("Restore", "No active Pro subscription found.");
        }
    };

    return (
        <Modal
            visible={isOpened}
            animationType="fade"
            presentationStyle="overFullScreen"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

                {isOpened && (
                    <VRMViewer
                        ref={vrmRef}
                        initialModelName="001/001_vrm/001_01.vrm"
                        initialBackgroundUrl={selectedChar?.backgrounds?.image ?? undefined}
                        style={StyleSheet.absoluteFillObject}
                    />
                )}

                {/* Blur overlay when a costume is selected */}
                {selectedCostume && (
                    <BlurView
                        intensity={80}
                        tint="dark"
                        style={StyleSheet.absoluteFill}
                    />
                )}

                {/* BG gradient overlay */}
                <LinearGradient
                    colors={["rgba(26,5,51,0.1)", "rgba(13,13,26,0.4)", "rgba(0,0,0,0.95)"]}
                    locations={[0, 0.4, 1]}
                    style={StyleSheet.absoluteFill}
                />

                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <Pressable
                        onPress={onClose}
                        style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
                    >
                        <BlurView intensity={40} tint="dark" style={styles.closeBtnInner}>
                            <IconX color="#fff" size={22} />
                        </BlurView>
                    </Pressable>
                </View>

                {/* Content */}
                <View style={styles.mainContent}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        {/* Hero */}
                        <View style={styles.heroSection}>
                            <LinearGradient
                                colors={["#8b5cf6", "#7c3aed"]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.proBadge}
                            >
                                <Text style={styles.proBadgeText}>TRUEFEEL PRO</Text>
                            </LinearGradient>

                            <Text style={styles.heroTitle}>{"Unlock Your\nUltimate Experience"}</Text>
                            <Text style={styles.heroSubtitle}>
                                Access premium characters, unlimited calls, exclusive content, and more.
                            </Text>

                            {/* Demo Controls Area */}
                            {characters.length > 0 && (
                                <View style={styles.demoControls}>
                                    {/* Avatar Carousel Pill */}
                                    <View style={styles.avatarGlassPill}>
                                        <TouchableOpacity style={styles.arrowBtn} onPress={goToPrev} activeOpacity={0.7}>
                                            <IconChevronLeft size={18} color="rgba(255,255,255,0.6)" />
                                        </TouchableOpacity>

                                        <FlatList
                                            style={styles.carouselList}
                                            data={characters}
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.thumbnailList}
                                            keyExtractor={(item) => item.id}
                                            renderItem={({ item, index }) => (
                                                <TouchableOpacity
                                                    onPress={() => setSelectedIndex(index)}
                                                    activeOpacity={0.7}
                                                    style={[
                                                        styles.thumbnailWrap,
                                                        index === selectedIndex && styles.thumbnailWrapActive,
                                                    ]}
                                                >
                                                    <Image
                                                        source={{ uri: item.thumbnail_url ?? undefined }}
                                                        style={styles.thumbnail}
                                                        contentFit="cover"
                                                    />
                                                </TouchableOpacity>
                                            )}
                                        />

                                        <TouchableOpacity style={styles.arrowBtn} onPress={goToNext} activeOpacity={0.7}>
                                            <IconChevronRight size={18} color="rgba(255,255,255,0.6)" />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Secondary Actions */}
                                    <View style={styles.actionsRow}>
                                        {(isCostumesLoading || costumes.length > 0) && (
                                            <View style={[styles.actionGroup, { alignItems: "flex-start" }]}>
                                                <Text style={styles.sectionLabel}>OUTFIT</Text>
                                                {isCostumesLoading ? (
                                                    <View style={styles.costumesList}>
                                                        {[1, 2, 3].map((key) => (
                                                            <Animated.View
                                                                key={key}
                                                                style={[styles.costumeItemSkeleton, { opacity: shimmerOpacity }]}
                                                            />
                                                        ))}
                                                    </View>
                                                ) : (
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.costumesList}>

                                                        {costumes.map((c) => (
                                                            <TouchableOpacity
                                                                key={c.id}
                                                                activeOpacity={0.7}
                                                                onPress={() => setSelectedCostume(c)}
                                                                style={[styles.costumeItem, selectedCostume?.id === c.id && styles.costumeItemActive]}
                                                            >
                                                                <Image
                                                                    source={{ uri: c.thumbnail ?? undefined }}
                                                                    style={styles.costumeThumb}
                                                                    contentFit="cover"
                                                                />
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                )}
                                            </View>
                                        )}

                                        <View style={[styles.actionGroup, { flex: 0 }]}>
                                            <Text style={styles.sectionLabel}>VIBE</Text>
                                            <TouchableOpacity style={styles.danceBtn} onPress={handleDanceTest} activeOpacity={0.7}>
                                                <IconMusic size={20} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* Features */}
                        <View style={styles.featuresContainer}>
                            {FEATURES.map((f, i) => (
                                <View key={i} style={styles.featureItem}>
                                    <View style={[styles.featureIcon, { backgroundColor: f.color + "20" }]}>
                                        <f.icon size={20} color={f.color} />
                                    </View>
                                    <Text style={styles.featureText}>{f.text}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={{ height: 350 }} />
                    </ScrollView>

                    {/* Bottom panel */}
                    <BlurView
                        intensity={80}
                        tint="dark"
                        style={[styles.bottomPanel, { paddingBottom: insets.bottom + 10 }]}
                    >
                        {/* Plans */}
                        <View style={styles.plansRow}>
                            {monthlyPackage && (
                                <Pressable
                                    style={[
                                        styles.planCard,
                                        !isPro && selectedPackage?.identifier === monthlyPackage.identifier && styles.planCardSelected,
                                        isPro && activeProductId === monthlyPackage.product.identifier && styles.planCardActive,
                                    ]}
                                    onPress={() => !isPro && setSelectedPackage(monthlyPackage)}
                                >
                                    {isPro && activeProductId === monthlyPackage.product.identifier && (
                                        <View style={styles.activeBadge}>
                                            <Text style={styles.activeText}>ACTIVE</Text>
                                        </View>
                                    )}
                                    <View style={styles.planInfo}>
                                        <Text
                                            style={[
                                                styles.planName,
                                                !isPro && selectedPackage?.identifier === monthlyPackage.identifier && styles.textHL,
                                                isPro && activeProductId === monthlyPackage.product.identifier && styles.textActive,
                                            ]}
                                        >
                                            MONTHLY
                                        </Text>
                                        <Text style={styles.planPrice}>{monthlyPackage.product.priceString}</Text>
                                    </View>
                                    {!isPro && (
                                        <View
                                            style={[
                                                styles.radio,
                                                selectedPackage?.identifier === monthlyPackage.identifier && styles.radioSelected,
                                            ]}
                                        />
                                    )}
                                    {isPro && activeProductId === monthlyPackage.product.identifier && (
                                        <IconCrown size={18} color="#F59E0B" fill="#F59E0B" />
                                    )}
                                </Pressable>
                            )}
                            {yearlyPackage && (
                                <Pressable
                                    style={[
                                        styles.planCard,
                                        !isPro && selectedPackage?.identifier === yearlyPackage.identifier && styles.planCardSelected,
                                        isPro && activeProductId === yearlyPackage.product.identifier && styles.planCardActive,
                                    ]}
                                    onPress={() => !isPro && setSelectedPackage(yearlyPackage)}
                                >
                                    {isPro && activeProductId === yearlyPackage.product.identifier ? (
                                        <View style={styles.activeBadge}>
                                            <Text style={styles.activeText}>ACTIVE</Text>
                                        </View>
                                    ) : (
                                        discountPercentage && !isPro && (
                                            <View style={styles.discountBadge}>
                                                <Text style={styles.discountText}>SAVE {discountPercentage}</Text>
                                            </View>
                                        )
                                    )}
                                    <View style={styles.planInfo}>
                                        <Text
                                            style={[
                                                styles.planName,
                                                !isPro && selectedPackage?.identifier === yearlyPackage.identifier && styles.textHL,
                                                isPro && activeProductId === yearlyPackage.product.identifier && styles.textActive,
                                            ]}
                                        >
                                            YEARLY
                                        </Text>
                                        <Text style={styles.planPrice}>{yearlyPackage.product.priceString}</Text>
                                        <Text style={styles.perMonth}>
                                            {(yearlyPackage.product.price / 12).toLocaleString(undefined, {
                                                style: "currency",
                                                currency: yearlyPackage.product.currencyCode,
                                            })}
                                            /mo
                                        </Text>
                                    </View>
                                    {!isPro && (
                                        <View
                                            style={[
                                                styles.radio,
                                                selectedPackage?.identifier === yearlyPackage.identifier && styles.radioSelected,
                                            ]}
                                        />
                                    )}
                                    {isPro && activeProductId === yearlyPackage.product.identifier && (
                                        <IconCrown size={18} color="#F59E0B" fill="#F59E0B" />
                                    )}
                                </Pressable>
                            )}
                        </View>

                        {/* CTA */}
                        {isPro ? (
                            <Pressable
                                style={styles.ctaButtonManage}
                                onPress={() => Linking.openURL("https://apps.apple.com/account/subscriptions")}
                            >
                                <Text style={styles.ctaTextManage}>Manage Subscription</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                style={[styles.ctaButton, (isProcessing || contextLoading) && { opacity: 0.6 }]}
                                onPress={isProcessing || contextLoading ? undefined : handleSubscribe}
                            >
                                <LinearGradient
                                    colors={["#8b5cf6", "#7c3aed"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.ctaGradient}
                                >
                                    {isProcessing ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.ctaText}>Unlock Pro</Text>
                                    )}
                                </LinearGradient>
                            </Pressable>
                        )}

                        {/* Footer */}
                        <View style={styles.footerLinks}>
                            <Pressable onPress={handleRestore}>
                                <Text style={styles.footerLink}>Restore</Text>
                            </Pressable>
                            <Text style={styles.footerDot}>•</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/terms")}>
                                <Text style={styles.footerLink}>Terms</Text>
                            </Pressable>
                            <Text style={styles.footerDot}>•</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/privacy")}>
                                <Text style={styles.footerLink}>Privacy</Text>
                            </Pressable>
                            <Text style={styles.footerDot}>•</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/eula")}>
                                <Text style={styles.footerLink}>EULA</Text>
                            </Pressable>
                        </View>
                    </BlurView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    header: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingHorizontal: 20,
    },
    closeBtn: { overflow: "hidden", borderRadius: 20 },
    closeBtnInner: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    mainContent: { flex: 1, zIndex: 10 },
    scrollContent: { paddingTop: 100, paddingHorizontal: 24 },

    // Hero
    heroSection: { marginBottom: 32, alignItems: "flex-start" },
    proBadge: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 16,
    },
    proBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
    heroTitle: {
        color: "#fff",
        fontSize: 38,
        fontWeight: "900",
        lineHeight: 44,
        marginBottom: 12,
        textShadowColor: "rgba(0,0,0,0.5)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 10,
    },
    heroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 16, lineHeight: 24, fontWeight: "500", marginBottom: 16 },

    // Demo Controls
    demoControls: {
        width: "100%",
        alignItems: "stretch",
        marginBottom: 24,
        gap: 16,
    },
    avatarGlassPill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 40,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    carouselList: { flexGrow: 0 },
    arrowBtn: { padding: 8 },
    thumbnailList: { flexGrow: 1, gap: 10, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
    thumbnailWrap: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "rgba(150, 100, 255, 0.2)",
    },
    thumbnailWrapActive: {
        borderColor: "#9B59FF",
        borderWidth: 2.5,
        shadowColor: "#9B59FF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.7,
        shadowRadius: 12,
        elevation: 8,
    },
    thumbnail: {
        width: "100%",
        height: "100%",
    },

    actionsRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
    },
    actionGroup: {
        alignItems: "center",
        flex: 1,
    },
    sectionLabel: {
        fontSize: 10,
        color: "rgba(255,255,255,0.5)",
        fontWeight: "700",
        letterSpacing: 1.5,
        marginBottom: 8,
    },
    costumesList: {
        gap: 10,
        alignItems: "center",
        justifyContent: "flex-start",
        flexDirection: "row",
    },
    costumeItemSkeleton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "rgba(255,255,255,0.2)",
    },
    costumeItem: {
        width: 42,
        height: 42,
        borderRadius: 21,
        padding: 2,
        borderWidth: 2,
        borderColor: "transparent",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    costumeItemActive: { borderColor: "#8b5cf6", backgroundColor: "rgba(139, 92, 246, 0.15)" },
    costumeThumb: { width: 34, height: 34, borderRadius: 17 },
    danceBtn: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.15)",
    },

    // Features
    featuresContainer: { gap: 14 },
    featureItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
    },
    featureIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    featureText: { color: "#fff", fontSize: 15, fontWeight: "600", flex: 1 },

    // Bottom panel
    bottomPanel: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 24,
        paddingHorizontal: 24,
        overflow: "hidden",
    },
    plansRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
    planCard: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: 16,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
    },
    planCardSelected: { borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.1)" },
    planInfo: { flex: 1 },
    planName: {
        color: "rgba(255,255,255,0.6)",
        fontSize: 12,
        fontWeight: "700",
        marginBottom: 4,
    },
    textHL: { color: "#a78bfa" },
    planPrice: { color: "#fff", fontSize: 18, fontWeight: "700" },
    perMonth: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.3)",
    },
    radioSelected: { borderColor: "#8b5cf6", backgroundColor: "#8b5cf6" },
    discountBadge: {
        position: "absolute",
        top: -10,
        right: 12,
        backgroundColor: "#4CAF50",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    discountText: { color: "#fff", fontSize: 10, fontWeight: "800" },

    // CTA
    ctaButton: {
        borderRadius: 28,
        overflow: "hidden",
        marginBottom: 16,
        shadowColor: "#8b5cf6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    ctaGradient: { paddingVertical: 18, alignItems: "center", justifyContent: "center" },
    ctaText: { color: "#fff", fontSize: 18, fontWeight: "bold", letterSpacing: 0.5 },

    // Footer
    footerLinks: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        opacity: 0.7,
    },
    footerLink: { color: "#fff", fontSize: 12, fontWeight: "500" },
    footerDot: { color: "#fff", marginHorizontal: 10, fontSize: 10 },

    // Active plan states
    planCardActive: {
        borderColor: "rgba(245, 158, 11, 0.5)",
        backgroundColor: "rgba(245, 158, 11, 0.08)",
    },
    activeBadge: {
        position: "absolute",
        top: -10,
        right: 12,
        backgroundColor: "#F59E0B",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    activeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
    textActive: { color: "#F59E0B" },

    // Manage subscription CTA
    ctaButtonManage: {
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.15)",
        paddingVertical: 18,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    ctaTextManage: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "600" },
});
