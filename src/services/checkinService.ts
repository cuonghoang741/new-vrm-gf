import { supabase } from "../config/supabase";

/**
 * Ruby economy (server-backed). Daily check-in grants ruby (per the
 * `login_rewards` config); ruby buys locked items (price_ruby). All mutations
 * go through SECURITY DEFINER RPCs (see supabase-edge/economy_functions.sql) so
 * the client can't tamper with balances.
 */

export const CHECKIN_CYCLE = 30;

export type DayReward = { day: number; ruby: number };

export async function getRubyBalance(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc("app_get_ruby", { p_user_id: userId });
    if (error) {
        console.warn("[economy] getRubyBalance:", error.message);
        return 0;
    }
    return typeof data === "number" ? data : 0;
}

/** 30-day ruby reward schedule from login_rewards. */
export async function getRewardSchedule(): Promise<DayReward[]> {
    const { data } = await supabase
        .from("login_rewards")
        .select("day_number, reward_ruby")
        .order("day_number");
    return (data ?? []).map((r: any) => ({ day: r.day_number, ruby: r.reward_ruby ?? 0 }));
}

export type CheckinProgress = { currentDay: number; claimedToday: boolean };

export async function getCheckinProgress(userId: string): Promise<CheckinProgress> {
    const { data } = await supabase
        .from("user_login_rewards")
        .select("current_day, last_claim_date")
        .eq("user_id", userId)
        .maybeSingle();
    if (!data) return { currentDay: 0, claimedToday: false };
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (server uses current_date/UTC)
    return {
        currentDay: data.current_day ?? 0,
        claimedToday: data.last_claim_date === today,
    };
}

export type ClaimResult =
    | { ok: true; day: number; ruby: number }
    | { ok: false; already?: boolean; error?: string };

export async function claimDailyReward(userId: string): Promise<ClaimResult> {
    const { data, error } = await supabase.rpc("app_claim_daily_reward", { p_user_id: userId });
    if (error) return { ok: false, error: error.message };
    if (data?.already) return { ok: false, already: true };
    return { ok: true, day: data?.day ?? 0, ruby: data?.ruby ?? 0 };
}

export type PurchaseResult =
    | { ok: true; price: number; rubyLeft: number }
    | { ok: false; error: string; need?: number; have?: number };

export type PurchasableType = "background" | "character_costume" | "character";

export async function purchaseItem(
    userId: string,
    itemType: PurchasableType,
    itemId: string
): Promise<PurchaseResult> {
    const { data, error } = await supabase.rpc("app_purchase_item", {
        p_user_id: userId,
        p_item_type: itemType,
        p_item_id: itemId,
    });
    if (error) return { ok: false, error: error.message };
    if (data?.error) return { ok: false, error: data.error, need: data.need, have: data.have };
    return { ok: true, price: data?.price ?? 0, rubyLeft: data?.ruby_left ?? 0 };
}
