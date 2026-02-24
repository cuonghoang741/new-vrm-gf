
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
    try {
        // 1. Authenticate the webhook
        const authHeader = req.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "").trim();

        if (!REVENUECAT_WEBHOOK_SECRET || token !== REVENUECAT_WEBHOOK_SECRET) {
            console.error("Unauthorized webhook attempt. Header:", authHeader);
            return new Response("Unauthorized", { status: 401 });
        }

        // 2. Parse the body
        const { event, api_version } = await req.json();
        if (!event) {
            return new Response("No event found", { status: 400 });
        }

        console.log(`Received Event: ${event.type} for User: ${event.app_user_id}`);

        const userId = event.app_user_id;

        // Filter out anonymous IDs if you only care about authenticated users
        // But sometimes you want to store it anyway.
        // Assuming app_user_id is the supabase user_id (UUID)

        // RevenueCat event types: https://www.revenuecat.com/docs/webhooks/event-types
        let updateData: any = {};
        let shouldUpdate = false;

        switch (event.type) {
            case "INITIAL_PURCHASE":
            case "RENEWAL":
            case "UNCANCELLATION":
            case "PRODUCT_CHANGE":
                updateData = {
                    tier: 'pro',
                    status: 'active',
                    plan: event.product_id || 'pro', // Fallback to 'pro' if product_id is missing
                    current_period_end: new Date(event.expiration_at_ms).toISOString(),
                    expires_at: new Date(event.expiration_at_ms).toISOString(),
                    updated_at: new Date().toISOString(),
                };
                shouldUpdate = true;
                break;

            case "CANCELLATION":
                // User turned off auto-renew. Status might still be active until expiration.
                // We often keep it 'active' but maybe mark auto_renew = false if we tracked it.
                // For simplicity, we just rely on expiration date, but let's update updated_at.
                // Or if it was a refund, it might be immediate.

                // If it sends expiration_at_ms, rely on that.
                if (event.expiration_at_ms) {
                    updateData = {
                        current_period_end: new Date(event.expiration_at_ms).toISOString(),
                        expires_at: new Date(event.expiration_at_ms).toISOString(),
                        updated_at: new Date().toISOString(),
                    }
                    shouldUpdate = true;
                }
                break;

            case "EXPIRATION":
                updateData = {
                    status: 'expired',
                    tier: 'free',
                    plan: event.product_id || 'free',
                    updated_at: new Date().toISOString(),
                };
                shouldUpdate = true;
                break;

            case "TEST":
                console.log("RevenueCat Test Webhook received");
                return new Response("Test OK", { status: 200 });

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        if (shouldUpdate && userId) {
            // Check if user exists first to avoid foreign key errors if RC sends garbage
            // or use upsert if we trust the ID.

            // Upsert into subscriptions table
            const { error } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    ...updateData
                }, { onConflict: 'user_id' }); // Assuming user_id is PK or unique

            if (error) {
                console.error("Failed to update subscription:", error);
                return new Response("Database error", { status: 500 });
            }
            console.log(`Successfully updated subscription for user ${userId}`);

            // Grant 30 minutes (1800 seconds) call quota if user is on PRO tier
            if (updateData.tier === 'pro') {
                const PRO_QUOTA_SECONDS = 1800;
                const { error: quotaError } = await supabase
                    .from('user_call_quota')
                    .upsert({
                        user_id: userId,
                        remaining_seconds: PRO_QUOTA_SECONDS,
                        last_reset_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (quotaError) {
                    console.error("Failed to update user call quota:", quotaError);
                } else {
                    console.log(`Granted 30 mins call quota to user ${userId}`);
                }
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Error processing webhook:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
