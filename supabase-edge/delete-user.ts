import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * delete-user
 *
 * Deletes ALL user data from every public table, then removes the
 * auth.users record via the admin API.  Must be called by the
 * authenticated user who wants to delete their own account.
 */
Deno.serve(async (req: Request) => {
    try {
        // ── Auth check ──────────────────────────────────────────────
        const authHeader = req.headers.get("Authorization") ?? "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // User-level client to get the caller's identity
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
        });
        const {
            data: { user },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const userId = user.id;

        // Admin client for deletions
        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ── Delete user data from all tables (order matters for FK) ──
        // Tables with no inbound FK first, then parents
        const tablesToDelete = [
            // Notifications & logs
            "notification_counters",
            "scheduled_notifications",
            "spicy_content_notifications",

            // Quest progress
            "user_daily_quests",
            "user_level_quests",

            // Rewards & milestones
            "level_up_rewards",
            "relationship_milestones",
            "user_login_rewards",
            "user_streaks",
            "user_medals",

            // Stories
            "user_character_stories",

            // Character state & relationships
            "character_relationship",
            "user_character",

            // Economy
            "user_assets",
            "transactions",
            "purchases",
            "user_currency",
            "user_call_quota",

            // Conversations & calls
            "conversation",
            "calls",

            // Subscriptions
            "subscriptions",

            // Feedback
            "app_feedback",

            // Preferences & notification prefs
            "user_notification_preferences",
            "user_preferences",

            // Stats
            "user_stats",

            // Profile (last, depends on auth.users)
            "profiles",
        ];

        const errors: string[] = [];

        for (const table of tablesToDelete) {
            const { error } = await admin.from(table).delete().eq("user_id", userId);
            if (error) {
                console.error(`[delete-user] Failed to delete from ${table}:`, error.message);
                errors.push(`${table}: ${error.message}`);
            }
        }

        // notification_logs uses external_user_id (text), not user_id (uuid)
        {
            const { error } = await admin
                .from("notification_logs")
                .delete()
                .eq("external_user_id", userId);
            if (error) {
                console.error("[delete-user] Failed to delete notification_logs:", error.message);
                errors.push(`notification_logs: ${error.message}`);
            }
        }

        // ── Delete auth user ────────────────────────────────────────
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
        if (deleteAuthError) {
            console.error("[delete-user] Failed to delete auth user:", deleteAuthError.message);
            errors.push(`auth.users: ${deleteAuthError.message}`);
        }

        if (errors.length > 0) {
            console.error("[delete-user] Completed with errors:", errors);
            return new Response(
                JSON.stringify({
                    success: false,
                    message: "Account partially deleted. Some data may remain.",
                    errors,
                }),
                { status: 207, headers: { "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Account and all data deleted." }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[delete-user] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});
