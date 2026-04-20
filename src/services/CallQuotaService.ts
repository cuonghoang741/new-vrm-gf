import { supabase } from '../config/supabase';

const FREE_QUOTA_SECONDS = 60;      // 1 minute free
const PRO_QUOTA_SECONDS = 3600;     // 60 minutes for PRO

export class CallQuotaService {
    /**
     * Return the default starting quota for a user based on their subscription.
     */
    static getDefaultQuota(isPro: boolean): number {
        return isPro ? PRO_QUOTA_SECONDS : FREE_QUOTA_SECONDS;
    }

    /**
     * Format remaining seconds as "M:SS".
     */
    static formatRemainingTime(totalSecs: number): string {
        const m = Math.floor(Math.max(0, totalSecs) / 60);
        const s = Math.floor(Math.max(0, totalSecs)) % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Fetch the remaining call quota from the database.
     * Falls back to the default if the row does not exist yet.
     */
    async fetchQuota(isPro: boolean): Promise<number> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) return CallQuotaService.getDefaultQuota(isPro);

            const { data, error } = await supabase
                .from('user_call_quota')
                .select('remaining_seconds')
                .eq('user_id', user.id)
                .single();

            if (error || !data) {
                // No row yet – return default and upsert
                const defaultQuota = CallQuotaService.getDefaultQuota(isPro);
                await supabase.from('user_call_quota').upsert(
                    { user_id: user.id, remaining_seconds: defaultQuota },
                    { onConflict: 'user_id' }
                );
                return defaultQuota;
            }

            return data.remaining_seconds ?? CallQuotaService.getDefaultQuota(isPro);
        } catch (error) {
            console.error('[CallQuotaService] fetchQuota error:', error);
            return CallQuotaService.getDefaultQuota(isPro);
        }
    }

    /**
     * Update the remaining call quota in the database.
     */
    async updateQuota(remainingSeconds: number): Promise<void> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) return;

            await supabase
                .from('user_call_quota')
                .upsert(
                    {
                        user_id: user.id,
                        remaining_seconds: Math.max(0, remainingSeconds),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id' }
                );
        } catch (error) {
            console.error('[CallQuotaService] updateQuota error:', error);
        }
    }

    /**
     * Deduct a number of seconds from the current quota.
     */
    async deductQuota(seconds: number): Promise<void> {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) return;

            const { data } = await supabase
                .from('user_call_quota')
                .select('remaining_seconds')
                .eq('user_id', user.id)
                .single();

            if (data) {
                const newQuota = Math.max(0, (data.remaining_seconds ?? 0) - seconds);
                await supabase
                    .from('user_call_quota')
                    .update({
                        remaining_seconds: newQuota,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', user.id);
            }
        } catch (error) {
            console.error('[CallQuotaService] deductQuota error:', error);
        }
    }
}

export const callQuotaService = new CallQuotaService();
