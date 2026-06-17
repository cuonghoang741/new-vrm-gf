import React from "react";
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
    <ThemeProvider>
      <AuthProvider>
        <AnalyticsProvider>
          <AppWithSubscription />
        </AnalyticsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
