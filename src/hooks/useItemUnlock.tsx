import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { AdGateDialog } from "../components/AdGateDialog";
import { UnlockDialog } from "../components/shop/UnlockDialog";
import { LevelLockDialog } from "../components/shop/LevelLockDialog";
import { useRewardedAd } from "./useRewardedAd";
import { AdUnits } from "../config/ads";
import { buyItem, type AssetType, type UnlockKind } from "../services/economyService";
import {
    consumeNoFillGrant,
    isUnlocked,
    loadUnlocks,
    markOwned,
    markUnlocked,
    subscribeUnlocks,
} from "../services/unlockService";
import { refreshRuby, setRuby, useRuby } from "../services/rubyStore";
import { track, type ItemKind } from "../services/trackEvents";

/** What stands between the user and an item right now. */
export type LockState = "free" | "ad" | "pro" | "pro_or_ruby" | "ruby" | "level";

export type UnlockableItem = {
    type: AssetType;
    id: string;
    unlock: UnlockKind | null | undefined;
    /** `tier` and `price` are the authority; see `lockStateOf`. */
    tier?: string | null;
    /** Bond level with the active character required to use this at all. */
    unlockAtLevel?: number | null;
    price?: number | null;
    name: string;
    image?: string | null;
};

/**
 * Lock state of one item, from its tier and its ruby price:
 *
 *   free + no price  → watch an ad
 *   free + price     → pay ruby
 *   pro  + no price  → be PRO
 *   pro  + price     → be PRO, *then* pay ruby
 *
 * The last row is the one that used to be wrong: a PRO item carrying a price
 * offered "subscribe OR pay ruby", so a non-subscriber saw two prices at once
 * for the same thing. PRO is the gate; the ruby price is what it costs once
 * you are through it.
 *
 * `unlock_type = 'default'` still means "always free" — an explicit override
 * that outranks tier, used for each character's first outfit.
 */
export function lockStateOf(item: UnlockableItem, isPro: boolean, bondLevel = 5): LockState {
    // Closeness outranks money: an item she is not ready to show you cannot be
    // bought past, so this is checked before ownership and before tier.
    if ((item.unlockAtLevel ?? 1) > bondLevel) return "level";
    if ((item.unlock ?? "") === "default") return "free";
    if (isUnlocked(item.type, item.id)) return "free";

    const price = item.price ?? 0;
    const isProTier = (item.tier ?? "free") === "pro";

    if (isProTier) {
        // Subscription first, whatever the price says.
        if (!isPro) return "pro";
        return price > 0 ? "ruby" : "free";
    }
    return price > 0 ? "ruby" : isPro ? "free" : "ad";
}

/**
 * The whole unlock flow for pickers (costume, background, dance):
 *   free → run; ad → rewarded-ad gate; pro / ruby → UnlockDialog (buy with
 *   ruby, upgrade, or go earn ruby).
 *
 * Render `dialogs` somewhere in the picker. `request(item, onGranted)` calls
 * `onGranted` once the user may use the item.
 */
export function useItemUnlock(opts: {
    isPro: boolean;
    userId?: string | null;
    placement: string;
    adBody: string;
    onOpenPaywall: () => void;
    onOpenQuests: () => void;
    /** Which family the sheet shows, for the tracking-sheet event names. */
    kind: ItemKind;
    /**
     * Close the picker sheet. On iOS the sheet is a natively presented view
     * controller and a rewarded ad opened while it is up lands underneath it —
     * the user never sees the ad and never earns the item. So the sheet is
     * closed first and the ad shown once it is gone.
     */
    closeSheet?: () => void;
    /** Bond level with the character on screen; gates `unlock_at_level`. */
    bondLevel?: number;
    /** 0..1 through that level, shown in the level-lock dialog. */
    bondProgress?: number | null;
    /** Her name, and the way to her level page from the lock dialog. */
    characterName?: string;
    onOpenBond?: () => void;
}) {
    const { t } = useTranslation();
    const { isPro, userId, placement, adBody, onOpenPaywall, onOpenQuests, closeSheet, kind } = opts;
    const bondLevel = opts.bondLevel ?? 5;
    const [levelFor, setLevelFor] = useState<UnlockableItem | null>(null);
    const { showForGate } = useRewardedAd(AdUnits.rewarded, placement);
    const balance = useRuby();

    const [adFor, setAdFor] = useState<{ item: UnlockableItem; done: () => void } | null>(null);
    const [buyFor, setBuyFor] = useState<{ item: UnlockableItem; kind: "pro" | "pro_or_ruby" | "ruby"; done: () => void } | null>(null);
    const [busy, setBusy] = useState(false);
    /** Re-render callers when an unlock lands anywhere. */
    const [, setTick] = useState(0);

    useEffect(() => {
        loadUnlocks(userId);
        return subscribeUnlocks(() => setTick((n) => n + 1));
    }, [userId]);

    const request = useCallback(
        (item: UnlockableItem, onGranted: () => void) => {
            const state = lockStateOf(item, isPro, bondLevel);
            track.itemSelect(kind, item.id, state !== "free", item.price ?? 0);
            if (state === "free") return onGranted();
            Haptics.selectionAsync();
            // Not for sale at any price — she is simply not there yet.
            if (state === "level") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                return setLevelFor(item);
            }
            if (state === "ad") {
                track.unlockView(kind, item.id, 0, balance ?? 0);
                return setAdFor({ item, done: onGranted });
            }
            refreshRuby();
            track.unlockView(kind, item.id, item.price ?? 0, balance ?? 0);
            setBuyFor({ item, kind: state, done: onGranted });
        },
        [isPro, kind, balance, bondLevel, t]
    );

    const watchAd = useCallback(async () => {
        const pending = adFor;
        setAdFor(null);
        if (!pending) return;
        track.unlockSelect(kind, pending.item.id, 0, "ad");
        if (Platform.OS === "ios" && closeSheet) {
            closeSheet();
            await new Promise((r) => setTimeout(r, 550));
        }
        const outcome = await showForGate();
        if (outcome === "dismissed") return;
        if (outcome === "unavailable" && !consumeNoFillGrant()) {
            Alert.alert(t("common.error"), t("ads.no_fill"));
            return;
        }
        await markUnlocked(pending.item.type, pending.item.id, userId);
        track.unlockSuccess(kind, pending.item.id, 0, "ad");
        pending.done();
    }, [adFor, showForGate, userId, t, closeSheet, kind]);

    const buy = useCallback(async () => {
        const pending = buyFor;
        if (!pending || busy) return;
        setBusy(true);
        track.unlockSelect(kind, pending.item.id, pending.item.price ?? 0, "hearts");
        try {
            const res = await buyItem(pending.item.type, pending.item.id);
            if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRuby(res.ruby_left);
                track.unlockSuccess(kind, pending.item.id, pending.item.price ?? 0, "hearts");
                markOwned(pending.item.type, pending.item.id);
                setBuyFor(null);
                pending.done();
            } else if (res.error === "insufficient") {
                setRuby(res.have as number);
                track.heartsInsufficient(kind, pending.item.price ?? 0, (res.have as number) ?? 0);
            } else if (res.error === "owned") {
                markOwned(pending.item.type, pending.item.id);
                setBuyFor(null);
                pending.done();
            } else {
                Alert.alert(t("common.purchase_failed"), t("common.try_again"));
            }
        } finally {
            setBusy(false);
        }
    }, [buyFor, busy, t, kind]);

    // What the dialogs keep showing while they fade out.
    //
    // `visible` goes false one render before the modal finishes animating, and
    // the props were read straight off the state that was just cleared — so
    // `kind={buyFor?.kind ?? "pro"}` turned the ruby dialog into the PRO
    // upgrade dialog for the length of the fade. Cancelling a ruby purchase
    // flashed a paywall. Holding the last value keeps the closing frame
    // identical to the open one.
    const lastBuy = useRef<typeof buyFor>(null);
    if (buyFor) lastBuy.current = buyFor;
    const shownBuy = buyFor ?? lastBuy.current;

    const lastLevel = useRef<UnlockableItem | null>(null);
    if (levelFor) lastLevel.current = levelFor;
    const shownLevel = levelFor ?? lastLevel.current;

    const dialogs = (
        <>
            <LevelLockDialog
                visible={!!levelFor}
                itemName={shownLevel?.name ?? ""}
                itemImage={shownLevel?.image}
                requiredLevel={shownLevel?.unlockAtLevel ?? 1}
                currentLevel={bondLevel}
                characterName={opts.characterName ?? ""}
                progress={opts.bondProgress ?? null}
                alsoPro={(shownLevel?.tier ?? "free") === "pro"}
                alsoPrice={shownLevel?.price ?? 0}
                onClose={() => setLevelFor(null)}
                onOpenBond={() => {
                    setLevelFor(null);
                    opts.closeSheet?.();
                    setTimeout(() => opts.onOpenBond?.(), 350);
                }}
            />
            <AdGateDialog
                visible={!!adFor}
                body={adBody}
                onWatch={watchAd}
                onUpgrade={() => {
                    setAdFor(null);
                    onOpenPaywall();
                }}
                onCancel={() => {
                    if (adFor) track.unlockLater(kind, adFor.item.id);
                    setAdFor(null);
                }}
            />
            <UnlockDialog
                visible={!!buyFor}
                kind={shownBuy?.kind ?? "ruby"}
                itemName={shownBuy?.item.name ?? ""}
                image={shownBuy?.item.image}
                price={shownBuy?.item.price ?? 0}
                balance={balance}
                busy={busy}
                onBuy={buy}
                onUpgrade={() => {
                    if (buyFor) track.unlockSelect(kind, buyFor.item.id, buyFor.item.price ?? 0, "pro");
                    setBuyFor(null);
                    onOpenPaywall();
                }}
                onGetRuby={() => {
                    setBuyFor(null);
                    onOpenQuests();
                }}
                onCancel={() => {
                    if (buyFor) track.unlockLater(kind, buyFor.item.id);
                    setBuyFor(null);
                }}
            />
        </>
    );

    return { request, dialogs, lockOf: (item: UnlockableItem) => lockStateOf(item, isPro, bondLevel) };
}
