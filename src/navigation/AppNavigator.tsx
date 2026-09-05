import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    NavigationContainer,
    type NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import SignInScreen from "../screens/SignInScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PlayScreen from "../screens/PlayScreen";
import LanguageScreen from "../screens/LanguageScreen";
import WelcomeBackScreen from "../screens/WelcomeBackScreen";
import { initI18n, hasChosenLanguage, setAppLanguage, currentLang } from "../i18n";
import { markAppOpened, isReturningSession } from "../services/session";
import { analyticsService } from "../services/AnalyticsService";
import { LoadingScreen } from "../screens/LoadingScreen";

export type RootStackParamList = {
    Splash: undefined;
    Language: undefined;
    WelcomeBack: undefined;
    SignIn: undefined;
    Onboarding: undefined;
    Play: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * How long the boot screen stays up at minimum. It exists so the splash
 * banner has a window to fill in — boot itself resolves off local storage in
 * well under a second. Held as max(boot, this), never the sum.
 */
const SPLASH_MIN_MS = 2800;

export default function AppNavigator() {
    const { isLoggedIn, isLoading, isOnboarded, setIsOnboarded } = useAuth();

    // Boot: session tracking + i18n init (device-locale / saved) + first-launch
    // language gate. Nothing with text renders until i18n is ready.
    const [booted, setBooted] = useState(false);
    /** Minimum dwell on the boot screen — see SPLASH_MIN_MS. */
    const [minDwellDone, setMinDwellDone] = useState(false);
    const [needsLanguage, setNeedsLanguage] = useState(false);
    const [welcomeBackDone, setWelcomeBackDone] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setMinDwellDone(true), SPLASH_MIN_MS);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                await markAppOpened();
                await initI18n();
                setNeedsLanguage(!(await hasChosenLanguage()));
            } catch {
                /* i18n fail-safe → default 'en', skip language gate */
            } finally {
                setBooted(true);
            }
        })();
    }, []);

    const handleOnboardingComplete = useCallback(() => {
        setIsOnboarded(true);
    }, [setIsOnboarded]);

    const handleLanguageDone = useCallback(async () => {
        // Persist the current selection (device default or picked) so the
        // language screen never shows again.
        const chosen = currentLang();
        await setAppLanguage(chosen);
        analyticsService.logLanguageSelect(chosen, "onboarding");
        setNeedsLanguage(false);
    }, []);

    // Screen tracking: one place that covers every screen in the stack, so a
    // new screen is tracked the moment it is added to the navigator.
    const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
    const routeNameRef = useRef<string | undefined>(undefined);

    const handleNavReady = useCallback(() => {
        const name = navRef.current?.getCurrentRoute()?.name;
        routeNameRef.current = name;
        if (name) analyticsService.logScreenView(name);
    }, []);

    const handleNavStateChange = useCallback(() => {
        const current = navRef.current?.getCurrentRoute()?.name;
        if (current && current !== routeNameRef.current) {
            routeNameRef.current = current;
            analyticsService.logScreenView(current);
        }
    }, []);

    return (
        <NavigationContainer
            ref={navRef}
            onReady={handleNavReady}
            onStateChange={handleNavStateChange}
        >
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    animation: "fade",
                    contentStyle: { backgroundColor: "#0a0a1a" },
                }}
            >
                {!booted || isLoading || !minDwellDone ? (
                    <Stack.Screen name="Splash" component={LoadingScreen} />
                ) : needsLanguage ? (
                    <Stack.Screen name="Language">
                        {() => <LanguageScreen onDone={handleLanguageDone} />}
                    </Stack.Screen>
                ) : !isLoggedIn ? (
                    <Stack.Screen name="SignIn" component={SignInScreen} />
                ) : !isOnboarded ? (
                    <Stack.Screen name="Onboarding">
                        {() => (
                            <OnboardingScreen onComplete={handleOnboardingComplete} />
                        )}
                    </Stack.Screen>
                ) : isReturningSession() && !welcomeBackDone ? (
                    <Stack.Screen name="WelcomeBack">
                        {() => (
                            <WelcomeBackScreen
                                onContinue={() => setWelcomeBackDone(true)}
                            />
                        )}
                    </Stack.Screen>
                ) : (
                    <Stack.Screen name="Play" component={PlayScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

