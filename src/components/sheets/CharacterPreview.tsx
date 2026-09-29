import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import VRMViewer, { type VRMViewerHandle } from "../VRMViewer";
import { useVrmPreviewLoader } from "../../hooks/useVrmPreviewLoader";
import { Live2DView, type Live2DEvent, type Live2DHandle } from "../../live2d/Live2DView";
import { parseLive2d } from "../../live2d/types";
import { pick } from "../../live2d/reactions";
import { currentLang } from "../../i18n";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";

/** Radians per second: one slow turn about every 18 s. */
const TURNTABLE_SPEED = 0.35;

export type PreviewCharacter = {
    id: string;
    name: string;
    description: string | null;
    avatar?: string | null;
    thumbnail_url: string | null;
    base_model_url?: string | null;
    backgrounds?: { image?: string | null } | null;
    data?: {
        model_type?: string;
        live2d?: unknown;
        old?: number;
        height_cm?: number;
        rounds?: { r1: number; r2: number; r3: number };
        occupation?: string;
        characteristics?: string;
        hobbies?: string[];
        dislikes?: string[];
        bio?: string;
        bio_vi?: string;
        birthday?: string;
    };
};

type Props = {
    visible: boolean;
    character: PreviewCharacter | null;
    /** What the sheet's own button says for her: start chatting, unlock, buy. */
    ctaLabel: string;
    ctaIcon: React.ComponentProps<typeof Ionicons>["name"];
    locked: boolean;
    /** PRO / ruby tags beside her name, same as the sheet's hero. */
    showPro: boolean;
    rubyPrice: number;
    onPrimary: () => void;
    onClose: () => void;
};

/**
 * Full-screen look at a character before choosing her: the real model, not a
 * picture of it, above everything there is to know about her.
 *
 * VRM characters turn slowly on a turntable and can be turned by hand. It is a
 * turntable, not a free camera: orbiting her on the play screen is the Lv5
 * reward, and the preview must not give it away. Live2D characters react to a
 * tap here the way they do on the play screen. It costs no touch and earns no
 * XP, since this is her audition, not the relationship.
 */
export function CharacterPreview({
    visible, character, ctaLabel, ctaIcon, locked, showPro, rubyPrice, onPrimary, onClose,
}: Props) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const live2d = character ? parseLive2d(character.data) : null;
    const background = character?.backgrounds?.image ?? null;
    const [modelShown, setModelShown] = useState(false);

    // ─── VRM ───
    const vrmRef = useRef<VRMViewerHandle>(null);
    const [vrmReady, setVrmReady] = useState(false);
    const preview = useVrmPreviewLoader(vrmRef, visible && !live2d, vrmReady);
    const modelUrl = !live2d && character?.base_model_url?.toLowerCase().endsWith(".vrm")
        ? character.base_model_url
        : null;

    useEffect(() => { setModelShown(false); }, [character?.id, visible]);
    // Closing unmounts the page, so the next open starts with a new one that
    // has to report ready again before it is handed a model.
    useEffect(() => { if (!visible) setVrmReady(false); }, [visible]);

    useEffect(() => {
        if (!visible || live2d || !vrmReady || !modelUrl) return;
        if (background) vrmRef.current?.setBackgroundImage(background);
        preview.showModel(modelUrl);
        vrmRef.current?.setTurntable(TURNTABLE_SPEED);
    }, [visible, live2d, vrmReady, modelUrl, background, preview.showModel]);

    // She says hello once she is in, then settles into her resting pose;
    // greetings loop, so the hand-off back to idle has to be explicit.
    const greetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // She arrives in the bind pose and only then gets her first clip, so the
    // cover stays until that clip is playing (or 6 s, if it never reports).
    const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onVrmLoaded = useCallback(() => {
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => setModelShown(true), 6000);
        preview.onShown([]);
        vrmRef.current?.playRandomGreeting();
        if (greetTimer.current) clearTimeout(greetTimer.current);
        greetTimer.current = setTimeout(() => vrmRef.current?.stopAnimation(), 3500);
    }, [preview.onShown]);
    const onViewerMessage = useCallback((msg: string) => {
        if (msg !== "animationApplied") return;
        if (revealTimer.current) clearTimeout(revealTimer.current);
        setModelShown(true);
    }, []);
    useEffect(() => () => {
        if (greetTimer.current) clearTimeout(greetTimer.current);
        if (revealTimer.current) clearTimeout(revealTimer.current);
    }, []);

    // ─── Live2D ───
    const l2dRef = useRef<Live2DHandle>(null);
    const onLive2dEvent = useCallback((e: Live2DEvent) => {
        if (!live2d) return;
        if (e.type === "ready") l2dRef.current?.load(live2d);
        else if (e.type === "loaded") {
            setModelShown(true);
            const hello = live2d.actionMap.wave ?? live2d.emotionMap.happy;
            if (hello) l2dRef.current?.react(hello);
            l2dRef.current?.effect("sparkle");
        } else if (e.type === "tap" && e.areas?.length) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            const r = live2d.emotionMap[pick(["happy", "shy", "love"] as const)];
            if (r) l2dRef.current?.react(r);
            l2dRef.current?.effect(pick(["hearts", "blush", "music"] as const));
        } else if (e.type === "stroke" && e.progress >= 1) {
            l2dRef.current?.effect("hearts");
        }
    }, [live2d]);

    if (!character) return null;

    const d = character.data ?? {};
    const lang = currentLang();
    const about = (lang === "vi" && d.bio_vi) || d.bio || d.characteristics || null;
    const facts: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }[] = [];
    if (d.old != null) facts.push({ icon: "sparkles-outline", text: t("char.age_years", { n: d.old }) });
    if (d.height_cm != null) facts.push({ icon: "resize-outline", text: `${d.height_cm} cm` });
    if (d.occupation) facts.push({ icon: "briefcase-outline", text: d.occupation });
    if (d.birthday) {
        const [mm, dd] = d.birthday.split("-");
        facts.push({ icon: "gift-outline", text: t("char.birthday", { d: `${dd}/${mm}` }) });
    }
    if (d.rounds) facts.push({ icon: "body-outline", text: `${d.rounds.r1}-${d.rounds.r2}-${d.rounds.r3}` });
    const hobbies = d.hobbies ?? [];
    const dislikes = d.dislikes ?? [];

    return (
        <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
            <View style={styles.root}>
                {/* ─── Stage ─── */}
                <View style={styles.stage}>
                    {live2d ? (
                        <>
                            {!!background && (
                                <Image source={{ uri: background }} style={StyleSheet.absoluteFill} contentFit="cover" />
                            )}
                            <Live2DView ref={l2dRef} onEvent={onLive2dEvent} />
                        </>
                    ) : (
                        <VRMViewer
                            ref={vrmRef}
                            transparent={false}
                            onReady={() => setVrmReady(true)}
                            onModelLoaded={onVrmLoaded}
                            onMessage={onViewerMessage}
                            {...preview.viewerSource}
                        />
                    )}

                    {/* Her picture holds the stage until the model is in, so the
                        screen is never an empty box during a 15 MB download. */}
                    {!modelShown && (
                        <View style={StyleSheet.absoluteFill} pointerEvents="none">
                            <Image
                                source={{ uri: character.avatar ?? character.thumbnail_url ?? undefined }}
                                style={StyleSheet.absoluteFill}
                                contentFit="cover"
                                contentPosition="top"
                            />
                            <View style={styles.loadingVeil}>
                                <ActivityIndicator color="#fff" />
                                <Text style={styles.loadingText}>{t("char.loading_model")}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* ─── Top bar ─── */}
                <LinearGradient
                    colors={["rgba(15,10,30,0.75)", "transparent"]}
                    style={[styles.topScrim, { height: 120 + insets.top }]}
                    pointerEvents="none"
                />
                <View style={[styles.topBar, { top: insets.top + 10 }]}>
                    <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
                        <Ionicons name="close" size={22} color="#fff" />
                    </Pressable>
                    <View style={styles.modePill}>
                        <LinearGradient
                            colors={live2d ? ["#FF6FA3", "#A56BFF"] : ["#7C5CFF", "#4FA3FF"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.modePillBg}
                        >
                            <Text style={styles.modePillText}>{live2d ? "✦ LIVE2D" : "3D"}</Text>
                        </LinearGradient>
                    </View>
                </View>
                {modelShown && (
                    <View style={[styles.hint, { top: insets.top + 62 }]} pointerEvents="none">
                        <Ionicons name={live2d ? "hand-left-outline" : "swap-horizontal"} size={13} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.hintText}>{live2d ? t("char.tap_to_react") : t("char.drag_to_turn")}</Text>
                    </View>
                )}

                {/* ─── About her ─── */}
                <LinearGradient
                    colors={["transparent", "rgba(15,10,30,0.88)", SHEET.bgBottom]}
                    locations={[0, 0.35, 0.7]}
                    style={styles.bottomScrim}
                    pointerEvents="none"
                />
                <View style={[styles.card, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{character.name}</Text>
                        {showPro && (
                            <View style={styles.proPill}><Text style={styles.proPillText}>PRO</Text></View>
                        )}
                        {rubyPrice > 0 && (
                            <View style={styles.rubyPill}>
                                <RubyIcon size={12} color="#fff" />
                                <Text style={styles.rubyPillText}>{rubyPrice}</Text>
                            </View>
                        )}
                    </View>
                    {!!character.description && (
                        <Text style={styles.tagline} numberOfLines={2}>{character.description}</Text>
                    )}

                    <ScrollView style={styles.details} contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
                        {facts.length > 0 && (
                            <View style={styles.chips}>
                                {facts.map((f) => (
                                    <View key={f.text} style={styles.chip}>
                                        <Ionicons name={f.icon} size={12} color="rgba(255,255,255,0.7)" />
                                        <Text style={styles.chipText}>{f.text}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                        {!!about && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t("char.personality")}</Text>
                                <Text style={styles.body}>{about}</Text>
                            </View>
                        )}
                        {hobbies.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t("char.likes")}</Text>
                                <View style={styles.chips}>
                                    {hobbies.map((h) => (
                                        <View key={h} style={[styles.chip, styles.likeChip]}>
                                            <Text style={styles.likeText}>♥ {h}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                        {dislikes.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>{t("char.dislikes")}</Text>
                                <Text style={styles.body}>{dislikes.join(" · ")}</Text>
                            </View>
                        )}
                    </ScrollView>

                    <Pressable onPress={onPrimary} style={({ pressed }) => [styles.ctaWrap, pressed && { opacity: 0.9 }]}>
                        <LinearGradient
                            colors={locked ? [SHEET.disabled, SHEET.disabled] : SHEET.accentGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.cta}
                        >
                            <Ionicons name={ctaIcon} size={18} color="#fff" />
                            <Text style={styles.ctaText}>{ctaLabel}</Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SHEET.bgBottom },
    stage: { position: "absolute", left: 0, right: 0, top: 0, bottom: "32%" },
    loadingVeil: {
        position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
        backgroundColor: "rgba(15,10,30,0.45)",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    loadingText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
    topScrim: { position: "absolute", left: 0, right: 0, top: 0 },
    topBar: {
        position: "absolute", left: 16, right: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    close: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    modePill: { borderRadius: 12, overflow: "hidden" },
    modePillBg: { paddingHorizontal: 12, paddingVertical: 6 },
    modePillText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
    hint: {
        position: "absolute", alignSelf: "center",
        flexDirection: "row", alignItems: "center", gap: 6,
        paddingHorizontal: 12, height: 28, borderRadius: 14,
        backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    hintText: { color: "rgba(255,255,255,0.88)", fontSize: 12.5, fontWeight: "600" },
    bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "58%" },
    card: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "50%", paddingHorizontal: 20, paddingTop: 8 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    name: { color: SHEET.text, fontSize: 32, fontWeight: "900", letterSpacing: 0.2, flexShrink: 1 },
    proPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: SHEET.gold },
    proPillText: { color: "#2A1A00", fontSize: 11, fontWeight: "900" },
    rubyPill: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(214,51,108,0.92)",
    },
    rubyPillText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    tagline: { color: SHEET.textMuted, fontSize: 14.5, lineHeight: 20, marginTop: 6 },
    details: { marginTop: 12, flexGrow: 0 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 10, height: 28, borderRadius: 14,
        backgroundColor: SHEET.card, borderWidth: 1, borderColor: SHEET.cardBorder,
    },
    chipText: { color: "rgba(255,255,255,0.85)", fontSize: 12.5, fontWeight: "600" },
    likeChip: { backgroundColor: "rgba(255,77,141,0.12)", borderColor: "rgba(255,77,141,0.35)" },
    likeText: { color: "#FFC2DA", fontSize: 12.5, fontWeight: "600" },
    section: { marginTop: 16 },
    sectionTitle: {
        color: SHEET.textFaint, fontSize: 11.5, fontWeight: "800",
        letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 8,
    },
    body: { color: "rgba(255,255,255,0.82)", fontSize: 14.5, lineHeight: 21 },
    ctaWrap: { marginTop: 14 },
    cta: {
        height: 54, borderRadius: 18,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    },
    ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
