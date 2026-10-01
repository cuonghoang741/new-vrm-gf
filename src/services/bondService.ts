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
    /** Progresses and pays out for PRO only (the touch quests). */
    pro_only?: boolean;
};

export type BondLevelRow = {
    level: number;
    title_key: string;
    unlocks_key: string;
    xp: number;
    reached: boolean;
    /** Lv5: opens only with PRO. */
    pro_only?: boolean;
};

export type BondState = {
    difficulty: number;
    xp: number;
    level: number;
    nextLevel: number | null;
    xpIntoLevel: number;
    xpForNext: number | null;
    /** The next level is PRO's (Lv5 for a free account). */
    nextProOnly: boolean;
    /** ...and the XP for it is already earned: PRO opens it at once. */
    nextReady: boolean;
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
    | "checkin"
    | "touch";

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
        nextProOnly: data.next_pro_only === true,
        nextReady: data.next_ready === true,
        levels: data.levels ?? [],
        capabilities: data.capabilities ?? {},
        quests: data.quests ?? [],
    };
}

export type BondTrackResult = {
    xp: number;
    granted: number;
    /** 2 for PRO, who earn double bond XP. */
    multiplier: number;
    level: number;
    leveledUp: boolean;
    capped: boolean;
} | null;

// ─── level-ups, for whoever wants to celebrate them ─────────────────────────
type LevelUpListener = (e: { characterId: string; level: number }) => void;
const levelUpListeners = new Set<LevelUpListener>();
/** Called on every level-up, whichever path caused it (touch, chat, quest). */
export function onBondLevelUp(cb: LevelUpListener): () => void {
    levelUpListeners.add(cb);
    return () => { levelUpListeners.delete(cb); };
}
function emitLevelUp(characterId: string, level: number) {
    levelUpListeners.forEach((cb) => { try { cb({ characterId, level }); } catch { /* a listener must not break tracking */ } });
}

function toTrackResult(data: any, characterId: string): BondTrackResult {
    if (!data || data.error) return null;
    // Reported here rather than at each call site so no path can level someone
    // up without Meta and the other analytics hearing about it — it is the
    // clearest retention signal this app produces.
    if (data.leveled_up) {
        void analyticsService.logEvent("bond_level_up", {
            level: data.level ?? 1,
            character_id: characterId,
        });
        emitLevelUp(characterId, data.level ?? 1);
    }
    return {
        xp: data.xp ?? 0,
        granted: data.granted ?? 0,
        multiplier: data.multiplier ?? 1,
        level: data.level ?? 1,
        leveledUp: !!data.leveled_up,
        capped: !!data.capped,
    };
}

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
    if (error) return null;
    return toTrackResult(data, characterId);
}

/** `left` is null when the account has no limit (PRO). */
export type TouchQuota = { pro: boolean; limit: number; left: number | null };

export async function getTouchQuota(): Promise<TouchQuota | null> {
    const { data, error } = await supabase.rpc("app_touch_quota");
    if (error || !data || data.error) return null;
    return { pro: !!data.pro, limit: data.limit ?? 3, left: data.left ?? null };
}

export type TouchResult =
    | { ok: true; left: number | null; bond: BondTrackResult }
    | { ok: false; reason: "daily_limit" | "error" };

/**
 * Spend one touch. The server keeps the daily count, so a free account cannot
 * buy more by clearing the app, and grants the XP (doubled for PRO).
 */
export async function touchCharacter(characterId: string): Promise<TouchResult> {
    if (!characterId) return { ok: false, reason: "error" };
    const { data, error } = await supabase.rpc("app_touch", { p_character_id: characterId });
    if (error || !data) return { ok: false, reason: "error" };
    if (data.ok === false && data.error === "daily_limit") return { ok: false, reason: "daily_limit" };
    if (!data.ok) return { ok: false, reason: "error" };
    return { ok: true, left: data.left ?? null, bond: toTrackResult(data.bond, characterId) };
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
        emitLevelUp(characterId, data.level ?? 1);
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

/** The camera went somewhere she is not comfortable with yet. See app_bond_peek. */
export async function reportPeek(characterId: string): Promise<{ allowed: boolean; penalty: number; unlockLevel: number } | null> {
    const { data, error } = await supabase.rpc("app_bond_peek", { p_character_id: characterId });
    if (error || !data || data.error) return null;
    return { allowed: !!data.allowed, penalty: data.penalty ?? 0, unlockLevel: data.unlock_level ?? 4 };
}

/**
 * Her one-time line for reaching `level` (Lv2 a secret, Lv3 a nickname, Lv4 a
 * confession, Lv5 a vow), from the `bond-moment` function, which checks the
 * level itself and saves the line into the chat. Null if it cannot be had.
 */
export async function fetchBondMoment(characterId: string, level: number, lang: string): Promise<{ message: string; nickname: string | null } | null> {
    if (level < 2) return null;
    try {
        const { data, error } = await supabase.functions.invoke("bond-moment", {
            body: { character_id: characterId, level, lang },
        });
        if (error) return null;
        const d = typeof data === "string" ? JSON.parse(data) : data;
        return d?.message ? { message: String(d.message), nickname: d.nickname ?? null } : null;
    } catch {
        return null;
    }
}
