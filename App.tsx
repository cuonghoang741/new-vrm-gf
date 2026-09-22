import React from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import AuthProvider from "./src/providers/AuthProvider";
import AppNavigator from "./src/navigation/AppNavigator";
import { ThemeProvider } from "./src/contexts/ThemeContext";
import { SubscriptionProvider } from "./src/contexts/SubscriptionContext";
import { useAuth } from "./src/hooks/useAuth";
import { ElevenLabsProvider } from "@elevenlabs/react-native";
import { OTAAutoUpdate } from "./src/components/OTA-update/OTAAutoUpdate";

import { AnalyticsProvider } from "./src/providers/AnalyticsProvider";
import { AdsProvider } from "./src/providers/AdsProvider";
import { AdOverlay } from "./src/components/ads/AdOverlay";





function AppWithSubscription() {
  const { user } = useAuth();
  return (
    <SubscriptionProvider userId={user?.id}>
      <AdsProvider>
        <ElevenLabsProvider audioSessionConfig={{ allowMixingWithOthers: true }}>
          <AppNavigator />
          <OTAAutoUpdate />
          <AdOverlay />
        </ElevenLabsProvider>
      </AdsProvider>
    </SubscriptionProvider>
  );
}

export default function App() {
  return (
    // Nothing mounted this before, so every `useSafeAreaInsets()` in the app
    // (quest page, character sheet, paywall) was reading zeros and content sat
    // under the status bar and gesture bar. `initialWindowMetrics` gives the
    // first frame real values instead of animating in from zero.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <AuthProvider>
          <AnalyticsProvider>
            <AppWithSubscription />
          </AnalyticsProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
