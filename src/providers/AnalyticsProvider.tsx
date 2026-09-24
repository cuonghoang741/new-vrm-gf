import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { crash } from '../services/crash';
import { analyticsService, AnalyticsEvents } from '../services/AnalyticsService';
import { AppsFlyerService } from '../services/AppsFlyerService';
import { FacebookService } from '../services/FacebookService';

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
  const { user } = useAuth();

  // Attach the signed-in user to crash reports. A stack trace without a user
  // is a bug you cannot reproduce and cannot tell anyone you fixed.
  useEffect(() => {
    crash.identify(user?.id ?? null, false);
  }, [user?.id]);

  useEffect(() => {
    const initSDKs = async () => {
      // 1. Initialize AppsFlyer through Service
      // Crashlytics first: a crash during the other SDKs' start-up is exactly
      // the kind this is here to catch.
      await crash.enable();

      AppsFlyerService.init();

      // 2. Facebook SDK — through the service, which reads the real ATT
      // answer and fires fb_mobile_activate_app. This used to call Settings
      // directly with advertiser tracking pinned to `false`, so Meta could not
      // attribute a single install and no campaign could optimise.
      await FacebookService.init();
      
      // 3. Log App Open
      await analyticsService.logAppOpen();
    };

    initSDKs();
  }, []);

  // Foreground / background, plus the time spent in one foreground stretch —
  // that duration is what turns raw opens into a session-length metric.
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const foregroundedAt = useRef<number>(Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;

      if (prev.match(/inactive|background/) && next === 'active') {
        foregroundedAt.current = Date.now();
        analyticsService.logAppForeground();
      } else if (prev === 'active' && next.match(/inactive|background/)) {
        const seconds = Math.round((Date.now() - foregroundedAt.current) / 1000);
        analyticsService.logEvent(AnalyticsEvents.APP_BACKGROUND, {
          foreground_seconds: seconds,
        });
      }
    });
    return () => sub.remove();
  }, []);

  // Set Customer User ID when user logs in
  useEffect(() => {
    if (user?.id) {
      analyticsService.setUserId(user.id);
    }
  }, [user?.id]);

  return <>{children}</>;
};
