import React, { useCallback, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import SignInScreen from "../screens/SignInScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PlayScreen from "../screens/PlayScreen";
import LanguageScreen from "../screens/LanguageScreen";
import WelcomeBackScreen from "../screens/WelcomeBackScreen";
import { View, StyleSheet, Image } from "react-native";
import { initI18n, hasChosenLanguage, setAppLanguage, currentLang } from "../i18n";
import { markAppOpened, isReturningSession } from "../services/session";

export type RootStackParamList = {
    Splash: undefined;
    Language: undefined;
    WelcomeBack: undefined;
    SignIn: undefined;
    Onboarding: undefined;
    Play: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Define a splash component to show during loading
function SplashScreen() {
    return (
        <View style={styles.loadingContainer}>
            <Image
                source={require("../../assets/splash-icon.png")}
                style={styles.splashLogo}
                resizeMode="contain"
            />
        </View>
    );
}

export default function AppNavigator() {
    const { isLoggedIn, isLoading, isOnboarded, setIsOnboarded } = useAuth();

    // Boot: session tracking + i18n init (device-locale / saved) + first-launch
    // language gate. Nothing with text renders until i18n is ready.
    const [booted, setBooted] = useState(false);
    const [needsLanguage, setNeedsLanguage] = useState(false);
    const [welcomeBackDone, setWelcomeBackDone] = useState(false);

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
        await setAppLanguage(currentLang());
        setNeedsLanguage(false);
    }, []);

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    animation: "fade",
                    contentStyle: { backgroundColor: "#0a0a1a" },
                }}
            >
                {!booted || isLoading ? (
                    <Stack.Screen name="Splash" component={SplashScreen} />
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

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#FF6FA5",
    },
    splashLogo: {
        width: 100,
        height: 100,
    },
});

