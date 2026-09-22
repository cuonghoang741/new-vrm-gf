import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Kept in the function's secrets (dashboard → Edge Functions → Secrets), not in git.
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = '-1003649975869';
const TELEGRAM_MESSAGE_THREAD_ID = ''; // Removed thread id as per new chat structure if needed

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramNotification(message: string) {
    if (!TELEGRAM_BOT_TOKEN) return;
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

/**
 * Keep the money. RevenueCat sends the price the user actually paid and the
 * currency they paid it in; both used to end up only in a Telegram message.
 * One row per (transaction, event type) — `record_purchase` upserts on that,
 * so a webhook retry rewrites the same row instead of inventing a sale.
 */
async function recordPurchase(event: any, userId: string, txId: string, rubyAdded: number | null) {
    const { data, error } = await supabase.rpc("record_purchase", {
        p_user_id: userId,
        p_product_id: event.product_id ?? null,
        p_transaction_id: txId,
        p_event_type: event.type ?? null,
        p_price: event.price_in_purchased_currency ?? event.price ?? null,
        p_currency: event.currency ?? null,
        p_store: event.store ?? null,
        p_environment: event.environment ?? null,
        p_period_type: event.period_type ?? null,
        p_ruby_added: rubyAdded,
        p_purchased_at: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
        p_metadata: {
            entitlement_ids: event.entitlement_ids ?? null,
            country_code: event.country_code ?? null,
            original_transaction_id: event.original_transaction_id ?? null,
            price_usd: event.price ?? null,
            takehome_percentage: event.takehome_percentage ?? null,
            cancel_reason: event.cancel_reason ?? null,
            is_trial_conversion: event.is_trial_conversion ?? null,
            event_id: event.id ?? null,
        },
    });
    if (error || data?.error) {
        // Never fail the webhook over bookkeeping: the entitlement and the
        // ruby matter more than the receipt, and the receipt can be replayed.
        console.error("record_purchase failed:", error ?? data?.error, txId);
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

        // ── Ruby packs (consumables truemate.ruby.1 … .6) ─────────────────────
        // Never touch the subscription row for these. Fulfilment is idempotent
        // on the store transaction id (grant_ruby_pack dedups in ruby_ledger),
        // so RevenueCat's retries cannot pay twice.
        const productId: string = event.product_id || "";
        if (productId.startsWith("truemate.ruby.")) {
            const txId = event.transaction_id || event.original_transaction_id || event.id;
            if (!userId || !txId) return new Response("Missing user or transaction", { status: 400 });
            // A TEST event carrying a real product id must not pay anyone.
            if (event.type === "TEST") {
                return new Response("Test OK", { status: 200 });
            }
            const refund = event.type === "CANCELLATION" || event.type === "REFUND";
            const { data, error } = await supabase.rpc(refund ? "revoke_ruby_pack" : "grant_ruby_pack", {
                p_user_id: userId,
                p_product_id: productId,
                p_transaction_id: String(txId),
            });
            if (error) {
                console.error("Ruby pack fulfilment failed:", error);
                // 500 → RevenueCat retries the webhook.
                return new Response("Database error", { status: 500 });
            }
            // `grant_ruby_pack` reports its own refusals in the payload, not as
            // a transport error: `unknown_user` (the purchase was made before
            // Purchases.logIn, so it is filed under an anonymous RevenueCat id)
            // and `unknown_product` both used to come back here as a cheerful
            // 200 — the ruby was never credited, RevenueCat never retried, and
            // nothing anywhere recorded that someone had paid.
            if (data?.error) {
                console.error("Ruby pack not fulfilled:", data.error, productId, txId, userId);
                await sendTelegramNotification(
                    `⚠️ <b>RUBY CHƯA CỘNG</b>\n\n📦 ${productId}\n👤 <code>${userId}</code>\n🧾 <code>${txId}</code>\n❌ ${data.error}`
                );
                // Retry: an aliased/transferred user id can resolve later.
                return new Response(JSON.stringify({ error: data.error }), { status: 500 });
            }
            console.log(`Ruby pack ${refund ? "revoked" : "granted"}: ${productId} ${txId}`, data);

            await recordPurchase(event, userId, String(txId), refund ? -(data?.revoked ?? 0) : (data?.granted ?? 0));

            if (!refund && data?.granted) {
                const price = event.price_in_purchased_currency || 0;
                const currency = event.currency || "USD";
                await sendTelegramNotification(`💎 <b>MUA RUBY</b>\n\n📦 Gói: ${productId} (+${data.granted} ruby)\n👤 User: <code>${userId}</code>\n💵 Giá: ${price} ${currency}`);
            }
            return new Response(JSON.stringify({ received: true, ruby: data }), {
                headers: { "Content-Type": "application/json" },
            });
        }

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
                    // What they paid, where, and on which transaction. The row
                    // used to say only "pro, active, until <date>".
                    price: event.price_in_purchased_currency ?? null,
                    currency_code: event.currency ?? null,
                    store: event.store ?? null,
                    environment: event.environment ?? null,
                    period_type: event.period_type ?? null,
                    transaction_id: event.transaction_id ?? event.original_transaction_id ?? null,
                    purchased_at: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
                };
                shouldUpdate = true;
                break;

            // A refunded subscription used to be dropped on the floor: only
            // EXPIRATION ever downgraded anyone, so a refunded user kept PRO
            // until the period they no longer paid for ran out.
            case "REFUND":
                updateData = {
                    status: 'refunded',
                    tier: 'free',
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

            const subTx = event.transaction_id || event.original_transaction_id || event.id;
            if (subTx) await recordPurchase(event, userId, String(subTx), null);

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
