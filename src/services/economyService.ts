import { supabase } from "../config/supabase";

/**
 * Quest / shop / ruby economy — thin client over the SECURITY DEFINER RPCs in
 * supabase/migrations/20260922100000_quests_shop_economy.sql.
 *
 * The server is the only authority: it knows who the user is (auth.uid()),
 * what day it is (UTC), whether they are PRO, and it refuses double claims.
 * Nothing here trusts or sends a user id, a date or a PRO flag.
 */

export type UnlockKind = "default" | "ads" | "pro" | "ruby";
/** Asset families in `user_unlocks.asset_type`. */
export type AssetType = "character" | "costume" | "background" | "dance";

export type Quest = {
    id: string;
    kind: "daily" | "special";
    event: string;
    title: string;
    icon: string | null;
    target: number;
    reward: number;
    progress: number;
    claimed: boolean;
};

export type QuestState = {
    day: string;
    ruby: number;
    isPro: boolean;
    /** 2 for PRO: quest and check-in rewards are doubled server-side. */
    multiplier: number;
    quests: Quest[];
    ads: { watched: number; limit: number; reward: number; nextAt: string | null };
    proBonus: { amount: number; claimed: boolean };
    /** product id → ruby granted, e.g. { "truemate.ruby.1": 120 } */
    packs: Record<string, number>;
};

export type RpcResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string; [k: string]: unknown };

async function rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
    const { data, error } = await supabase.rpc(fn, args ?? {});
    if (error) return { ok: false, error: error.message };
    if (data && typeof data === "object" && "error" in data) return { ok: false, ...(data as any) };
    return { ok: true, ...(data as any) };
}

export async function getQuestState(): Promise<QuestState | null> {
    const { data, error } = await supabase.rpc("app_get_quests");
    if (error || !data || data.error) {
        console.warn("[economy] getQuestState:", error?.message ?? data?.error);
        return null;
    }
    return {
        day: data.day,
        ruby: data.ruby ?? 0,
        isPro: !!data.is_pro,
        multiplier: data.multiplier ?? 1,
        quests: data.quests ?? [],
        ads: {
            watched: data.ads?.watched ?? 0,
            limit: data.ads?.limit ?? 5,
            reward: data.ads?.reward ?? 10,
            nextAt: data.ads?.next_at ?? null,
        },
        proBonus: { amount: data.pro_bonus?.amount ?? 0, claimed: !!data.pro_bonus?.claimed },
        packs: data.packs ?? {},
    };
}

export const claimQuest = (questId: string) =>
    rpc<{ reward: number; ruby: number }>("app_claim_quest", { p_quest_id: questId });

/** Call only after the rewarded ad reported a reward. */
export const rewardAd = () => rpc<{ reward: number; ruby: number; watched: number }>("app_reward_ad");

export const claimProBonus = () => rpc<{ reward: number; ruby: number }>("app_claim_pro_bonus");

export const buyItem = (type: AssetType, id: string) =>
    rpc<{ price: number; ruby_left: number }>("app_buy_item", { p_type: type, p_id: id });

export const unlockWithAd = (type: AssetType, id: string) =>
    rpc("app_unlock_with_ad", { p_type: type, p_id: id });

export async function getRuby(): Promise<number> {
    const { data, error } = await supabase.rpc("app_get_ruby");
    if (error) return 0;
    return typeof data === "number" ? data : 0;
}

/**
 * Report a client-side quest event. Fire-and-forget: a lost event costs the
 * user a few ruby at worst, never a crash or a spinner.
 */
export type TrackEvent = "change_outfit" | "change_background" | "dance" | "open_gallery" | "voice_call";
export function track(event: TrackEvent): void {
    supabase.rpc("app_track", { p_event: event, p_amount: 1 }).then(
        () => { },
        () => { }
    );
}

// ── privilege (reviewer / partner accounts) ────────────────────────────────
export const redeemPrivilege = (username: string, password: string) =>
    rpc<{ username: string }>("app_redeem_privilege", { p_username: username, p_password: password });

export const leavePrivilege = () => rpc("app_leave_privilege");

export async function isPrivileged(): Promise<boolean> {
    const { data, error } = await supabase.rpc("app_is_privileged");
    return !error && data === true;
}

// ── ruby packs (IAP) ────────────────────────────────────────────────────────
export const RUBY_PACK_IDS = [
    "truemate.ruby.1",
    "truemate.ruby.2",
    "truemate.ruby.3",
    "truemate.ruby.4",
    "truemate.ruby.5",
    "truemate.ruby.6",
] as const;
