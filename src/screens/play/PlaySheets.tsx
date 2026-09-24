import React, { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import CharacterSheet from "../../components/sheets/CharacterSheet";
import CostumeSheet from "../../components/sheets/CostumeSheet";
import BackgroundSheet from "../../components/sheets/BackgroundSheet";
import SettingsSheet from "../../components/sheets/SettingsSheet";
import SubscriptionSheet from "../../components/sheets/SubscriptionSheet";
import MediaSheet from "../../components/sheets/MediaSheet";
import CheckinSheet from "../../components/sheets/CheckinSheet";
import DanceSheet from "../../components/sheets/DanceSheet";
import { QuestPage, type QuestTarget } from "../quest/QuestPage";
import { BondPage } from "../bond/BondPage";
import { trackBond } from "../../services/bondService";
import { track } from "../../services/economyService";
import { flashSale } from "../../services/flashSale";
import type { useDance } from "./useDance";

/**
 * Every bottom sheet PlayScreen can open, in one place.
 *
 * This is a pass-through: no logic of its own, and deliberately so. The value
 * is that the screen's render now ends at one `<PlaySheets .../>` instead of
 * ninety lines of sheet wiring, and that the props below are an explicit list
 * of what the sheets are allowed to touch — previously that list existed only
 * as closure captures you had to read the whole file to find.
 *
 * The prop count is wide because the screen holds ~40 pieces of state, not
 * because the split is wrong. Narrowing it means consolidating that state
 * first, which is a bigger change than moving lines between files.
 */
export interface PlaySheetsProps {
    user: User | null;

    // open/close state, one pair per sheet
    charSheetOpen: boolean;
    setCharSheetOpen: (open: boolean) => void;
    costumeSheetOpen: boolean;
    setCostumeSheetOpen: (open: boolean) => void;
    bgSheetOpen: boolean;
    setBgSheetOpen: (open: boolean) => void;
    settingsSheetOpen: boolean;
    setSettingsSheetOpen: (open: boolean) => void;
    subscriptionOpen: boolean;
    setSubscriptionOpen: (open: boolean) => void;
    mediaSheetOpen: boolean;
    setMediaSheetOpen: (open: boolean) => void;
    checkinOpen: boolean;
    setCheckinOpen: (open: boolean) => void;
    questOpen: boolean;
    setQuestOpen: (open: boolean) => void;
    bondOpen: boolean;
    /** Seconds left of the free-3D trial; 0 when it is not running. */
    trialRemaining?: number;
    bondLevel: number | null;
    bondProgress: number | null;
    setBondOpen: (open: boolean) => void;
    characterName: string;
    dance: ReturnType<typeof useDance>;
    /** Selected character's picture, blurred behind the picker sheets. */
    sceneImage: string | null;

    // what the sheets need to know about the current scene
    isPro: boolean;
    characterId: string | null;
    characterModelUrl: string | null;
    backgroundId: string | null;
    backgroundUrl: string | null;

    // actions
    onCharacterSelect: (char: any) => void;
    onCostumeSelect: (costume: any) => void;
    onBackgroundSelect: (bg: any) => void;
    onRubyClaimed: (balance: number) => void;
    onPurchaseSuccess: () => void;
    onResetOnboarding: () => void;
    /**
     * Fired when the character sheet is DISMISSED — never when a character was
     * picked. See the call site: an ad that lands on the moment someone asked
     * to see a new character is the "interrupts an action" case AdMob's
     * placement policy is about, and it is also simply the worst second of the
     * app to put an ad in.
     */
    onCharacterSheetClosed: () => void;
}

export function PlaySheets(p: PlaySheetsProps) {
    /**
     * Set by the sheet's own select handler, which runs one tick AFTER it asks
     * the parent to close — hence the deferred read below.
     */
    const pickedRef = useRef(false);
    const openSubscription = () => p.setSubscriptionOpen(true);
    const openQuests = () => p.setQuestOpen(true);

    // Quest progress for "open the gallery".
    useEffect(() => {
        if (p.mediaSheetOpen) {
            track("open_gallery");
            void trackBond(p.characterId ?? "", "open_gallery");
        }
    }, [p.mediaSheetOpen]);

    /** A quest's "Go" button: close the Quest page, open where the quest happens. */
    const goToQuest = (target: QuestTarget) => {
        p.setQuestOpen(false);
        const open = {
            checkin: () => p.setCheckinOpen(true),
            chat: () => { },
            costume: () => p.setCostumeSheetOpen(true),
            background: () => p.setBgSheetOpen(true),
            dance: () => p.dance.setDanceSheetOpen(true),
            gallery: () => p.setMediaSheetOpen(true),
        }[target];
        setTimeout(open, 350);
    };

    return (
        <>
            <CharacterSheet
                isOpened={p.charSheetOpen}
                onIsOpenedChange={(open) => {
                    p.setCharSheetOpen(open);
                    if (open) return;
                    // Read the flag after the sheet's own onSelect has run: it
                    // closes first and selects second. No ad when a character
                    // was picked — the user is waiting for her to appear.
                    setTimeout(() => {
                        const picked = pickedRef.current;
                        pickedRef.current = false;
                        if (!picked) p.onCharacterSheetClosed();
                    }, 0);
                }}
                currentCharacterId={p.characterId}
                onSelect={(char: any) => {
                    pickedRef.current = true;
                    p.onCharacterSelect(char);
                }}
                isPro={p.isPro}
                onOpenSubscription={openSubscription}
                userId={p.user?.id}
            />
            <CostumeSheet
                bondLevel={p.bondLevel ?? 1}
                bondProgress={p.bondProgress}
                characterName={p.characterName}
                onOpenBond={() => p.setBondOpen(true)}
                isOpened={p.costumeSheetOpen}
                onIsOpenedChange={p.setCostumeSheetOpen}
                characterId={p.characterId}
                currentCostumeUrl={p.characterModelUrl}
                onSelect={(c) => {
                    track("change_outfit");
                    void trackBond(p.characterId ?? "", "change_outfit");
                    p.onCostumeSelect(c);
                }}
                isPro={p.isPro}
                onOpenSubscription={openSubscription}
                onOpenQuests={openQuests}
                userId={p.user?.id}
                sceneImage={p.sceneImage}
            />
            <BackgroundSheet
                bondLevel={p.bondLevel ?? 1}
                bondProgress={p.bondProgress}
                characterName={p.characterName}
                onOpenBond={() => p.setBondOpen(true)}
                isOpened={p.bgSheetOpen}
                onIsOpenedChange={p.setBgSheetOpen}
                currentBackgroundId={p.backgroundId}
                onSelect={(bg) => {
                    track("change_background");
                    void trackBond(p.characterId ?? "", "change_background");
                    p.onBackgroundSelect(bg);
                }}
                isPro={p.isPro}
                onOpenSubscription={openSubscription}
                onOpenQuests={openQuests}
                userId={p.user?.id}
                sceneImage={p.sceneImage}
            />
            <SettingsSheet
                isOpened={p.settingsSheetOpen}
                onIsOpenedChange={p.setSettingsSheetOpen}
                userId={p.user?.id}
                userEmail={p.user?.email}
                onOpenSubscription={() => {
                    p.setSettingsSheetOpen(false);
                    setTimeout(openSubscription, 400);
                }}
                onResetOnboarding={p.onResetOnboarding}
                sceneImage={p.sceneImage}
            />
            <SubscriptionSheet
                isOpened={p.subscriptionOpen}
                onClose={() => {
                    p.setSubscriptionOpen(false);
                    // Closing the paywall is the one moment a lower price still
                    // means something: they have just seen the full one and
                    // said no. A no-op when they are PRO, when a window is
                    // already open, when today's has been used, or when the
                    // account has ever purchased — see `flashSale.start`.
                    if (!p.isPro) void flashSale.start();
                }}
                onPurchaseSuccess={p.onPurchaseSuccess}
                currentModelUrl={p.characterModelUrl}
                currentBackgroundUrl={p.backgroundUrl}
                currentCharacterId={p.characterId}
            />
            <MediaSheet
                isOpened={p.mediaSheetOpen}
                onIsOpenedChange={p.setMediaSheetOpen}
                characterId={p.characterId}
                sceneImage={p.sceneImage}
                userId={p.user?.id}
                bondLevel={p.bondLevel ?? 1}
                bondProgress={p.bondProgress}
                characterName={p.characterName}
                onOpenBond={() => p.setBondOpen(true)}
                onOpenQuests={openQuests}
                onOpenSubscription={() => {
                    p.setMediaSheetOpen(false);
                    openSubscription();
                }}
            />
            <DanceSheet
                trialActive={(p.trialRemaining ?? 0) > 0}
                bondLevel={p.bondLevel ?? 1}
                bondProgress={p.bondProgress}
                characterName={p.characterName}
                onOpenBond={() => p.setBondOpen(true)}
                isOpened={p.dance.danceSheetOpen}
                onIsOpenedChange={p.dance.setDanceSheetOpen}
                currentDanceId={p.dance.currentDanceId}
                onSelect={p.dance.playDance}
                isPro={p.isPro}
                userId={p.user?.id}
                onOpenSubscription={openSubscription}
                onOpenQuests={openQuests}
                sceneImage={p.sceneImage}
            />
            <QuestPage
                visible={p.questOpen}
                onClose={() => p.setQuestOpen(false)}
                isPro={p.isPro}
                sceneImage={p.sceneImage}
                onOpenSubscription={() => {
                    p.setQuestOpen(false);
                    setTimeout(openSubscription, 350);
                }}
                onGo={goToQuest}
            />
            <BondPage
                visible={p.bondOpen}
                onClose={() => p.setBondOpen(false)}
                characterId={p.characterId}
                characterName={p.characterName}
                characterArt={p.sceneImage}
                onSwitchCharacter={() => p.setCharSheetOpen(true)}
            />
            <CheckinSheet
                isOpened={p.checkinOpen}
                onIsOpenedChange={p.setCheckinOpen}
                userId={p.user?.id}
                onClaimed={p.onRubyClaimed}
                sceneImage={p.sceneImage}
                onOpenSubscription={() => {
                    p.setCheckinOpen(false);
                    setTimeout(openSubscription, 350);
                }}
            />
        </>
    );
}
