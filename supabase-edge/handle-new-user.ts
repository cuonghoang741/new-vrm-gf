import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Kept in the function's secrets, not in git.
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = '-1003649975869';

async function sendTelegramNotification(message: string) {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Failed to send Telegram notification:', e);
    }
}

serve(async (req) => {
    try {
        const payload = await req.json();
        const record = payload.record; 

        if (!record) {
            return new Response("No record found", { status: 400 });
        }

        const userId = record.id;
        const displayName = record.display_name || 'Người dùng mới';
        const country = record.country || 'N/A';
        const createdAt = record.created_at ? new Date(record.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A';

        const message = `👋 <b>NGƯỜI DÙNG MỚI ĐĂNG KÝ</b>\n\n👤 Tên: <b>${displayName}</b>\n🌍 Quốc gia: <code>${country}</code>\n⏰ Thời gian: <code>${createdAt}</code>\n🆔 ID: <code>${userId}</code>`;
        
        await sendTelegramNotification(message);

        return new Response(JSON.stringify({ success: true }), { 
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (error) {
        console.error("Error processing user webhook:", error);
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});
