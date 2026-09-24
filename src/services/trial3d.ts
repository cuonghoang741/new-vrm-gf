import { supabase } from "../config/supabase";

/**
 * Three free minutes of 3D, once per account.
 *
 * The server owns both the grant and the clock — `remaining` is computed from
 * `expires_at` on every read, so a device with a wound-forward clock gets no
 * extra time, and a reinstall does not hand out a second trial. The countdown
 * on the toggle is drawn from that number, not from a local stopwatch.
 */
export type Trial3dState = {
    /** True once the trial has been taken, whether or not it still has time. */
    claimed: boolean;
    /** Seconds left; 0 when unclaimed or expired. */
    remaining: number;
    /** How long the trial is, for the offer dialog's copy. */
    minutes: number;
};

async function call(start: boolean): Promise<Trial3dState | null> {
    const { data, error } = await supabase.rpc("app_3d_trial", { p_start: start });
    if (error || !data || data.error) {
        console.warn("[trial3d]", error?.message ?? data?.error);
        return null;
    }
    return {
        claimed: !!data.claimed,
        remaining: Math.max(0, Number(data.remaining ?? 0)),
        minutes: Number(data.minutes ?? 3),
    };
}

export const get3dTrial = () => call(false);
export const start3dTrial = () => call(true);

/** mm:ss for the pill on the 2D/3D toggle. */
export function formatTrial(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
