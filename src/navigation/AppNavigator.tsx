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
import {
    markAppOpened,
    isReturningSession,
    markWelcomePaywallPending,
} from "../services/session";
import { analyticsService } from "../services/AnalyticsService";
import { LoadingScreen } from "../screens/LoadingScreen";
import { useSplashAd } from "../hooks/useSplashAd";
import { clearResume, isResumePending, subscribeResume } from "../services/resumeGate";
import { onboardingEnabled, whenRemoteConfigReady } from "../services/remoteConfig";
import { grantStarterCharacter } from "../services/starterCharacter";

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
    const { user, isLoggedIn, isLoading, isOnboarded, isOnboardedKnown, setIsOnboarded } = useAuth();
    /** open_splash / inter_splash — holds the boot screen until the ad closes. */
    const { splashAdDone } = useSplashAd();

    // Boot: session tracking + i18n init (device-locale / saved) + first-launch
    // language gate. i18n is bootstrapped synchronously at module load, so
    // screens have strings from the first frame; this only applies a saved
    // language preference on top.
    const [booted, setBooted] = useState(false);
    /** Minimum dwell on the boot screen — see SPLASH_MIN_MS. */
    const [minDwellDone, setMinDwellDone] = useState(false);
    const [needsLanguage, setNeedsLanguage] = useState(false);
    const [welcomeBackDone, setWelcomeBackDone] = useState(false);
    /**
     * Returning from the background shows the welcome-back screen again, and
     * its CTA is what plays the App Open ad. Kept separate from
     * `welcomeBackDone` (which is about the cold-start case) so a resume later
     * in the session still gets the screen.
     */
    const [resumePending, setResumePending] = useState(false);
    useEffect(() => subscribeResume(() => setResumePending(isResumePending())), []);
    /**
     * Someone who just finished onboarding has not "come back" — they are
     * still in their first minute. Without this they landed on
     * "Welcome back, your companion missed you" the second they picked a
     * character, whenever the app had been opened before (e.g. they quit
     * during onboarding and restarted).
     */
    const [justOnboarded, setJustOnboarded] = useState(false);

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

    /**
     * `onboarding_enabled` off: grant the starter character and go straight to
     * play. Held on the boot screen while that runs, so the questionnaire
     * never shows for the frame it takes.
     *
     * The welcome paywall is armed here too. It is a separate surface that
     * happens to be triggered at the end of onboarding, and switching off the
     * questions should not quietly switch off the offer that follows them.
     *
     * If the grant fails — no catalogue, no network — nothing is skipped and
     * the real onboarding runs. Better a questionnaire than a play screen with
     * no character on it.
     */
    const [skippingOnboarding, setSkippingOnboarding] = useState(false);
    /** Whose skip has been tried — by id, so signing into a second account in
     *  the same session is not treated as the first one's second attempt. */
    const skipAttemptedFor = useRef<string | null>(null);

    useEffect(() => {
        if (!isLoggedIn || !isOnboardedKnown || isOnboarded) return;
        if (!user?.id || skipAttemptedFor.current === user.id) return;
        skipAttemptedFor.current = user.id;
        setSkippingOnboarding(true);
        (async () => {
            // The flag arrives from a network fetch, and this runs on a new
            // account's first launch — the one launch it has to be right on.
            // Waiting costs nothing the splash was not already spending.
            await whenRemoteConfigReady();
            if (!onboardingEnabled() && (await grantStarterCharacter(user.id))) {
                await markWelcomePaywallPending();
                setIsOnboarded(true);
            }
            setSkippingOnboarding(false);
        })();
    }, [isLoggedIn, isOnboardedKnown, isOnboarded, user?.id, setIsOnboarded]);

    const handleOnboardingComplete = useCallback(() => {
        setJustOnboarded(true);
        setIsOnboarded(true);
        // Arm the welcome paywall; the Play screen presents it once it is up.
        void markWelcomePaywallPending();
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
                {/* `isOnboardedKnown` belongs in this list: signing in flips
                    `isLoggedIn` immediately while the onboarding check is
                    still in flight, and `isOnboarded` defaults to true. A
                    brand-new account therefore fell past the onboarding
                    branch and flashed "Welcome back" for half a second
                    before landing where it belonged. Waiting on the boot
                    screen is the honest answer to "we do not know yet". */}
                {!booted || isLoading || !minDwellDone || !splashAdDone ||
                 (isLoggedIn && !isOnboardedKnown) || skippingOnboarding ? (
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
                ) : resumePending ? (
                    <Stack.Screen name="WelcomeBack">
                        {() => (
                            <WelcomeBackScreen
                                playAdOnContinue
                                onContinue={() => {
                                    clearResume();
                                    setResumePending(false);
                                }}
                            />
                        )}
                    </Stack.Screen>
                ) : isReturningSession() && !welcomeBackDone && !justOnboarded ? (
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

