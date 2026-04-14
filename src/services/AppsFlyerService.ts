import appsFlyer from 'react-native-appsflyer';
import { Platform } from 'react-native';

const DEV_KEY = '9PnQZkZDCb8dXSaRinRZAN';
/**
 * iOS App ID is required for iOS.
 * Please replace with your actual Apple App ID (numeric ID from App Store Connect).
 * Example: '123456789'
 * If you don't have it yet, you can leave it as is or use a placeholder, 
 * but iOS tracking might not work correctly without it.
 */
const APPLE_APP_ID = '6760695348';

export const AppsFlyerService = {
    init: () => {
        appsFlyer.initSdk(
            {
                devKey: DEV_KEY,
                isDebug: __DEV__,
                appId: APPLE_APP_ID,
                onInstallConversionDataListener: true,
                onDeepLinkListener: true,
            },
            (result: any) => {
                console.log('✅ [AppsFlyer] Init success:', result);
            },
            (error: any) => {
                console.error('❌ [AppsFlyer] Init error:', error);
            }
        );
    },

    waitForInit: async (): Promise<void> => {
        // Simple delay to ensure init is called. 
        // In a real app, you might want a proper initialized Promise or Ready state.
        await new Promise(resolve => setTimeout(resolve, 1000));
    },

    logEvent: async (eventName: string, eventValues: Record<string, any> = {}) => {
        try {
            await AppsFlyerService.waitForInit(); // Ensure init has had a chance to run
            // Map internal events to AppsFlyer standard events
            const AV = appsFlyer.AF_EVENTS; // Access AppsFlyer constants if available, or use strings

            let mappedEventName = eventName;

            // Basic mapping
            switch (eventName) {
                case 'sign_in':
                    mappedEventName = 'af_login';
                    break;
                case 'sign_up':
                    mappedEventName = 'af_complete_registration';
                    break;
                case 'purchase_complete':
                    mappedEventName = 'af_purchase';
                    break;
                case 'onboarding_complete':
                    mappedEventName = 'af_tutorial_completion';
                    break;
                case 'character_select':
                case 'costume_change':
                case 'background_change':
                    mappedEventName = 'af_content_view';
                    break;
                case 'currency_purchase_start':
                    mappedEventName = 'af_initiated_checkout';
                    break;
            }

            await appsFlyer.logEvent(mappedEventName, eventValues);
            console.log(`[AppsFlyer] Event logged: ${mappedEventName} (was ${eventName})`);
        } catch (error) {
            console.error(`[AppsFlyer] Failed to log event ${eventName}:`, error);
        }
    }
};
