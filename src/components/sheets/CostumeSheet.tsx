import { useTranslation } from "react-i18next";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { supabase } from "../../config/supabase";
import { BottomSheet, type BottomSheetRef } from "../common/BottomSheet";
import { PickerGrid } from "../shop/PickerGrid";
import { ItemTile } from "../shop/ItemTile";
import { useItemUnlock, type UnlockableItem } from "../../hooks/useItemUnlock";
import { track } from "../../services/trackEvents";
import type { UnlockKind } from "../../services/economyService";

interface Costume {
    id: string;
    costume_name: string;
    thumbnail: string | null;
    model_url: string | null;
    url: string | null;
    tier: string | null;
    unlock_at_level?: number | null;
    price_ruby?: number | null;
    unlock_type?: UnlockKind | null;
}

interface CostumeSheetProps {
    isOpened: boolean;
    onIsOpenedChange: (open: boolean) => void;
    characterId: string | null;
    currentCostumeUrl: string | null;
    onSelect: (costume: Costume) => void;
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

export type CostumeSheetRef = BottomSheetRef;

const RANK: Record<string, number> = { default: 0, ads: 1, ruby: 2, pro: 3 };

const CostumeSheet = forwardRef<CostumeSheetRef, CostumeSheetProps>(
    ({ isOpened, onIsOpenedChange, characterId, currentCostumeUrl, onSelect, isPro = false, bondLevel, bondProgress, characterName, onOpenBond, onOpenSubscription, onOpenQuests, userId, sceneImage }, ref) => {
        const { t } = useTranslation();
        const sheetRef = useRef<BottomSheetRef>(null);
        const [costumes, setCostumes] = useState<Costume[]>([]);
        const [loadedFor, setLoadedFor] = useState<string | null>(null);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);

        useImperativeHandle(ref, () => ({
            present: (index?: number) => sheetRef.current?.present(index),
            dismiss: () => sheetRef.current?.dismiss(),
        }));

        const load = useCallback(async () => {
            if (!characterId) return;
            setLoading(true);
            setError(null);
            // A different character's outfits must never flash in this one's sheet.
            if (loadedFor !== characterId) setCostumes([]);
            try {
                const { data, error: err } = await supabase
                    .from("character_costumes")
                    .select("id, costume_name, thumbnail, model_url, url, tier, price_ruby, unlock_type, unlock_at_level")
                    .eq("character_id", characterId)
                    .eq("available", true)
                    .order("created_at", { ascending: true });
                if (err) throw err;
                const rows = (data ?? []) as Costume[];
                rows.sort((a, b) => (RANK[a.unlock_type ?? "ads"] ?? 1) - (RANK[b.unlock_type ?? "ads"] ?? 1));
                setCostumes(rows);
                setLoadedFor(characterId);
            } catch (e: any) {
                setError(e?.message ?? "load failed");
            } finally {
                setLoading(false);
            }
        }, [characterId, loadedFor]);

        useEffect(() => {
            if (!isOpened) return;
            track.outfitSheetView();
            if (characterId) load();
        }, [isOpened, characterId]);

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
            placement: "change_costume",
            adBody: t("ads.gate_body_cos"),
            onOpenPaywall: () => {
                close();
                setTimeout(() => onOpenSubscription?.(), 300);
            },
            onOpenQuests: () => {
                close();
                setTimeout(() => onOpenQuests?.(), 450);
            },
            closeSheet: close,
            kind: "outfit",
        });

        const toItem = (c: Costume): UnlockableItem => ({
            type: "costume",
            id: c.id,
            unlock: c.unlock_type,
            tier: c.tier,
        unlockAtLevel: c.unlock_at_level,
            price: c.price_ruby,
            name: c.costume_name,
            image: c.thumbnail ?? c.url,
        });

        const apply = useCallback(
            (c: Costume) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                close();
                onSelect(c);
            },
            [close, onSelect]
        );

        const selectedId = costumes.find((c) => !!c.model_url && c.model_url === currentCostumeUrl)?.id ?? null;

        const onPress = (c: Costume) => {
            if (c.id === selectedId) return apply(c);
            unlock.request(toItem(c), () => apply(c));
        };

        return (
            <BottomSheet
                ref={sheetRef}
                isOpened={isOpened}
                onIsOpenedChange={onIsOpenedChange}
                title={t("cos.title", { defaultValue: "Outfits" })}
                subtitle={t("shop.cos_subtitle")}
                sceneImage={sceneImage ?? null}
                detents={[0.85, 0.95]}
            >
                <PickerGrid
                    items={costumes}
                    loading={loading}
                    error={error}
                    onRetry={load}
                    emptyText={t("cos.none", { defaultValue: "No outfits yet" })}
                    selectedId={selectedId}
                    visible={isOpened}
                    renderTile={(c, width) => (
                        <ItemTile
                            width={width}
                            name={c.costume_name}
                            image={c.thumbnail ?? c.url}
                            lock={unlock.lockOf(toItem(c))}
                            price={c.price_ruby ?? 0}
                            requiredLevel={c.unlock_at_level ?? 1}
                            proTier={(c.tier ?? "free") === "pro"}
                            selected={c.id === selectedId}
                            onPress={() => onPress(c)}
                        />
                    )}
                />
                {unlock.dialogs}
            </BottomSheet>
        );
    }
);

export default CostumeSheet;
