import { useTranslation } from "react-i18next";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { SHEET } from "../../theme/sheet";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { PickerGrid } from "../shop/PickerGrid";
import { ItemTile } from "../shop/ItemTile";
import { useItemUnlock, type UnlockableItem } from "../../hooks/useItemUnlock";
import { track } from "../../services/trackEvents";
import type { UnlockKind } from "../../services/economyService";

export interface Dance {
    id: string;
    name: string;
    file_url: string;
    thumbnail_url: string | null;
    music_url: string | null;
    unlock_type: UnlockKind;
    price_ruby: number;
    tier: string | null;
    unlock_at_level?: number | null;
}

interface Props {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    currentDanceId: string | null;
    onSelect: (dance: Dance) => void;
    isPro: boolean;
    /**
     * The free-3D trial is running. She is on screen in 3D right now, so the
     * blanket "dancing is PRO" gate is wrong for these few minutes — the whole
     * point of the trial is to show what 3D does.
     */
    trialActive?: boolean;
    userId?: string;
    onOpenSubscription: () => void;
    onOpenQuests: () => void;
    /** Bond with the character on screen: gates `unlock_at_level`. */
    bondLevel?: number;
    bondProgress?: number | null;
    characterName?: string;
    onOpenBond?: () => void;
    sceneImage?: string | null;
}

/** Catalogue rarely changes; keep it for the session once fetched. */
let cachedDances: Dance[] | null = null;

/**
 * Dance picker (Yuuki's DancePicker): the catalogue lives in `dances`, each
 * with its own unlock type. Picking one plays its FBX by URL in the viewer.
 */
export default function DanceSheet(p: Props) {
    const { t } = useTranslation();
    const sheetRef = useRef<BottomSheetRef>(null);
    const [dances, setDances] = useState<Dance[]>(cachedDances ?? []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: err } = await supabase
                .from("dances")
                .select("id, name, file_url, thumbnail_url, music_url, unlock_type, price_ruby, tier, unlock_at_level")
                .eq("available", true)
                .order("sort_order");
            if (err) throw err;
            cachedDances = (data ?? []) as Dance[];
            setDances(cachedDances);
        } catch (e: any) {
            setError(e?.message ?? "load failed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!p.isOpened) return;
        track.danceSheetView();
        if (!cachedDances) load();
    }, [p.isOpened]);

    /** PRO, or the free-3D trial while it lasts. */
    const canDance = p.isPro || !!p.trialActive;

    const close = useCallback(() => {
        p.onIsOpenedChange(false);
        sheetRef.current?.dismiss();
    }, [p.onIsOpenedChange]);

    const unlock = useItemUnlock({
        isPro: p.isPro,
        userId: p.userId,
        bondLevel: p.bondLevel,
        bondProgress: p.bondProgress,
        characterName: p.characterName,
        onOpenBond: p.onOpenBond,
        placement: "dance",
        adBody: t("ads.gate_body_dance"),
        onOpenPaywall: () => {
            close();
            setTimeout(p.onOpenSubscription, 300);
        },
        onOpenQuests: () => {
            close();
            setTimeout(p.onOpenQuests, 450);
        },
        closeSheet: close,
        kind: "dance",
    });

    const toItem = (d: Dance): UnlockableItem => ({
        type: "dance",
        id: d.id,
        unlock: d.unlock_type,
        tier: d.tier,
        unlockAtLevel: d.unlock_at_level,
        price: d.price_ruby,
        name: d.name,
        image: d.thumbnail_url,
    });

    const play = (d: Dance) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        close();
        p.onSelect(d);
    };

    return (
        <BottomSheet
            ref={sheetRef}
            isOpened={p.isOpened}
            onIsOpenedChange={p.onIsOpenedChange}
            title={t("dance.title")}
            subtitle={t("dance.subtitle")}
            sceneImage={p.sceneImage ?? null}
            detents={[0.85, 0.95]}
        >
            {/* Dancing only happens on the 3D model, and 3D is PRO. Owning a
                dance without PRO would buy something that cannot be played, so
                the grid is disabled and says why instead of selling first and
                disappointing after. */}
            {!p.isPro && !p.trialActive && (
                <Pressable
                    onPress={() => {
                        close();
                        setTimeout(p.onOpenSubscription, 300);
                    }}
                    style={({ pressed }) => [styles.proNote, pressed && { opacity: 0.9 }]}
                >
                    <Ionicons name="lock-closed" size={15} color={SHEET.gold} />
                    <Text style={styles.proNoteText}>{t("dance.pro_required")}</Text>
                    <LinearGradient colors={SHEET.goldGradient} style={styles.proNoteCta}>
                        <Text style={styles.proNoteCtaText}>PRO</Text>
                    </LinearGradient>
                </Pressable>
            )}

            {!p.isPro && p.trialActive && (
                <View style={styles.proNote}>
                    <Ionicons name="sparkles" size={15} color={SHEET.accent} />
                    <Text style={styles.proNoteText}>{t("dance.trial_note")}</Text>
                </View>
            )}

            <PickerGrid
                items={dances}
                loading={loading}
                error={error}
                onRetry={load}
                emptyText={t("dance.none")}
                selectedId={p.currentDanceId}
                visible={p.isOpened}
                renderTile={(d, width) => {
                    const lock = unlock.lockOf(toItem(d));
                    return (
                        <ItemTile
                            width={width}
                            name={d.name}
                            image={d.thumbnail_url}
                            placeholderIcon={d.unlock_type === "pro" ? "diamond" : "musical-notes"}
                            lock={lock}
                            price={d.price_ruby}
                            requiredLevel={d.unlock_at_level ?? 1}
                            proTier={(d.tier ?? "free") === "pro"}
                            selected={d.id === p.currentDanceId}
                            disabled={!canDance || (!p.isPro && lock !== "free")}
                            onPress={() => {
                                // Selling a dance during the trial would sell
                                // something that stops working in two minutes.
                                if (!canDance || (!p.isPro && lock !== "free")) {
                                    close();
                                    return setTimeout(p.onOpenSubscription, 300);
                                }
                                unlock.request(toItem(d), () => play(d));
                            }}
                            topLeft={
                                d.music_url ? (
                                    <View style={styles.music}>
                                        <Ionicons name="musical-notes" size={11} color="#fff" />
                                    </View>
                                ) : undefined
                            }
                        />
                    );
                }}
            />
            {unlock.dialogs}
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    proNote: {
        flexDirection: "row", alignItems: "center", gap: 8,
        marginHorizontal: 16, marginBottom: 10,
        paddingHorizontal: 12, paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: "rgba(255,196,0,0.10)",
        borderWidth: 1, borderColor: "rgba(255,196,0,0.35)",
    },
    proNoteText: { flex: 1, color: "rgba(255,255,255,0.86)", fontSize: 12.5, fontWeight: "600", lineHeight: 17 },
    proNoteCta: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    proNoteCtaText: { color: "#2A1A00", fontSize: 11.5, fontWeight: "900", letterSpacing: 0.4 },
    music: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FF4D8D", alignItems: "center", justifyContent: "center" },
});
