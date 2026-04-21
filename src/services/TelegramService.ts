const TELEGRAM_BOT_TOKEN = '8626302744:AAG_mIQj8pu3g9thuE7kC7fd0Jq1abA0UjE';
const TELEGRAM_CHAT_ID = '-1003649975869';

export class TelegramService {
    static async sendNotification(message: string, parseMode: 'HTML' | 'Markdown' = 'HTML') {
        try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: message,
                    parse_mode: parseMode
                })
            });
        } catch (e) {
            console.error('[TelegramService] Failed to send notification:', e);
        }
    }

    static async notifyNewUser(user: { id: string, email?: string, name?: string, country?: string }) {
        const emoji = '🆕';
        const message = `${emoji} <b>NGƯỜI DÙNG MỚI ĐĂNG KÝ</b>\n\n👤 Tên: <b>${user.name || 'N/A'}</b>\n📧 Email: <code>${user.email || 'N/A'}</code>\n🌍 Country: <code>${user.country || 'N/A'}</code>\n🆔 ID: <code>${user.id}</code>`;
        await this.sendNotification(message);
    }
}
