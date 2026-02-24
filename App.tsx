import React from "react";
import AuthProvider from "./src/providers/AuthProvider";
import AppNavigator from "./src/navigation/AppNavigator";
import { ThemeProvider } from "./src/contexts/ThemeContext";
import { SubscriptionProvider } from "./src/contexts/SubscriptionContext";
import { useAuth } from "./src/hooks/useAuth";

function AppWithSubscription() {
  const { user } = useAuth();
  return (
    <SubscriptionProvider userId={user?.id}>
      <AppNavigator />
    </SubscriptionProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithSubscription />
      </AuthProvider>
    </ThemeProvider>
  );
}
