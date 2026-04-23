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
