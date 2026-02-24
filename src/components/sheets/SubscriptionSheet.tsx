import React, { useEffect, useState, useMemo } from "react";
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
} from "react-native";
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
} from "@tabler/icons-react-native";
import { useSubscription } from "../../contexts/SubscriptionContext";

const FEATURES = [
    { icon: IconCube3dSphere, text: "Full 3D VRM interaction experience", color: "#8b5cf6" },
    { icon: IconVideo, text: "Unlimited HD Video Calls anytime", color: "#9C27B0" },
    { icon: IconLock, text: "Unlock all secret & exclusive content", color: "#FF9800" },
    { icon: IconUsers, text: "Access every character instantly", color: "#4CAF50" },
    { icon: IconSparkles, text: "Premium costumes & animations", color: "#2196F3" },
    { icon: IconHeart, text: "Deeper intimacy & special moments", color: "#a78bfa" },
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

    // Active product
    useEffect(() => {
        if (customerInfo) {
            const ent =
                customerInfo.entitlements.active["pro"] || customerInfo.entitlements.active["Pro"];
            if (ent) setActiveProductId(ent.productIdentifier);
        }
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

                {/* BG gradient */}
                <LinearGradient
                    colors={["#1a0533", "#0d0d1a", "#000000"]}
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
                                <Text style={styles.proBadgeText}>PRO</Text>
                            </LinearGradient>

                            <Text style={styles.heroTitle}>{"Unlock Your\nUltimate Experience"}</Text>
                            <Text style={styles.heroSubtitle}>
                                Access premium characters, unlimited calls, exclusive content, and more.
                            </Text>
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
                        <View style={{ height: 200 }} />
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
                                        selectedPackage?.identifier === monthlyPackage.identifier && styles.planCardSelected,
                                    ]}
                                    onPress={() => setSelectedPackage(monthlyPackage)}
                                >
                                    <View style={styles.planInfo}>
                                        <Text
                                            style={[
                                                styles.planName,
                                                selectedPackage?.identifier === monthlyPackage.identifier && styles.textHL,
                                            ]}
                                        >
                                            MONTHLY
                                        </Text>
                                        <Text style={styles.planPrice}>{monthlyPackage.product.priceString}</Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.radio,
                                            selectedPackage?.identifier === monthlyPackage.identifier && styles.radioSelected,
                                        ]}
                                    />
                                </Pressable>
                            )}
                            {yearlyPackage && (
                                <Pressable
                                    style={[
                                        styles.planCard,
                                        selectedPackage?.identifier === yearlyPackage.identifier && styles.planCardSelected,
                                    ]}
                                    onPress={() => setSelectedPackage(yearlyPackage)}
                                >
                                    {discountPercentage && (
                                        <View style={styles.discountBadge}>
                                            <Text style={styles.discountText}>SAVE {discountPercentage}</Text>
                                        </View>
                                    )}
                                    <View style={styles.planInfo}>
                                        <Text
                                            style={[
                                                styles.planName,
                                                selectedPackage?.identifier === yearlyPackage.identifier && styles.textHL,
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
                                    <View
                                        style={[
                                            styles.radio,
                                            selectedPackage?.identifier === yearlyPackage.identifier && styles.radioSelected,
                                        ]}
                                    />
                                </Pressable>
                            )}
                        </View>

                        {/* CTA */}
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
                                    <Text style={styles.ctaText}>{isPro ? "Update Plan" : "Unlock Pro"}</Text>
                                )}
                            </LinearGradient>
                        </Pressable>

                        {/* Footer */}
                        <View style={styles.footerLinks}>
                            <Pressable onPress={handleRestore}>
                                <Text style={styles.footerLink}>Restore</Text>
                            </Pressable>
                            <Text style={styles.footerDot}>•</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync("https://eduto.io/terms")}>
                                <Text style={styles.footerLink}>Terms</Text>
                            </Pressable>
                            <Text style={styles.footerDot}>•</Text>
                            <Pressable onPress={() => WebBrowser.openBrowserAsync("https://eduto.io/privacy")}>
                                <Text style={styles.footerLink}>Privacy</Text>
                            </Pressable>
                        </View>

                        {isPro && activeProductId && (
                            <Pressable
                                onPress={() => Linking.openURL("https://apps.apple.com/account/subscriptions")}
                                style={{ marginTop: 8 }}
                            >
                                <Text style={[styles.footerLink, { opacity: 0.5, fontSize: 11 }]}>
                                    Manage Subscription
                                </Text>
                            </Pressable>
                        )}
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
    heroSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 16, lineHeight: 24, fontWeight: "500" },

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
});
