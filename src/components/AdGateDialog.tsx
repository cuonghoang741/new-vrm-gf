import React from "react";
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { IconPlayerPlayFilled, IconCrown } from "@tabler/icons-react-native";

const ACCENT = "#FF3D7F";
const ACCENT_SOFT = "#FF7AA8";
const GOLD = "#F2C14E";
const SURFACE = "#1A1130";

interface Props {
    visible: boolean;
    /** What the ad unlocks, e.g. the character's name. */
    body: string;
    onWatch: () => void;
    onUpgrade: () => void;
    onCancel: () => void;
}

/**
 * The "watch an ad to switch" prompt.
 *
 * Replaces Alert.alert, which rendered a stock system box with no styling and
 * put the three actions in an order the OS chose. This keeps the choice
 * ordered by what we want tapped — watch, then upgrade, then cancel — and
 * gives the ad option enough weight to read as the default.
 *
 * The "Watch ad" label carries a play glyph on purpose: the rewarded-ad
 * trigger has to be visibly marked as leading to an ad, which a plain button
 * does not do.
 */
export function AdGateDialog({
    visible,
    body,
    onWatch,
    onUpgrade,
    onCancel,
}: Props) {
    const { t } = useTranslation();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={onCancel}
        >
            <View style={styles.backdrop}>
                {/* Tapping outside cancels, matching the dismiss affordance
                    people expect from a sheet. */}
                <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

                <BlurView intensity={28} tint="dark" style={styles.card}>
                    <View style={styles.badge}>
                        <LinearGradient
                            colors={[ACCENT_SOFT, ACCENT]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.badgeFill}
                        >
                            <IconPlayerPlayFilled size={26} color="#fff" />
                        </LinearGradient>
                    </View>

                    <Text style={styles.title}>{t("ads.gate_title")}</Text>
                    <Text style={styles.body}>{body}</Text>

                    <Pressable
                        onPress={onWatch}
                        style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                    >
                        <LinearGradient
                            colors={[ACCENT_SOFT, ACCENT]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.primary}
                        >
                            <IconPlayerPlayFilled size={16} color="#fff" />
                            <Text style={styles.primaryText}>{t("ads.watch_ad")}</Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable
                        onPress={onUpgrade}
                        style={({ pressed }) => [
                            styles.secondary,
                            pressed && { opacity: 0.85 },
                        ]}
                    >
                        <IconCrown size={16} color={GOLD} />
                        <Text style={styles.secondaryText}>
                            {t("common.upgrade_pro")}
                        </Text>
                    </Pressable>

                    <Pressable onPress={onCancel} hitSlop={8} style={styles.cancel}>
                        <Text style={styles.cancelText}>{t("common.cancel")}</Text>
                    </Pressable>
                </BlurView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(6, 3, 16, 0.62)",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
    },
    card: {
        width: "100%",
        maxWidth: 360,
        borderRadius: 26,
        overflow: "hidden",
        paddingHorizontal: 22,
        paddingTop: 26,
        paddingBottom: 16,
        alignItems: "center",
        backgroundColor: SURFACE + "E6",
        borderWidth: 1,
        borderColor: "rgba(201,166,255,0.22)",
    },
    badge: { marginBottom: 16 },
    badgeFill: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: ACCENT,
        shadowOpacity: 0.55,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    title: {
        color: "#F4ECFB",
        fontSize: 19,
        fontWeight: "800",
        textAlign: "center",
    },
    body: {
        color: "rgba(244,236,251,0.66)",
        fontSize: 14,
        lineHeight: 20,
        textAlign: "center",
        marginTop: 8,
        marginBottom: 22,
    },
    primary: {
        height: 52,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 28,
        minWidth: 260,
    },
    primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    secondary: {
        height: 46,
        marginTop: 10,
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 24,
        minWidth: 260,
        borderWidth: 1,
        borderColor: "rgba(242,193,78,0.42)",
    },
    secondaryText: { color: GOLD, fontSize: 15, fontWeight: "700" },
    cancel: { marginTop: 12, paddingVertical: 8 },
    cancelText: {
        color: "rgba(244,236,251,0.45)",
        fontSize: 14,
        fontWeight: "600",
    },
});
