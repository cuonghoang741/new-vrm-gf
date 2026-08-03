import { useTranslation } from "react-i18next";
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
    ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { openBrowserSafe } from "../../utils/openBrowserSafe";
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
import { analyticsService } from "../../services/AnalyticsService";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { supabase } from "../../config/supabase";
import { authManager } from "../../services";
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
    const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
    const { isPro } = useSubscription();
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
        Alert.alert(t("set.sign_out"), t("set.signout_confirm"), [
            { text: t("common.cancel"), style: "cancel" },
            {
                text: t("set.sign_out"),
                style: "destructive",
                onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    analyticsService.logSignOut();
                    await supabase.auth.signOut();
                    onIsOpenedChange(false);
                    sheetRef.current?.dismiss();
                },
            },
        ]);
    }, [onIsOpenedChange]);

    const handleDeleteAccount = useCallback(() => {
        Alert.alert(
            t("set.delete_account"),
            t("set.delete_confirm_body"),
            [
                { text: t("common.cancel"), style: "cancel" },
                {
                    text: t("common.delete"),
                    style: "destructive",
                    onPress: () => {
                        Alert.alert(t("set.delete_final_title"), t("set.delete_final_body"), [
                            { text: t("common.cancel"), style: "cancel" },
                            {
                                text: t("set.confirm_delete"),
                                style: "destructive",
                                onPress: async () => {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                    try {
                                        setIsDeletingAccount(true);
                                        analyticsService.logDeleteAccount();
                                        await authManager.deleteAccountLocally(async () => {
                                            onIsOpenedChange(false);
                                            sheetRef.current?.dismiss();
                                        });
                                    } catch (e: any) {
                                        console.error("Delete account error:", e);
                                        Alert.alert(t("common.error"), `Failed to delete account. Details: ${e.message}`);
                                    } finally {
                                        setIsDeletingAccount(false);
                                    }
                                },
                            },
                        ]);
                    },
                },
            ]
        );
    }, [onIsOpenedChange]);

    const handleResetOnboarding = useCallback(() => {
        Alert.alert(t("set.reset_onboarding"), t("set.reset_confirm"), [
            { text: t("common.cancel"), style: "cancel" },
            {
                text: t("set.reset"),
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
            t("set.report_bug_title"),
            t("set.report_prompt"),
            [
                { text: t("common.cancel"), style: "cancel" },
                {
                    text: t("common.submit"),
                    onPress: async (description?: string) => {
                        if (!description?.trim()) {
                            Alert.alert(t("set.oops"), t("set.report_empty"));
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
                            analyticsService.logError('bug_report', description.trim());
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            Alert.alert(t("set.report_thanks_title"), t("set.report_thanks_body"));
                        } catch {
                            Alert.alert(t("common.error"), t("set.report_fail"));
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
                title={t("set.title")}
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
                                            {displayName ?? t("set.set_name")}
                                        </Text>
                                        {isPro && (
                                            <View style={styles.proBadgeInline}>
                                                <IconCrown size={12} color="#F59E0B" fill="#F59E0B" />
                                                <Text style={styles.proBadgeInlineText}>PRO</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.profileEmail} numberOfLines={1}>
                                        {userEmail ?? t("set.unknown")}
                                    </Text>
                                </View>
                            </View>
                            <IconChevronRight size={20} color="rgba(255,255,255,0.3)" />
                        </TouchableOpacity>

                        {/* ─── General ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t("set.general")}</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={isPro ? <IconCrown size={20} color="#F59E0B" fill="#F59E0B" /> : <IconStar size={20} color="#F59E0B" />}
                                    label={isPro ? t("set.pro_active") : t("set.upgrade_pro")}
                                    subtitle={isPro ? t("set.pro_desc_active") : t("set.pro_desc")}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onOpenSubscription?.();
                                    }}
                                />
                                <View style={styles.separator} />
                                {/* <SettingItem
                                    icon={<IconRefresh size={20} color="#60A5FA" />}
                                    label={t("set.reset_onboarding")}
                                    subtitle={t("set.reset_onboarding_desc")}
                                    onPress={handleResetOnboarding}
                                /> */}
                            </View>
                        </View>

                        {/* ─── Support ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t("set.support")}</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={<IconBug size={20} color="#F472B6" />}
                                    label={t("set.report_bug")}
                                    subtitle={t("set.report_bug_desc")}
                                    onPress={handleReportBug}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconShieldLock size={20} color="#34D399" />}
                                    label={t("signin.privacy")}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        analyticsService.logEvent('open_privacy_policy');
                                        openBrowserSafe("https://personal-muse-3d.lovable.app/privacy");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label={t("signin.tos")}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        openBrowserSafe("https://personal-muse-3d.lovable.app/terms");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label={t("signin.eula")}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        openBrowserSafe("https://personal-muse-3d.lovable.app/eula");
                                    }}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={<IconInfoCircle size={20} color="#93C5FD" />}
                                    label={t("set.app_version")}
                                    subtitle="1.0.0"
                                    onPress={() => { }}
                                    showChevron={false}
                                />
                            </View>
                        </View>

                        {/* ─── Account ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t("set.account")}</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={<IconLogout size={20} color="#F59E0B" />}
                                    label={t("set.sign_out")}
                                    onPress={handleSignOut}
                                    showChevron={false}
                                />
                                <View style={styles.separator} />
                                <SettingItem
                                    icon={isDeletingAccount ? <ActivityIndicator size="small" color="#EF4444" /> : <IconTrash size={20} color="#EF4444" />}
                                    label={isDeletingAccount ? t("set.deleting") : t("set.delete_account")}
                                    subtitle={t("set.delete_account_desc")}
                                    onPress={isDeletingAccount ? () => { } : handleDeleteAccount}
                                    danger
                                    showChevron={!isDeletingAccount}
                                />
                            </View>
                        </View>

                        {/* <Text style={styles.footer}>Made with ❤️ </Text> */}
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
        backgroundColor: "rgba(255, 111, 165, 0.12)", borderRadius: 20,
        padding: 16, marginBottom: 24,
        borderWidth: 1, borderColor: "rgba(255, 111, 165, 0.2)",
    },
    profileLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    profileAvatar: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
    profileAvatarFallback: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: "#FF6FA5", alignItems: "center", justifyContent: "center",
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
