import React, { useCallback, useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Linking,
    ScrollView,
    Platform,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
    IconLogout,
    IconInfoCircle,
    IconBug,
    IconChevronRight,
    IconShieldLock,
    IconStar,
    IconRefresh,
    IconTrash,
    IconCrown,
} from "@tabler/icons-react-native";
import { useSubscription } from "../../contexts/SubscriptionContext";
import * as Haptics from "expo-haptics";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { supabase } from "../../config/supabase";
import EditProfileSheet from "./EditProfileSheet";

interface SettingsSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    userId?: string;
    userEmail?: string | null;
    onResetOnboarding?: () => void;
    onOpenSubscription?: () => void;
}

export type SettingsSheetRef = BottomSheetRef;

interface SettingItemProps {
    icon: React.ReactNode;
    label: string;
    subtitle?: string;
    onPress: () => void;
    danger?: boolean;
    showChevron?: boolean;
}

function SettingItem({ icon, label, subtitle, onPress, danger, showChevron = true }: SettingItemProps) {
    return (
        <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.65}>
            <View style={[styles.settingIconContainer, danger && styles.settingIconDanger]}>
                {icon}
            </View>
            <View style={styles.settingContent}>
                <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
                {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
            </View>
            {showChevron && <IconChevronRight size={18} color="rgba(255,255,255,0.2)" />}
        </TouchableOpacity>
    );
}

const SettingsSheet = forwardRef<SettingsSheetRef, SettingsSheetProps>(({
    isOpened,
    onIsOpenedChange,
    userId,
    userEmail,
    onResetOnboarding,
    onOpenSubscription,
}, ref) => {
    const sheetRef = useRef<BottomSheetRef>(null);
    const { isPro } = useSubscription();
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    // Edit profile sub-sheet
    const editProfileRef = useRef<BottomSheetRef>(null);
    const [editProfileOpen, setEditProfileOpen] = useState(false);

    useImperativeHandle(ref, () => ({
        present: (index?: number) => sheetRef.current?.present(index),
        dismiss: () => sheetRef.current?.dismiss(),
    }));

    // Load profile
    useEffect(() => {
        if (!userId || !isOpened) return;
        const loadProfile = async () => {
            const { data } = await supabase
                .from("profiles")
                .select("display_name, avatar_url")
                .eq("id", userId)
                .maybeSingle();
            if (data) {
                setDisplayName(data.display_name);
                setAvatarUrl(data.avatar_url);
            }
        };
        loadProfile();
    }, [userId, isOpened]);

    const handleSignOut = useCallback(() => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    await supabase.auth.signOut();
                    onIsOpenedChange(false);
                    sheetRef.current?.dismiss();
                },
            },
        ]);
    }, [onIsOpenedChange]);

    const handleDeleteAccount = useCallback(() => {
        Alert.alert(
            "Delete Account",
            "This action is permanent and cannot be undone. All your data will be deleted.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        Alert.alert("Are you absolutely sure?", "This cannot be reversed.", [
                            { text: "Cancel", style: "cancel" },
                            {
                                text: "Confirm Delete",
                                style: "destructive",
                                onPress: async () => {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                    try {
                                        await supabase.functions.invoke("delete-user");
                                        await supabase.auth.signOut();
                                    } catch {
                                        Alert.alert("Error", "Failed to delete account. Please contact support.");
                                    }
                                    onIsOpenedChange(false);
                                    sheetRef.current?.dismiss();
                                },
                            },
                        ]);
                    },
                },
            ]
        );
    }, [onIsOpenedChange]);

    const handleResetOnboarding = useCallback(() => {
        Alert.alert("Reset Onboarding", "This will restart the character matching process. Continue?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Reset",
                style: "destructive",
                onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onResetOnboarding?.();
                    onIsOpenedChange(false);
                    sheetRef.current?.dismiss();
                },
            },
        ]);
    }, [onResetOnboarding, onIsOpenedChange]);

    const handleReportBug = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.prompt(
            "Report a Bug 🐛",
            "Please describe the issue you encountered:",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Submit",
                    onPress: async (description?: string) => {
                        if (!description?.trim()) {
                            Alert.alert("Oops", "Please enter a description.");
                            return;
                        }
                        try {
                            const { error } = await supabase.from("bug_reports").insert({
                                user_id: userId,
                                description: description.trim(),
                                device_info: {
                                    os: Platform.OS,
                                    version: Platform.Version,
                                },
                            });
                            if (error) throw error;
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert("Thank you! 💜", "Your report has been submitted. We'll look into it.");
                        } catch {
                            Alert.alert("Error", "Failed to submit report. Please try again.");
                        }
                    },
                },
            ],
            "plain-text",
            "",
            "default"
        );
    }, [userId]);

    const handleOpenEditProfile = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEditProfileOpen(true);
    }, []);

    const handleProfileUpdated = useCallback((name: string, avatar: string | null) => {
        setDisplayName(name);
        setAvatarUrl(avatar);
    }, []);

    const initial = displayName?.charAt(0)?.toUpperCase() ?? userEmail?.charAt(0)?.toUpperCase() ?? "?";

    return (
        <>
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title="Settings"
                isDarkBackground
                detents={[0.85, 0.95]}
                backgroundBlur="system-thick-material-dark"
            >
                <View style={{ flex: 1 }}>
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ─── Profile Card ─── */}
                        <TouchableOpacity
                            style={styles.profileCard}
                            onPress={handleOpenEditProfile}
                            activeOpacity={0.7}
                        >
                            <View style={styles.profileLeft}>
                                {avatarUrl ? (
                                    <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
                                ) : (
                                    <View style={styles.profileAvatarFallback}>
                                        <Text style={styles.profileAvatarText}>{initial}</Text>
                                    </View>
                                )}
                                <View style={styles.profileInfo}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                        <Text style={styles.profileName} numberOfLines={1}>
                                            {displayName ?? "Set your name"}
                                        </Text>
                                        {isPro && (
                                            <View style={styles.proBadgeInline}>
                                                <IconCrown size={12} color="#F59E0B" fill="#F59E0B" />
                                                <Text style={styles.proBadgeInlineText}>PRO</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.profileEmail} numberOfLines={1}>
                                        {userEmail ?? "Unknown"}
                                    </Text>
                                </View>
                            </View>
                            <IconChevronRight size={20} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>

                        {/* ─── General ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>GENERAL</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={isPro ? <IconCrown size={20} color="#F59E0B" fill="#F59E0B" /> : <IconStar size={20} color="#F59E0B" />}
                                    label={isPro ? "Pro Active ✓" : "Upgrade to PRO"}
                                    subtitle={isPro ? "You have full access to all features" : "Unlock all characters & costumes"}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onOpenSubscription?.();
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconRefresh size={20} color="#60A5FA" />}
                                    label="Reset Onboarding"
                                    subtitle="Re-match with a new character"
                                    onPress={handleResetOnboarding}
                                />
                            </View>
                        </View>

                        {/* ─── Support ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>SUPPORT</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={<IconBug size={20} color="#F472B6" />}
                                    label="Report a Bug"
                                    subtitle="Help us improve the app"
                                    onPress={handleReportBug}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconShieldLock size={20} color="#34D399" />}
                                    label="Privacy Policy"
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/privacy");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label="Terms of Service"
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/terms");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label="EULA"
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        WebBrowser.openBrowserAsync("https://truefeel-legal-haven.lovable.app/eula");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label="App Version"
                                    subtitle="1.0.0"
                                    onPress={() => { }}
                                    showChevron={false}
                                />
                            </View>
                        </View>

                        {/* ─── Account ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>ACCOUNT</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={<IconLogout size={20} color="#F59E0B" />}
                                    label="Sign Out"
                                    onPress={handleSignOut}
                                    showChevron={false}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconTrash size={20} color="#EF4444" />}
                                    label="Delete Account"
                                    subtitle="Permanently delete all data"
                                    onPress={handleDeleteAccount}
                                    danger
                                    showChevron={false}
                                />
                            </View>
                        </View>

                        <Text style={styles.footer}>Made with ❤️ by Eduto</Text>
                    </ScrollView>
                </View>
            </BottomSheet>

            {/* ─── Edit Profile sub-sheet ─── */}
            <EditProfileSheet
                isOpened={editProfileOpen}
                onIsOpenedChange={setEditProfileOpen}
                userId={userId}
                currentName={displayName}
                currentAvatar={avatarUrl}
                onProfileUpdated={handleProfileUpdated}
            />
        </>
    );
});

export default SettingsSheet;

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

    // Profile card
    profileCard: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        backgroundColor: "rgba(139, 92, 246, 0.12)", borderRadius: 20,
        padding: 16, marginBottom: 24,
        borderWidth: 1, borderColor: "rgba(139, 92, 246, 0.2)",
    },
    profileLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    profileAvatar: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
    profileAvatarFallback: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: "#8B5CF6", alignItems: "center", justifyContent: "center",
        marginRight: 14,
    },
    profileAvatarText: { fontSize: 22, fontWeight: "800", color: "#FFFFFF" },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 18, fontWeight: "700", color: "#FFFFFF", marginBottom: 2 },
    profileEmail: { fontSize: 13, color: "rgba(255,255,255,0.45)" },

    // Sections
    section: { marginBottom: 20 },
    sectionTitle: {
        fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.35)",
        letterSpacing: 1, marginBottom: 8, marginLeft: 4,
    },
    sectionCard: {
        backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 18,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", overflow: "hidden",
    },
    separator: { height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginLeft: 56 },

    // Setting item
    settingItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16 },
    settingIconContainer: {
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center",
        justifyContent: "center", marginRight: 14,
    },
    settingIconDanger: { backgroundColor: "rgba(239, 68, 68, 0.12)" },
    settingContent: { flex: 1 },
    settingLabel: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
    settingLabelDanger: { color: "#EF4444" },
    settingSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 },

    footer: { textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)", marginTop: 8, marginBottom: 20 },

    // Pro badge inline
    proBadgeInline: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: "rgba(245, 158, 11, 0.15)",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "rgba(245, 158, 11, 0.3)",
    },
    proBadgeInlineText: {
        fontSize: 10,
        fontWeight: "800",
        color: "#F59E0B",
        letterSpacing: 0.5,
    },
});
