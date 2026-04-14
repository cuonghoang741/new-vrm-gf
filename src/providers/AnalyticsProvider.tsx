import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Settings } from 'react-native-fbsdk-next';
import { useAuth } from '../hooks/useAuth';
import { analyticsService } from '../services/AnalyticsService';
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

  // Set Customer User ID when user logs in
  useEffect(() => {
    if (user?.id) {
      analyticsService.setUserId(user.id);
    }
  }, [user?.id]);

  return <>{children}</>;
};
