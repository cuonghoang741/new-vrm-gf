import { Platform } from 'react-native';
import {
    TikTokBusiness,
    TikTokContentEventName,
    TikTokContentEventParameter,
    TikTokContentEventContentsParameter,
    TikTokEventName,
} from 'react-native-tiktok-business-sdk';

/**
 * TikTok Business SDK: installs and in-app events for TikTok ads.
 *
 * Each platform is its own app in TikTok Events Manager, with its own TikTok
 * App ID and app secret (the SDK calls it the access token). They come from
 * the environment, never the repo; with none set the SDK is never started and
 * every call below is a no-op, so a build without them behaves as before.
 *
 * Purchases are sent by hand (`purchase_complete`, with value and currency)
 * and the SDK's own payment tracking is off: with both, every purchase would
 * reach TikTok twice and ROAS would read double.
 */
const IS_IOS = Platform.OS === 'ios';
const APP_ID = IS_IOS ? '6760695348' : 'com.truemate.girlfriend';
const TIKTOK_APP_ID = (IS_IOS
    ? process.env.EXPO_PUBLIC_TIKTOK_APP_ID_IOS
    : process.env.EXPO_PUBLIC_TIKTOK_APP_ID_ANDROID) ?? '';
const ACCESS_TOKEN = (IS_IOS
    ? process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN_IOS
    : process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN_ANDROID) ?? '';
// Debug mode sends to Events Manager's "Test events" tab instead of the live
// feed. On in dev, and in a QA build made with EXPO_PUBLIC_TIKTOK_DEBUG=1.
const DEBUG = __DEV__ || process.env.EXPO_PUBLIC_TIKTOK_DEBUG === '1';

let ready: Promise<boolean> | null = null;

export const TikTokService = {
    init(): Promise<boolean> {
        if (ready) return ready;
        if (!TIKTOK_APP_ID || !ACCESS_TOKEN) {
            if (__DEV__) console.log('[TikTok] not configured, SDK off');
            return (ready = Promise.resolve(false));
        }
        ready = TikTokBusiness.initializeSdk(APP_ID, TIKTOK_APP_ID, ACCESS_TOKEN, DEBUG, {
            disablePaymentTracking: true,
        })
            .then(() => {
                if (DEBUG) console.log('[TikTok] SDK started (debug)');
                return true;
            })
            .catch((e: unknown) => {
                console.warn('[TikTok] init failed:', e);
                return false;
            });
        return ready;
    },

    async setUserId(userId: string): Promise<void> {
        if (!(await (ready ?? Promise.resolve(false)))) return;
        try {
            // Only the account id: no name, phone or email leaves the app.
            await TikTokBusiness.identify(userId, '', '', '');
        } catch { /* best effort */ }
    },

    async logEvent(eventName: string, params: Record<string, any> = {}): Promise<void> {
        if (!(await (ready ?? Promise.resolve(false)))) return;
        try {
            switch (eventName) {
                case 'sign_in':
                    return void (await TikTokBusiness.trackEvent(TikTokEventName.LOGIN));
                case 'sign_up':
                    return void (await TikTokBusiness.trackEvent(TikTokEventName.REGISTRATION));
                case 'onboarding_complete':
                    return void (await TikTokBusiness.trackEvent(TikTokEventName.COMPLETE_TUTORIAL));
                case 'purchase_complete': {
                    const amount = params.amount ?? params.value ?? params.price;
                    if (typeof amount !== 'number' || amount <= 0) return;
                    const id = String(params.item_id ?? params.product_id ?? 'unknown');
                    await TikTokBusiness.trackContentEvent(TikTokContentEventName.PURCHASE, {
                        [TikTokContentEventParameter.CURRENCY]: params.currency ?? params.currency_code ?? 'USD',
                        [TikTokContentEventParameter.VALUE]: String(amount),
                        [TikTokContentEventParameter.CONTENT_TYPE]: String(params.item_type ?? 'product'),
                        [TikTokContentEventParameter.CONTENTS]: [{
                            [TikTokContentEventContentsParameter.CONTENT_ID]: id,
                            [TikTokContentEventContentsParameter.PRICE]: amount,
                            [TikTokContentEventContentsParameter.QUANTITY]: 1,
                        }],
                    });
                    return;
                }
                case 'currency_spend':
                    return void (await TikTokBusiness.trackEvent(TikTokEventName.SPEND_CREDITS));
                case 'quest_complete':
                    return void (await TikTokBusiness.trackEvent(TikTokEventName.UNLOCK_ACHIEVEMENT));
                case 'currency_purchase_start':
                    return void (await TikTokBusiness.trackContentEvent(TikTokContentEventName.CHECK_OUT, {
                        [TikTokContentEventParameter.CONTENT_TYPE]: String(params.item_type ?? 'product'),
                    }));
                case 'character_select':
                case 'costume_change':
                case 'background_change':
                    return void (await TikTokBusiness.trackContentEvent(TikTokContentEventName.VIEW_CONTENT, {
                        [TikTokContentEventParameter.CONTENT_TYPE]: eventName,
                    }));
                default:
                    // Everything else is noise for ad optimisation; Firebase
                    // and AppsFlyer still get it.
                    return;
            }
        } catch (e) {
            if (__DEV__) console.warn(`[TikTok] ${eventName} failed:`, e);
        }
    },
};
