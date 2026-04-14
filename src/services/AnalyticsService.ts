import { Platform } from 'react-native';
import { AppsFlyerService } from './AppsFlyerService';
import { FacebookService } from './FacebookService';

// Optional import for Firebase Analytics to prevent crash if not installed
let analytics: any = null;
try {
  // We use require to avoid build errors if the package is missing
  analytics = require('@react-native-firebase/analytics').default;
} catch (e) {
  // Firebase not installed yet
}

/**
 * Analytics Event Names - Centralized event definitions
 */
export const AnalyticsEvents = {
  // Auth Events
  SIGN_IN: 'sign_in',
  SIGN_UP: 'sign_up',
  SIGN_OUT: 'sign_out',
  DELETE_ACCOUNT: 'delete_account',

  // Onboarding Events
  ONBOARDING_START: 'onboarding_start',
  ONBOARDING_STEP: 'onboarding_step',
  ONBOARDING_COMPLETE: 'onboarding_complete',

  // Chat Events
  SEND_MESSAGE: 'send_message',
  RECEIVE_MESSAGE: 'receive_message',
  CHAT_OPEN: 'chat_open',
  CHAT_CLOSE: 'chat_close',
  CHAT_HISTORY_VIEW: 'chat_history_view',

  // Voice/Video Call Events
  VOICE_CALL_START: 'voice_call_start',
  VOICE_CALL_END: 'voice_call_end',
  VIDEO_CALL_START: 'video_call_start',
  VIDEO_CALL_END: 'video_call_end',

  // Character Events
  CHARACTER_SELECT: 'character_select',
  CHARACTER_UNLOCK: 'character_unlock',
  CHARACTER_SWIPE: 'character_swipe',
  CHARACTER_DETAIL_VIEW: 'character_detail_view',
  COSTUME_CHANGE: 'costume_change',
  COSTUME_UNLOCK: 'costume_unlock',
  BACKGROUND_CHANGE: 'background_change',
  BACKGROUND_UNLOCK: 'background_unlock',
  BACKGROUND_SWIPE: 'background_swipe',

  // VRM Actions
  DANCE_TRIGGER: 'dance_trigger',
  LOVE_TRIGGER: 'love_trigger',
  CAPTURE_PHOTO: 'capture_photo',
  ACTION_SUGGESTED: 'action_suggested',

  // Purchase Events  
  PURCHASE_START: 'purchase_start',
  PURCHASE_COMPLETE: 'purchase_complete',
  PURCHASE_FAILED: 'purchase_failed',
  PURCHASE_CANCELLED: 'purchase_cancelled',

  // Subscription Events
  SUBSCRIPTION_VIEW: 'subscription_view',
  SUBSCRIPTION_SELECT_PLAN: 'subscription_select_plan',
  SUBSCRIPTION_PURCHASE: 'subscription_purchase',
  SUBSCRIPTION_RESTORE: 'subscription_restore',
  SUBSCRIPTION_CANCEL: 'subscription_cancel',

  // Currency Events
  CURRENCY_PURCHASE_START: 'currency_purchase_start',
  CURRENCY_PURCHASE_COMPLETE: 'currency_purchase_complete',
  CURRENCY_SPEND: 'currency_spend',

  // Quest Events
  QUEST_VIEW: 'quest_view',
  QUEST_COMPLETE: 'quest_complete',
  QUEST_CLAIM: 'quest_claim',

  // Streak Events
  STREAK_VIEW: 'streak_view',
  STREAK_INCREASE: 'streak_increase',
  STREAK_CLAIM: 'streak_claim',
  STREAK_LOST: 'streak_lost',

  // Media Events
  MEDIA_VIEW: 'media_view',
  MEDIA_UNLOCK: 'media_unlock',
  MEDIA_SHARE: 'media_share',

  // Settings Events
  SETTINGS_OPEN: 'settings_open',
  SETTINGS_CHANGE: 'settings_change',

  // Notification Events
  NOTIFICATION_PERMISSION: 'notification_permission',
  NOTIFICATION_RECEIVED: 'notification_received',
  NOTIFICATION_OPENED: 'notification_opened',

  // UI Navigation Events
  SHEET_OPEN: 'sheet_open',
  SHEET_CLOSE: 'sheet_close',
  BUTTON_PRESS: 'button_press',

  // App Lifecycle Events
  APP_OPEN: 'app_open',
  APP_BACKGROUND: 'app_background',
  APP_FOREGROUND: 'app_foreground',

  // Error Events
  ERROR_OCCURRED: 'error_occurred',
  API_ERROR: 'api_error',
} as const;

type EventParams = Record<string, string | number | boolean | undefined>;

/**
 * Analytics Service
 * Singleton service for tracking user events across Firebase, AppsFlyer, and Facebook
 */
class AnalyticsService {
  private static instance: AnalyticsService;
  private isEnabled = true;

  private constructor() { }

  static get shared(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Enable/disable analytics collection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (analytics) {
      try { analytics().setAnalyticsCollectionEnabled(enabled); } catch (e) { }
    }
  }

  /**
   * Log a custom event
   */
  async logEvent(eventName: string, params?: EventParams): Promise<void> {
    if (!this.isEnabled) return;

    try {
      // 1. Firebase Analytics
      if (analytics) {
        try { await analytics().logEvent(eventName, params); } catch (e) { }
      }

      // 2. AppsFlyer
      await AppsFlyerService.logEvent(eventName, params);

      // 3. Facebook
      await FacebookService.logEvent(eventName, params);

      if (__DEV__) {
        console.log('[Analytics] Event logged:', eventName, params);
      }
    } catch (error) {
      console.warn('[Analytics] Failed to log event:', error);
    }
  }

  /**
   * Set the user ID for analytics
   */
  async setUserId(userId: string | null): Promise<void> {
    if (!userId) return;
    try {
      // Firebase
      if (analytics) {
        try { await analytics().setUserId(userId); } catch (e) { }
      }
      
      // AppsFlyer
      try {
        const appsFlyer = require('react-native-appsflyer').default;
        appsFlyer.setCustomerUserId(userId, (res: any) => {
           if (__DEV__) console.log('[AppsFlyer] User ID set:', userId, res);
        });
      } catch (e) {}

      // Facebook
      try {
        const { Settings } = require('react-native-fbsdk-next');
        Settings.setUserID(userId);
      } catch (e) {}

      if (__DEV__) console.log('[Analytics] User ID set:', userId);
    } catch (error) {
      console.warn('[Analytics] Failed to set user ID:', error);
    }
  }

  /**
   * Set user properties
   */
  async setUserProperties(properties: Record<string, string | null>): Promise<void> {
    try {
      if (analytics) {
        for (const [key, value] of Object.entries(properties)) {
          try { await analytics().setUserProperty(key, value); } catch (e) { }
        }
      }
      if (__DEV__) console.log('[Analytics] User properties set:', properties);
    } catch (error) {
      console.warn('[Analytics] Failed to set user properties:', error);
    }
  }

  /**
   * Log screen view
   */
  async logScreenView(screenName: string, screenClass?: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      if (analytics) {
        try {
          await analytics().logScreenView({
            screen_name: screenName,
            screen_class: screenClass || screenName,
          });
        } catch (e) { }
      }
      if (__DEV__) console.log('[Analytics] Screen view:', screenName);
    } catch (error) {
      console.warn('[Analytics] Failed to log screen view:', error);
    }
  }

  // ============ Auth Events ============

  async logSignIn(method: 'apple' | 'google' | 'email'): Promise<void> {
    await this.logEvent(AnalyticsEvents.SIGN_IN, { method });
  }

  async logSignUp(method: 'apple' | 'google' | 'email'): Promise<void> {
    await this.logEvent(AnalyticsEvents.SIGN_UP, { method });
  }

  async logSignOut(): Promise<void> {
    await this.logEvent(AnalyticsEvents.SIGN_OUT);
  }

  async logDeleteAccount(): Promise<void> {
    await this.logEvent(AnalyticsEvents.DELETE_ACCOUNT);
  }

  // ============ Onboarding Events ============

  async logOnboardingStart(): Promise<void> {
    await this.logEvent(AnalyticsEvents.ONBOARDING_START);
  }

  async logOnboardingStep(stepName: string, stepIndex: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.ONBOARDING_STEP, { step_name: stepName, step_index: stepIndex });
  }

  async logOnboardingComplete(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.ONBOARDING_COMPLETE, { character_id: characterId });
  }

  // ============ Chat Events ============

  async logSendMessage(characterId: string, messageLength?: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.SEND_MESSAGE, {
      character_id: characterId,
      message_length: messageLength
    });
  }

  async logReceiveMessage(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.RECEIVE_MESSAGE, { character_id: characterId });
  }

  async logChatOpen(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHAT_OPEN, { character_id: characterId });
  }

  async logChatClose(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHAT_CLOSE, { character_id: characterId });
  }

  async logChatHistoryView(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHAT_HISTORY_VIEW, { character_id: characterId });
  }

  // ============ Voice/Video Call Events ============

  async logVoiceCallStart(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.VOICE_CALL_START, { character_id: characterId });
  }

  async logVoiceCallEnd(durationSeconds: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.VOICE_CALL_END, { duration_seconds: durationSeconds });
  }

  async logVideoCallStart(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.VIDEO_CALL_START, { character_id: characterId });
  }

  async logVideoCallEnd(durationSeconds: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.VIDEO_CALL_END, { duration_seconds: durationSeconds });
  }

  // ============ Character Events ============

  async logCharacterSelect(characterId: string, characterName?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHARACTER_SELECT, {
      character_id: characterId,
      character_name: characterName
    });
  }

  async logCharacterUnlock(characterId: string, method: 'purchase' | 'free'): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHARACTER_UNLOCK, {
      character_id: characterId,
      method
    });
  }

  async logCharacterSwipe(direction: 'left' | 'right'): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHARACTER_SWIPE, { direction });
  }

  async logCharacterDetailView(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CHARACTER_DETAIL_VIEW, { character_id: characterId });
  }

  async logCostumeChange(costumeId: string, characterId?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.COSTUME_CHANGE, {
      costume_id: costumeId,
      character_id: characterId
    });
  }

  async logCostumeUnlock(costumeId: string, method: 'purchase' | 'free'): Promise<void> {
    await this.logEvent(AnalyticsEvents.COSTUME_UNLOCK, {
      costume_id: costumeId,
      method
    });
  }

  async logBackgroundChange(backgroundId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.BACKGROUND_CHANGE, { background_id: backgroundId });
  }

  async logBackgroundUnlock(backgroundId: string, method: 'purchase' | 'free'): Promise<void> {
    await this.logEvent(AnalyticsEvents.BACKGROUND_UNLOCK, {
      background_id: backgroundId,
      method
    });
  }

  async logBackgroundSwipe(direction: 'left' | 'right'): Promise<void> {
    await this.logEvent(AnalyticsEvents.BACKGROUND_SWIPE, { direction });
  }

  // ============ VRM Action Events ============

  async logDanceTrigger(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.DANCE_TRIGGER, { character_id: characterId });
  }

  async logLoveTrigger(characterId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.LOVE_TRIGGER, { character_id: characterId });
  }

  async logCapturePhoto(characterId: string, backgroundId?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CAPTURE_PHOTO, {
      character_id: characterId,
      background_id: backgroundId
    });
  }

  async logActionSuggested(action: string, confidence: number, parameters?: any): Promise<void> {
    await this.logEvent(AnalyticsEvents.ACTION_SUGGESTED, {
      action,
      confidence,
      parameters: JSON.stringify(parameters || {})
    });
  }

  // ============ Purchase Events ============

  async logPurchaseStart(itemType: string, itemId?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.PURCHASE_START, {
      item_type: itemType,
      item_id: itemId
    });
  }

  async logPurchaseComplete(itemId: string, itemType: string, amount: number, currency?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.PURCHASE_COMPLETE, {
      item_id: itemId,
      item_type: itemType,
      amount,
      currency
    });
  }

  async logPurchaseFailed(itemType: string, errorCode?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.PURCHASE_FAILED, {
      item_type: itemType,
      error_code: errorCode
    });
  }

  async logPurchaseCancelled(itemType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.PURCHASE_CANCELLED, { item_type: itemType });
  }

  // ============ Subscription Events ============

  async logSubscriptionView(): Promise<void> {
    await this.logEvent(AnalyticsEvents.SUBSCRIPTION_VIEW);
  }

  async logSubscriptionSelectPlan(planId: string, planName: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.SUBSCRIPTION_SELECT_PLAN, {
      plan_id: planId,
      plan_name: planName
    });
  }

  async logSubscriptionPurchase(planId: string, price: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.SUBSCRIPTION_PURCHASE, {
      plan_id: planId,
      price
    });
  }

  async logSubscriptionRestore(success: boolean): Promise<void> {
    await this.logEvent(AnalyticsEvents.SUBSCRIPTION_RESTORE, { success });
  }

  async logSubscriptionCancel(planId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.SUBSCRIPTION_CANCEL, { plan_id: planId });
  }

  // ============ Currency Events ============

  async logCurrencyPurchaseStart(currencyType: 'vcoin' | 'ruby', amount: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.CURRENCY_PURCHASE_START, {
      currency_type: currencyType,
      amount
    });
  }

  async logCurrencyPurchaseComplete(currencyType: 'vcoin' | 'ruby', amount: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.CURRENCY_PURCHASE_COMPLETE, {
      currency_type: currencyType,
      amount
    });
  }

  async logCurrencySpend(vcoinSpent: number, rubySpent: number, itemType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.CURRENCY_SPEND, {
      vcoin_spent: vcoinSpent,
      ruby_spent: rubySpent,
      item_type: itemType
    });
  }

  // ============ Quest Events ============

  async logQuestView(questType: 'daily' | 'level'): Promise<void> {
    await this.logEvent(AnalyticsEvents.QUEST_VIEW, { quest_type: questType });
  }

  async logQuestComplete(questId: string, questType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.QUEST_COMPLETE, {
      quest_id: questId,
      quest_type: questType
    });
  }

  async logQuestClaim(questId: string, rewardType: string, rewardAmount: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.QUEST_CLAIM, {
      quest_id: questId,
      reward_type: rewardType,
      reward_amount: rewardAmount
    });
  }

  // ============ Streak Events ============

  async logStreakView(currentStreak: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.STREAK_VIEW, { current_streak: currentStreak });
  }

  async logStreakIncrease(newStreak: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.STREAK_INCREASE, { new_streak: newStreak });
  }

  async logStreakClaim(streakDay: number, rewardType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.STREAK_CLAIM, {
      streak_day: streakDay,
      reward_type: rewardType
    });
  }

  async logStreakLost(previousStreak: number): Promise<void> {
    await this.logEvent(AnalyticsEvents.STREAK_LOST, { previous_streak: previousStreak });
  }

  // ============ Media Events ============

  async logMediaView(mediaId: string, mediaType: 'image' | 'video' | 'dance'): Promise<void> {
    await this.logEvent(AnalyticsEvents.MEDIA_VIEW, {
      media_id: mediaId,
      media_type: mediaType
    });
  }

  async logMediaUnlock(mediaId: string, mediaType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.MEDIA_UNLOCK, {
      media_id: mediaId,
      media_type: mediaType
    });
  }

  async logMediaShare(mediaId: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.MEDIA_SHARE, { media_id: mediaId });
  }

  // ============ Settings Events ============

  async logSettingsOpen(): Promise<void> {
    await this.logEvent(AnalyticsEvents.SETTINGS_OPEN);
  }

  async logSettingsChange(settingName: string, newValue: string | boolean): Promise<void> {
    await this.logEvent(AnalyticsEvents.SETTINGS_CHANGE, {
      setting_name: settingName,
      new_value: String(newValue)
    });
  }

  // ============ Notification Events ============

  async logNotificationPermission(granted: boolean): Promise<void> {
    await this.logEvent(AnalyticsEvents.NOTIFICATION_PERMISSION, { granted });
  }

  async logNotificationReceived(notificationType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.NOTIFICATION_RECEIVED, { notification_type: notificationType });
  }

  async logNotificationOpened(notificationType: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.NOTIFICATION_OPENED, { notification_type: notificationType });
  }

  // ============ UI Navigation Events ============

  async logSheetOpen(sheetName: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.SHEET_OPEN, { sheet_name: sheetName });
  }

  async logSheetClose(sheetName: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.SHEET_CLOSE, { sheet_name: sheetName });
  }

  async logButtonPress(buttonName: string, screenName?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.BUTTON_PRESS, {
      button_name: buttonName,
      screen_name: screenName
    });
  }

  // ============ App Lifecycle Events ============

  async logAppOpen(): Promise<void> {
    await this.logEvent(AnalyticsEvents.APP_OPEN);
  }

  async logAppBackground(): Promise<void> {
    await this.logEvent(AnalyticsEvents.APP_BACKGROUND);
  }

  async logAppForeground(): Promise<void> {
    await this.logEvent(AnalyticsEvents.APP_FOREGROUND);
  }

  // ============ Error Events ============

  async logError(errorType: string, errorMessage: string, errorStack?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.ERROR_OCCURRED, {
      error_type: errorType,
      error_message: errorMessage.substring(0, 100),
      error_stack: errorStack?.substring(0, 200)
    });
  }

  async logApiError(endpoint: string, statusCode: number, errorMessage?: string): Promise<void> {
    await this.logEvent(AnalyticsEvents.API_ERROR, {
      endpoint,
      status_code: statusCode,
      error_message: errorMessage?.substring(0, 100)
    });
  }
}

export const analyticsService = AnalyticsService.shared;
