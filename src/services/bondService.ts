import { supabase } from "../config/supabase";
import { analyticsService } from "./AnalyticsService";

/**
 * Bond levels — the per-character side of progression.
 *
 * Mirrors `supabase/migrations/20260922140*`. The server decides the XP, the
 * caps, the level curve and whether a capability is open; nothing here is
 * allowed to have an opinion about any of that.
 */

/** Everything a level can gate. Keep in step with `bond_capabilities.code`. */
export type BondCapability =
    | "change_background"
    | "change_costume"
    | "gallery"
    | "dance"
    | "voice_call"
    | "video_call"
    | "media_request"
    | "sensitive"
    | "intimate_chat"
    | "free_camera";

export type BondQuestKind = "daily" | "unique" | "hidden";

export type BondQuest = {
    id: string;
    kind: BondQuestKind;
    code: string;
    target: number;
    reward_xp: number;
    reward_ruby: number;
    progress: number;
    claimed: boolean;
    sort: number;
};

export type BondLevelRow = {
    level: number;
    title_key: string;
    unlocks_key: string;
    xp: number;
    reached: boolean;
};

export type BondState = {
    difficulty: number;
    xp: number;
    level: number;
    nextLevel: number | null;
    xpIntoLevel: number;
    xpForNext: number | null;
    levels: BondLevelRow[];
    capabilities: Record<string, { min_level: number; pro_only: boolean; open: boolean }>;
    quests: BondQuest[];
};

/** Events the server grants XP for. Anything else is refused server-side. */
export type BondEvent =
    | "chat_message"
    | "voice_minute"
    | "video_minute"
    | "change_outfit"
    | "change_background"
    | "dance"
    | "open_gallery"
    | "checkin";

export async function getBondState(characterId: string): Promise<BondState | null> {
    const { data, error } = await supabase.rpc("app_bond_state", { p_character_id: characterId });
    if (error || !data || data.error) {
        console.warn("[bond] state:", error?.message ?? data?.error);
        return null;
    }
    return {
        difficulty: data.difficulty ?? 2,
        xp: data.xp ?? 0,
        level: data.level ?? 1,
        nextLevel: data.next_level ?? null,
        xpIntoLevel: data.xp_into_level ?? 0,
        xpForNext: data.xp_for_next ?? null,
        levels: data.levels ?? [],
        capabilities: data.capabilities ?? {},
        quests: data.quests ?? [],
    };
}

export type BondTrackResult = {
    xp: number;
    granted: number;
    level: number;
    leveledUp: boolean;
    capped: boolean;
} | null;

/**
 * Report something the user did. Fire-and-forget by default: losing one of
 * these costs a few XP, never a crash or a spinner. Await it only when the
 * caller wants to know about a level-up.
 */
export async function trackBond(
    characterId: string,
    event: BondEvent,
    amount = 1
): Promise<BondTrackResult> {
    if (!characterId) return null;
    const { data, error } = await supabase.rpc("app_bond_track", {
        p_character_id: characterId,
        p_event: event,
        p_amount: amount,
    });
    if (error || !data || data.error) return null;
    // Reported here rather than at each call site so no path can level someone
    // up without Meta and the other analytics hearing about it — it is the
    // clearest retention signal this app produces.
    if (data.leveled_up) {
        void analyticsService.logEvent("bond_level_up", {
            level: data.level ?? 1,
            character_id: characterId,
        });
    }
    return {
        xp: data.xp ?? 0,
        granted: data.granted ?? 0,
        level: data.level ?? 1,
        leveledUp: !!data.leveled_up,
        capped: !!data.capped,
    };
}

export async function claimBondQuest(questId: string, characterId: string) {
    const { data, error } = await supabase.rpc("app_bond_claim", {
        p_quest_id: questId,
        p_character_id: characterId,
    });
    if (error) return { ok: false as const, error: error.message };
    if (data?.error) return { ok: false as const, error: data.error as string };
    if (data.leveled_up) {
        void analyticsService.logEvent("bond_level_up", {
            level: data.level ?? 1,
            character_id: characterId,
        });
    }
    return {
        ok: true as const,
        rewardXp: data.reward_xp as number,
        rewardRuby: data.reward_ruby as number,
        level: data.level as number,
        leveledUp: !!data.leveled_up,
    };
}

/** Difficulty 1..5 → a label key, for the chip on the level page. */
export const difficultyKey = (d: number) => `bond.diff_${Math.max(1, Math.min(5, d))}`;
