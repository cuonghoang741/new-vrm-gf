import { supabase } from "../config/supabase";

/**
 * Reporting offensive AI-generated content, from inside the app.
 *
 * Google Play's AI-Generated Content policy requires a user to be able to flag
 * what the model says or shows without leaving the app — the store rejected a
 * build for not having one. Every AI message and every photo in her gallery
 * therefore carries a way in; this module is what they all call.
 *
 * Reports go through the `report_content()` RPC, never a plain insert: the
 * table has no INSERT policy, so the server is the only thing that decides
 * whose name is on a report and how many one account may file.
 */

export type ReportKind = "chat_message" | "media" | "character";

/** The reasons offered, in the order they are shown. */
export const REPORT_REASONS = [
    "sexual",
    "harassment",
    "hate",
    "violence",
    "self_harm",
    "minor",
    "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * What this user has already reported, by target id.
 *
 * Kept server-side rather than on the device: the row is the truth, it
 * survives a reinstall, and the RLS policy already limits the read to the
 * reporter's own rows.
 */
let reported = new Set<string>();
let loaded = false;

export async function loadMyReports(): Promise<void> {
    try {
        const { data, error } = await supabase
            .from("content_reports")
            .select("target_id")
            .not("target_id", "is", null)
            .limit(500);
        if (error) return;
        reported = new Set((data ?? []).map((r: any) => String(r.target_id)));
        loaded = true;
    } catch {
        // A failed read only costs the "already reported" label.
    }
}

/** True once this user has flagged that message or photo. */
export function isReported(targetId?: string | null): boolean {
    return !!targetId && reported.has(targetId);
}

/** Whether the list has been fetched at least once this session. */
export function reportsLoaded(): boolean {
    return loaded;
}

export type ReportResult =
    | { ok: true; duplicate: boolean }
    | { ok: false; error: "rate_limited" | "not_authenticated" | "failed" };

export async function submitReport(args: {
    kind: ReportKind;
    reason: ReportReason;
    targetId?: string | null;
    characterId?: string | null;
    note?: string | null;
    /** The text or URL the user actually saw, stored with the report. */
    snapshot?: string | null;
}): Promise<ReportResult> {
    try {
        const { data, error } = await supabase.rpc("report_content", {
            p_kind: args.kind,
            p_reason: args.reason,
            p_target_id: args.targetId ?? null,
            p_character_id: args.characterId ?? null,
            p_note: args.note ?? null,
            p_snapshot: args.snapshot ?? null,
        });

        if (error) {
            console.warn("[report]", error.message);
            return { ok: false, error: "failed" };
        }
        if (data?.error) {
            return { ok: false, error: data.error };
        }

        if (args.targetId) reported.add(args.targetId);
        return { ok: true, duplicate: !!data?.duplicate };
    } catch (e) {
        console.warn("[report]", e);
        return { ok: false, error: "failed" };
    }
}
