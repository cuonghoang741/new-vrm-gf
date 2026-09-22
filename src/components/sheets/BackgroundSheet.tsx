import { useTranslation } from "react-i18next";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { IconMoon, IconSun } from "@tabler/icons-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { PickerGrid } from "../shop/PickerGrid";
import { ItemTile } from "../shop/ItemTile";
import { useItemUnlock, type UnlockableItem } from "../../hooks/useItemUnlock";
import { track } from "../../services/trackEvents";
import type { UnlockKind } from "../../services/economyService";

interface Background {
    id: string;
    name: string;
    thumbnail: string | null;
    image: string;
    tier: string | null;
    unlock_at_level?: number | null;
    video_url: string | null;
    is_dark?: boolean;
    price_ruby?: number | null;
    unlock_type?: UnlockKind | null;
}

interface BackgroundSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    currentBackgroundId: string | null;
    onSelect: (bg: Background) => void;
    isPro?: boolean;
    /** Bond with the character on screen: gates `unlock_at_level`. */
    bondLevel?: number;
    bondProgress?: number | null;
    characterName?: string;
    onOpenBond?: () => void;
    onOpenSubscription?: () => void;
    onOpenQuests?: () => void;
    userId?: string;
    /** Selected character's picture — blurred behind the sheet. */
    sceneImage?: string | null;
}

export type BackgroundSheetRef = BottomSheetRef;

/** Free things first, then what costs something — Yuuki's picker order. */
const RANK: Record<string, number> = { default: 0, ads: 1, ruby: 2, pro: 3 };

const BackgroundSheet = forwardRef<BackgroundSheetRef, BackgroundSheetProps>(
    ({ isOpened, onIsOpenedChange, currentBackgroundId, onSelect, isPro = false, bondLevel, bondProgress, characterName, onOpenBond, onOpenSubscription, onOpenQuests, userId, sceneImage }, ref) => {
        const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
        const [backgrounds, setBackgrounds] = useState<Background[]>([]);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);

        useImperativeHandle(ref, () => ({
            present: (index?: number) => sheetRef.current?.present(index),
            dismiss: () => sheetRef.current?.dismiss(),
        }));

        const load = useCallback(async () => {
            setLoading(true);
            setError(null);
            try {
                const { data, error: err } = await supabase
                    .from("backgrounds")
                    .select("id, name, thumbnail, image, tier, video_url, is_dark, price_ruby, unlock_type, unlock_at_level")
                    .eq("available", true)
                    .eq("public", true)
                    .order("created_at", { ascending: true });
                if (err) throw err;
                const rows = (data ?? []) as Background[];
                rows.sort((a, b) => (RANK[a.unlock_type ?? "ads"] ?? 1) - (RANK[b.unlock_type ?? "ads"] ?? 1));
                setBackgrounds(rows);
            } catch (e: any) {
                setError(e?.message ?? "load failed");
            } finally {
                setLoading(false);
            }
        }, []);

        useEffect(() => {
            if (!isOpened) return;
            track.sceneSheetView();
            if (backgrounds.length === 0 && !loading) load();
        }, [isOpened]);

        const close = useCallback(() => {
            onIsOpenedChange(false);
            sheetRef.current?.dismiss();
        }, [onIsOpenedChange]);

        const unlock = useItemUnlock({
            isPro,
            userId,
            bondLevel,
            bondProgress,
            characterName,
            onOpenBond,
            placement: "change_background",
            adBody: t("ads.gate_body_bg"),
            onOpenPaywall: () => {
                close();
                setTimeout(() => onOpenSubscription?.(), 300);
            },
            onOpenQuests: () => {
                close();
                setTimeout(() => onOpenQuests?.(), 450);
            },
            closeSheet: close,
            kind: "scene_bg",
        });

        const toItem = (bg: Background): UnlockableItem => ({
            type: "background",
            id: bg.id,
            unlock: bg.unlock_type,
            tier: bg.tier,
        unlockAtLevel: bg.unlock_at_level,
            price: bg.price_ruby,
            name: bg.name,
            image: bg.thumbnail ?? bg.image,
        });

        const apply = useCallback(
            (bg: Background) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                close();
                onSelect(bg);
            },
            [close, onSelect]
        );

        const onPress = useCallback(
            (bg: Background) => {
                if (bg.id === currentBackgroundId) return apply(bg);
                unlock.request(toItem(bg), () => apply(bg));
            },
            [currentBackgroundId, apply, unlock.request]
        );

        const grid = useMemo(
            () => (
                <PickerGrid
                    items={backgrounds}
                    loading={loading}
                    error={error}
                    onRetry={load}
                    emptyText={t("bg.none")}
                    selectedId={currentBackgroundId}
                    visible={isOpened}
                    renderTile={(bg, width) => (
                        <ItemTile
                            width={width}
                            name={bg.name}
                            image={bg.thumbnail ?? bg.image}
                            lock={unlock.lockOf(toItem(bg))}
                            price={bg.price_ruby ?? 0}
                            requiredLevel={bg.unlock_at_level ?? 1}
                            proTier={(bg.tier ?? "free") === "pro"}
                            selected={bg.id === currentBackgroundId}
                            onPress={() => onPress(bg)}
                            topLeft={
                                <>
                                    <View style={[styles.glyph, bg.is_dark ? styles.dark : styles.light]}>
                                        {bg.is_dark ? <IconMoon size={11} color="#fff" /> : <IconSun size={11} color="#FFB800" strokeWidth={3} />}
                                    </View>
                                    {!!bg.video_url && (
                                        <View style={[styles.glyph, styles.video]}>
                                            <Ionicons name="play" size={9} color="#fff" />
                                        </View>
                                    )}
                                </>
                            }
                        />
                    )}
                />
            ),
            // unlock.lockOf reads the unlock cache; the hook re-renders us when it changes.
            [backgrounds, loading, error, currentBackgroundId, isOpened, isPro, onPress, unlock]
        );

        return (
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title={t("bg.title")}
                subtitle={t("shop.bg_subtitle")}
                sceneImage={sceneImage ?? null}
                detents={[0.85, 0.95]}
            >
                {grid}
                {unlock.dialogs}
            </BottomSheet>
        );
    }
);

export default BackgroundSheet;

const styles = StyleSheet.create({
    glyph: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    dark: { backgroundColor: "rgba(20,12,40,0.75)" },
    light: { backgroundColor: "rgba(255,255,255,0.9)" },
    video: { backgroundColor: "#FF4D8D" },
});
