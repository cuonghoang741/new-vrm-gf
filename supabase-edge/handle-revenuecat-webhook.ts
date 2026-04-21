import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TELEGRAM_BOT_TOKEN = '8626302744:AAG_mIQj8pu3g9thuE7kC7fd0Jq1abA0UjE';
const TELEGRAM_CHAT_ID = '-1003649975869';
const TELEGRAM_MESSAGE_THREAD_ID = ''; // Removed thread id as per new chat structure if needed

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramNotification(message: string) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                message_thread_id: TELEGRAM_MESSAGE_THREAD_ID || undefined,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const resData = await response.json();
        if (resData.ok && resData.result?.message_id) {
            // Pin the purchase message
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/pinChatMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    message_id: resData.result.message_id,
                    disable_notification: true
                })
            });
        }
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

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
        const { event } = await req.json();
        if (!event) {
            return new Response("No event found", { status: 400 });
        }

        console.log(`Received Event: ${event.type} for User: ${event.app_user_id}`);

        const userId = event.app_user_id;

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
                    plan: event.product_id || 'pro',
                    current_period_end: new Date(event.expiration_at_ms).toISOString(),
                    expires_at: new Date(event.expiration_at_ms).toISOString(),
                    updated_at: new Date().toISOString(),
                };
                shouldUpdate = true;
                break;

            case "CANCELLATION":
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
            // Upsert into subscriptions table
            const { error } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    ...updateData
                }, { onConflict: 'user_id' });

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
                }
            }

            // --- Telegram Notification ---
            const type = event.type;
            if (type === 'INITIAL_PURCHASE' || type === 'RENEWAL') {
                // Fetch User Info
                const { data: profile } = await supabase.from('profiles').select('display_name, country').eq('id', userId).maybeSingle();
                const { data: stats } = await supabase.from('user_stats').select('created_at').eq('user_id', userId).maybeSingle();
                const { data: authUser } = await supabase.auth.admin.getUserById(userId).then(res => res.data).catch(() => ({ user: null }));
                
                const userName = profile?.display_name || authUser?.user?.email || 'N/A';
                const country = profile?.country || 'N/A';
                let daysUsed = 0;
                if (stats?.created_at) {
                    daysUsed = Math.floor((Date.now() - new Date(stats.created_at).getTime()) / (1000 * 60 * 60 * 24));
                }

                const price = event.price_in_purchased_currency || 0;
                const currency = event.currency || 'USD';
                const emoji = type === 'INITIAL_PURCHASE' ? '💰' : '🔄';
                const actionText = type === 'INITIAL_PURCHASE' ? 'MUA GÓI MỚI' : 'GIA HẠN GÓI';
                
                const message = `${emoji} <b>THÔNG BÁO DOANH THU</b>\n\n📌 Hành động: <b>${actionText}</b>\n👤 User: <b>${userName}</b>\n🌍 Country: <code>${country}</code>\n📅 Days used: <code>${daysUsed}</code>\n📦 Gói: ${event.product_id || 'pro'}\n💵 Giá: ${price} ${currency}`;
                
                await sendTelegramNotification(message);
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
