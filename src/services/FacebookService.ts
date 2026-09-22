import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';
import { getTrackingPermissionsAsync } from 'expo-tracking-transparency';

export const FacebookService = {
    /**
     * Log a custom event to Facebook Analytics
     */
    logEvent: async (eventName: string, params: Record<string, any> = {}) => {
        try {
            // For purchase complete, we want to use the dedicated logPurchase API
            // Note: SubscriptionSheet fires BOTH 'subscription_purchase' and 'purchase_complete'
            // We use 'purchase_complete' to register the real Revenue event, avoiding double counting.
            // 1. Special Handling for Revenue Events (Purchase)
            const isPurchaseEvent = 
                eventName === 'purchase_complete' || 
                eventName === 'currency_purchase_complete';

            if (isPurchaseEvent) {
                const amount = Number(params?.amount || params?.price || 0);
                const currency = String(params?.currency || params?.currency_code || 'USD');

                if (amount > 0) {
                    await AppEventsLogger.logPurchase(amount, currency, params);
                    console.log(`[Facebook] Purchase revenue logged: ${amount} ${currency} (${eventName})`);
                } else {
                    await AppEventsLogger.logEvent('fb_mobile_purchase', params);
                }
                return;
            }

            // 2. Map other generic event names to Facebook specific ones
            let mappedEventName = eventName;

            switch (eventName) {
                case 'sign_up':
                    mappedEventName = 'fb_mobile_complete_registration';
                    break;
                case 'currency_purchase_start':
                case 'purchase_start':
                    mappedEventName = 'fb_mobile_initiated_checkout';
                    break;
                case 'character_select':
                case 'costume_change':
                case 'background_change':
                    mappedEventName = 'fb_mobile_content_view';
                    break;
                case 'onboarding_complete':
                    mappedEventName = 'fb_mobile_tutorial_completion';
                    break;
                case 'subscription_purchase':
                    // Map to Facebook's Subscribe event
                    mappedEventName = 'fb_mobile_subscribe';
                    const price = Number(params?.price || 0);
                    if (price > 0) {
                        params.valueToSum = price;
                        params.fb_currency = params?.currency || 'USD';
                    }
                    break;

                // ── the rest of Meta's standard set ───────────────────────
                // Campaign optimisation can only target events Meta knows by
                // name; anything custom is invisible to it as a goal.
                case 'paywall_view':
                case 'hearts_store_view':
                    mappedEventName = 'fb_mobile_add_to_cart';
                    break;
                case 'checkout_payment_info':
                case 'purchase_pending':
                    mappedEventName = 'fb_mobile_add_payment_info';
                    break;
                case 'ruby_spent':
                case 'item_unlock_ruby':
                    mappedEventName = 'fb_mobile_spent_credits';
                    break;
                case 'bond_level_up':
                    // The retention signal for this app: how close someone got
                    // to a character is the clearest proxy for a good user.
                    mappedEventName = 'fb_mobile_level_achieved';
                    if (params?.level != null) params.fb_level = String(params.level);
                    break;
                case 'app_rate':
                    mappedEventName = 'fb_mobile_rate';
                    break;
                case 'search':
                    mappedEventName = 'fb_mobile_search';
                    break;
                case 'trial_start':
                    mappedEventName = 'StartTrial';
                    break;
            }

            await AppEventsLogger.logEvent(mappedEventName, params);
            console.log(`[Facebook] Event logged: ${mappedEventName} (was ${eventName})`);
        } catch (error) {
            console.warn(`[Facebook] Failed to log event ${eventName}:`, error);
        }
    },

    /**
     * Log a purchase event
     * Facebook has a specific method for purchases which is better for ad optimization
     */
    logPurchase: async (amount: number, currency: string, params: Record<string, any> = {}) => {
        try {
            await AppEventsLogger.logPurchase(amount, currency, params);
            console.log(`[Facebook] Purchase logged: ${amount} ${currency}`);
        } catch (error) {
            console.warn('[Facebook] Failed to log purchase:', error);
        }
    },

    /**
     * Initialize or configure settings if needed
     * Most init is handled by the native manifest/plist
     */
    init: async () => {
        Settings.setAutoLogAppEventsEnabled(true);
        Settings.setAdvertiserIDCollectionEnabled(true);

        // This was hardcoded to `false`, which switches off advertiser
        // tracking on iOS entirely — Meta then cannot attribute a single
        // install or conversion, so campaigns optimise against nothing. The
        // honest value is whatever the user answered in the ATT prompt, which
        // AdsManager already asks for.
        try {
            const { granted } = await getTrackingPermissionsAsync();
            Settings.setAdvertiserTrackingEnabled(!!granted);
            console.log('[Facebook] Advertiser tracking:', granted ? 'granted' : 'denied');
        } catch {
            Settings.setAdvertiserTrackingEnabled(false);
        }

        Settings.initializeSDK();
        // Meta's install-attribution signal. Without it a campaign cannot tell
        // which ad produced which install.
        AppEventsLogger.logEvent('fb_mobile_activate_app');
        console.log('[Facebook] SDK initialized');
    },

    /**
     * Re-apply the tracking flag after the ATT prompt is answered, since the
     * SDK is usually initialised before the user has decided.
     */
    refreshTrackingConsent: async () => {
        try {
            const { granted } = await getTrackingPermissionsAsync();
            Settings.setAdvertiserTrackingEnabled(!!granted);
        } catch {
            // Leave the previous value; a failed read is not a denial.
        }
    }
};
