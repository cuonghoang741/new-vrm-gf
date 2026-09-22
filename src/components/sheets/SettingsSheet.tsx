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
    IconShieldCheck,
    IconLanguage,
    IconCube,
} from "@tabler/icons-react-native";
import { PrivilegeAuthDialog } from "./PrivilegeAuthDialog";
import { LanguagePickerDialog } from "./LanguagePickerDialog";
import { LinearGradient } from "expo-linear-gradient";
import RubyIcon from "../icons/RubyIcon";
import { useRuby } from "../../services/rubyStore";
import {
    DEFAULT_QUALITY, QUALITY_LABELS, loadQuality, setQuality, type RenderQuality,
} from "../../services/renderQuality";
import { LANGUAGE_META, currentLang } from "../../i18n";
import { useSubscription } from "../../contexts/SubscriptionContext";
import * as Haptics from "expo-haptics";
import { analyticsService } from "../../services/AnalyticsService";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { supabase } from "../../config/supabase";
import { authManager } from "../../services";

interface SettingsSheetProps {
    /** Selected character's picture, blurred behind the sheet (Yuuki style). */
    sceneImage?: string | null;
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
    sceneImage,
}, ref) => {
    const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
    const { isPro, isPrivileged, refreshPrivilege, signOutPrivilege } = useSubscription();
    const [privOpen, setPrivOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const ruby = useRuby() ?? 0;
    const [quality, setQualityState] = useState<RenderQuality>(DEFAULT_QUALITY);
    useEffect(() => { loadQuality().then(setQualityState); }, []);
    const cycleQuality = useCallback(() => {
        const next = ((quality + 1) % 3) as RenderQuality;
        setQualityState(next);
        void setQuality(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [quality]);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

    // Edit profile sub-sheet
    const editProfileRef = useRef<BottomSheetRef>(null);

    useImperativeHandle(ref, () => ({
        present: (index?: number) => sheetRef.current?.present(index),
        dismiss: () => sheetRef.current?.dismiss(),
    }));


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



    // The account card shows the email, so the avatar initial comes from it.
    const initial = userEmail?.charAt(0)?.toUpperCase() ?? "?";

    return (
        <>
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title={t("set.title")}
                sceneImage={sceneImage ?? null}
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
                        {/* ─── Account card: plan, email, ruby ───
                            No longer tappable — editing the profile is gone, and
                            a chevron on a card that does nothing is a dead end.
                            The name row now carries the plan, which is the thing
                            people open settings to check. */}
                        <View style={styles.profileCard}>
                            <View style={styles.profileLeft}>
                                <View style={styles.profileAvatarFallback}>
                                    <Text style={styles.profileAvatarText}>{initial}</Text>
                                </View>
                                <View style={styles.profileInfo}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                        {isPro ? (
                                            <View style={styles.proBadgeInline}>
                                                <IconCrown size={12} color="#F59E0B" fill="#F59E0B" />
                                                <Text style={styles.proBadgeInlineText}>PRO</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.freeBadge}>
                                                <Text style={styles.freeBadgeText}>{t("set.plan_free")}</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.profileEmail} numberOfLines={1}>
                                        {userEmail ?? t("set.unknown")}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.rubyPill}>
                                <RubyIcon size={14} color="#FF4D6D" />
                                <Text style={styles.rubyPillText}>{ruby.toLocaleString()}</Text>
                            </View>
                        </View>

                        {/* Upgrade card, only while they are on Free. */}
                        {!isPro && (
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onOpenSubscription?.();
                                }}
                            >
                                <LinearGradient
                                    colors={["#FF4D8D", "#9B4DFF"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.upgradeCard}
                                >
                                    <View style={styles.upgradeIcon}>
                                        <IconCrown size={22} color="#FFD700" fill="#FFD700" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.upgradeTitle}>{t("set.upgrade_pro")}</Text>
                                        <Text style={styles.upgradeBody}>{t("set.pro_desc")}</Text>
                                    </View>
                                    <IconChevronRight size={20} color="rgba(255,255,255,0.9)" />
                                </LinearGradient>
                            </TouchableOpacity>
                        )}

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
                                {/* Tapping cycles high → balanced → saver. Three
                                    options do not deserve a modal. */}
                                <SettingItem
                                    icon={<IconCube size={20} color="#34D399" />}
                                    label={t("set.quality")}
                                    subtitle={t(QUALITY_LABELS[quality])}
                                    onPress={cycleQuality}
                                />
                                <View style={styles.separator} />
                                {/* The first-run language screen promises this row exists. */}
                                <SettingItem
                                    icon={<IconLanguage size={20} color="#60A5FA" />}
                                    label={t("set.language")}
                                    subtitle={LANGUAGE_META[currentLang()].name}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setLangOpen(true);
                                    }}
                                />
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

                        {/* ─── Security: Privilege Authenticator (reviewer login) ─── */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t("priv.section")}</Text>
                            <View style={styles.sectionCard}>
                                <SettingItem
                                    icon={<IconShieldCheck size={20} color="#4DD0A0" />}
                                    label="Privilege Authenticator"
                                    subtitle={isPrivileged ? t("priv.active") : undefined}
                                    onPress={isPrivileged ? () => { } : () => setPrivOpen(true)}
                                    showChevron={!isPrivileged}
                                />
                                {isPrivileged && (
                                    <>
                                        <View style={styles.separator} />
                                        <SettingItem
                                            icon={<IconLogout size={20} color="#FF4D4D" />}
                                            label={t("priv.logout")}
                                            onPress={() => {
                                                Alert.alert(t("priv.logout"), t("priv.logout_confirm"), [
                                                    { text: t("common.cancel"), style: "cancel" },
                                                    { text: t("priv.logout"), style: "destructive", onPress: () => signOutPrivilege() },
                                                ]);
                                            }}
                                            danger
                                            showChevron={false}
                                        />
                                    </>
                                )}
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
                {/* Inside the sheet: on iOS a Modal rendered outside it cannot be
                    presented while the (natively presented) sheet is up. */}
                <LanguagePickerDialog visible={langOpen} onClose={() => setLangOpen(false)} />
                <PrivilegeAuthDialog
                    visible={privOpen}
                    onClose={() => setPrivOpen(false)}
                    onSuccess={async () => {
                        setPrivOpen(false);
                        await refreshPrivilege();
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert("✅", t("priv.success"));
                    }}
                />
            </BottomSheet>


            {/* ─── Edit Profile sub-sheet ─── */}
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
    freeBadge: {
        backgroundColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    },
    freeBadgeText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
    rubyPill: {
        flexDirection: "row", alignItems: "center", gap: 5,
        backgroundColor: "rgba(255,77,109,0.14)",
        borderWidth: 1, borderColor: "rgba(255,77,109,0.3)",
        paddingHorizontal: 12, height: 32, borderRadius: 16,
    },
    rubyPillText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
    upgradeCard: {
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderRadius: 18, marginTop: 12,
    },
    upgradeIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.22)",
        alignItems: "center", justifyContent: "center",
    },
    upgradeTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
    upgradeBody: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, marginTop: 2 },
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
