import React, { useEffect, useState } from "react";
import {
    ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
    ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SHEET } from "../../theme/sheet";
import {
    REPORT_REASONS, submitReport, type ReportKind, type ReportReason,
} from "../../services/reportService";

/**
 * "Report this" — the one dialog behind every flag in the app.
 *
 * Deliberately the same sheet for a chat message, a photo and a character, so
 * there is one thing to translate, one thing to keep honest about what happens
 * next, and one place a reviewer has to look. It promises only what the app
 * actually does: the report is filed, and the thing stops being shown to the
 * person who reported it.
 */
export function ReportDialog({
    visible,
    kind,
    targetId,
    characterId,
    snapshot,
    onClose,
    onReported,
}: {
    visible: boolean;
    kind: ReportKind;
    /** The message or media id being flagged. */
    targetId?: string | null;
    characterId?: string | null;
    /** The text or URL the user saw, filed with the report. */
    snapshot?: string | null;
    onClose: () => void;
    /** Fired after a successful report, so the caller can hide the content. */
    onReported?: (targetId?: string | null) => void;
}) {
    const { t } = useTranslation();
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setReason(null);
        setNote("");
        setBusy(false);
        setDone(false);
        setError(null);
    }, [visible]);

    const send = async () => {
        if (!reason || busy) return;
        setBusy(true);
        setError(null);
        const res = await submitReport({ kind, reason, targetId, characterId, note, snapshot });
        setBusy(false);
        if (res.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setDone(true);
            onReported?.(targetId);
            return;
        }
        setError(
            res.error === "rate_limited" ? t("report.too_many") : t("report.failed")
        );
    };

    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={styles.backdrop}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={styles.card}>
                    {done ? (
                        <View style={styles.doneBox}>
                            <View style={[styles.doneRing, { alignSelf: "center" }]}>
                                <Ionicons name="checkmark" size={30} color={SHEET.success} />
                            </View>
                            <Text style={[styles.title, styles.doneTitle]}>{t("report.thanks_title")}</Text>
                            <Text style={[styles.body, styles.doneBody]}>{t("report.thanks_body")}</Text>
                            <Pressable onPress={onClose} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
                                <LinearGradient
                                    colors={SHEET.accentGradient}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.cta}
                                >
                                    <Text style={styles.ctaText}>{t("common.done")}</Text>
                                </LinearGradient>
                            </Pressable>
                        </View>
                    ) : (
                        <>
                            <View style={styles.head}>
                                <Ionicons name="flag" size={18} color={SHEET.accent} />
                                <Text style={styles.title}>{t("report.title")}</Text>
                            </View>
                            <Text style={styles.body}>{t("report.body")}</Text>

                            <ScrollView
                                style={{ maxHeight: 268 }}
                                contentContainerStyle={{ paddingVertical: 6 }}
                                keyboardShouldPersistTaps="handled"
                            >
                                {REPORT_REASONS.map((r) => {
                                    const on = reason === r;
                                    return (
                                        <Pressable
                                            key={r}
                                            onPress={() => {
                                                Haptics.selectionAsync();
                                                setReason(r);
                                            }}
                                            style={[styles.row, on && styles.rowOn]}
                                        >
                                            <View style={[styles.radio, on && styles.radioOn]}>
                                                {on && <View style={styles.radioDot} />}
                                            </View>
                                            <Text style={[styles.rowText, on && { color: "#fff" }]}>
                                                {t(`report.reason.${r}`)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}

                                <TextInput
                                    value={note}
                                    onChangeText={setNote}
                                    placeholder={t("report.note_placeholder")}
                                    placeholderTextColor="rgba(255,255,255,0.35)"
                                    style={styles.note}
                                    multiline
                                    maxLength={500}
                                />
                            </ScrollView>

                            {!!error && <Text style={styles.error}>{error}</Text>}

                            <Pressable
                                onPress={send}
                                disabled={!reason || busy}
                                style={({ pressed }) => [pressed && { opacity: 0.9 }]}
                            >
                                <LinearGradient
                                    colors={reason ? SHEET.accentGradient : ["#3A3350", "#2E2942"]}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                    style={styles.cta}
                                >
                                    {busy ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={styles.ctaText}>{t("report.submit")}</Text>
                                    )}
                                </LinearGradient>
                            </Pressable>

                            <Pressable onPress={onClose} hitSlop={8} style={styles.later}>
                                <Text style={styles.laterText}>{t("common.cancel")}</Text>
                            </Pressable>
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(6,3,16,0.76)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    card: {
        width: "100%",
        maxWidth: 360,
        borderRadius: 26,
        backgroundColor: "#171026",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 14,
    },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { color: "#fff", fontSize: 18, fontWeight: "900" },
    doneTitle: { textAlign: "center" },
    doneBody: { textAlign: "center" },
    body: {
        color: "rgba(255,255,255,0.58)", fontSize: 13, lineHeight: 18, marginTop: 6,
    },
    row: {
        flexDirection: "row", alignItems: "center", gap: 11,
        paddingVertical: 11, paddingHorizontal: 12,
        borderRadius: 14, marginTop: 7,
        backgroundColor: "rgba(255,255,255,0.045)",
        borderWidth: 1, borderColor: "transparent",
    },
    rowOn: {
        backgroundColor: "rgba(255,77,141,0.12)",
        borderColor: "rgba(255,77,141,0.5)",
    },
    radio: {
        width: 19, height: 19, borderRadius: 10,
        borderWidth: 1.6, borderColor: "rgba(255,255,255,0.3)",
        alignItems: "center", justifyContent: "center",
    },
    radioOn: { borderColor: SHEET.accent },
    radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: SHEET.accent },
    rowText: { color: "rgba(255,255,255,0.8)", fontSize: 14.5, fontWeight: "600", flex: 1 },
    note: {
        marginTop: 12, minHeight: 74, maxHeight: 120,
        borderRadius: 14, padding: 12,
        backgroundColor: "rgba(255,255,255,0.045)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
        color: "#fff", fontSize: 14, textAlignVertical: "top",
    },
    error: { color: "#FF8A8A", fontSize: 13, marginTop: 10, textAlign: "center" },
    cta: {
        height: 50, borderRadius: 25,
        alignItems: "center", justifyContent: "center", marginTop: 16,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    later: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 16, marginTop: 2 },
    laterText: { color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: "600" },
    doneBox: { alignItems: "stretch", paddingVertical: 6 },
    doneRing: {
        width: 62, height: 62, borderRadius: 31,
        alignItems: "center", justifyContent: "center", marginBottom: 12,
        backgroundColor: "rgba(52,211,153,0.12)",
        borderWidth: 1.5, borderColor: "rgba(52,211,153,0.45)",
    },
});
