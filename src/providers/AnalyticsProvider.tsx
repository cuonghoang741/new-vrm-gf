import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Settings } from 'react-native-fbsdk-next';
import { useAuth } from '../hooks/useAuth';
import { analyticsService, AnalyticsEvents } from '../services/AnalyticsService';
import { AppsFlyerService } from '../services/AppsFlyerService';

interface AnalyticsProviderProps {
  children: React.ReactNode;
}

export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    const initSDKs = async () => {
      // 1. Initialize AppsFlyer through Service
      AppsFlyerService.init();

      // 2. Facebook SDK Initialized through Service
      Settings.setAdvertiserTrackingEnabled(false);
      Settings.initializeSDK();
      
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
