import { AppEventsLogger, Settings } from 'react-native-fbsdk-next';

export const FacebookService = {
    /**
     * Log a custom event to Facebook Analytics
     */
    logEvent: async (eventName: string, params: Record<string, any> = {}) => {
        try {
            // For purchase complete, we want to use the dedicated logPurchase API
            // Note: SubscriptionSheet fires BOTH 'subscription_purchase' and 'purchase_complete'
            // We use 'purchase_complete' to register the real Revenue event, avoiding double counting.
            if (eventName === 'purchase_complete') {
                const amount = Number(params?.amount || 0);
                const currency = String(params?.currency || 'USD');

                if (amount > 0) {
                    await AppEventsLogger.logPurchase(amount, currency, params);
                    console.log(`[Facebook] Purchase revenue logged: ${amount} ${currency}`);
                } else {
                    await AppEventsLogger.logEvent('fb_mobile_purchase', params);
                    console.log(`[Facebook] Event logged: fb_mobile_purchase (was ${eventName})`);
                }

                // Return early so we don't duplicate via logEvent below
                return;
            }

            // Map other generic event names to Facebook specific ones
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
                    // Kept as 'subscription_purchase' to track the sub action,
                    // while Revenue generation is handled by 'purchase_complete' above.
                    mappedEventName = 'subscription_purchase';
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
    init: () => {
        Settings.setAdvertiserTrackingEnabled(false);
        Settings.setAutoLogAppEventsEnabled(true);
        Settings.initializeSDK();
        console.log('[Facebook] SDK Initialized');
    }
};
