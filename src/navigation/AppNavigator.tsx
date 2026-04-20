import React, { useCallback } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import SignInScreen from "../screens/SignInScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import PlayScreen from "../screens/PlayScreen";
import { View, StyleSheet, Image } from "react-native";

export type RootStackParamList = {
    Splash: undefined;
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

    const handleOnboardingComplete = useCallback(() => {
        setIsOnboarded(true);
    }, [setIsOnboarded]);

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    animation: "fade",
                    contentStyle: { backgroundColor: "#0a0a1a" },
                }}
            >
                {isLoading ? (
                    <Stack.Screen name="Splash" component={SplashScreen} />
                ) : !isLoggedIn ? (
                    <Stack.Screen name="SignIn" component={SignInScreen} />
                ) : !isOnboarded ? (
                    <Stack.Screen name="Onboarding">
                        {() => (
                            <OnboardingScreen onComplete={handleOnboardingComplete} />
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
        backgroundColor: "#8B5CF6",
    },
    splashLogo: {
        width: 100,
        height: 100,
    },
});

