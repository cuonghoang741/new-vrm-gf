import React, { PropsWithChildren, useEffect, useState, useCallback, useRef } from "react";
import { AuthContext } from "../hooks/useAuth";
import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true); // For initial boot
    const [isOnboarded, setIsOnboarded] = useState<boolean>(true);
    const [isInitializing, setIsInitializing] = useState<boolean>(true);
    const isLoadingRef = useRef(true);

    // Check onboarding status from database
    const checkOnboarding = useCallback(async (userId: string, retries = 1) => {
        try {
            console.log(`[Auth] Checking onboarding for user: ${userId} (retries left: ${retries})`);
            const { data, error } = await supabase
                .from("user_assets")
                .select("id")
                .eq("user_id", userId)
                .eq("item_type", "character")
                .limit(1);

            if (error && retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                // Ping session to ensure headers update
                await supabase.auth.getSession();
                return checkOnboarding(userId, retries - 1);
            }

            if (!error && data && data.length > 0) {
                setIsOnboarded(true);
            } else {
                console.log("[Auth] User NOT onboarded ❌");
                setIsOnboarded(false);
            }
        } catch (e) {
            console.error("[Auth] checkOnboarding error:", e);
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return checkOnboarding(userId, retries - 1);
            }
            setIsOnboarded(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!mounted) return;

                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user?.id) {
                    const { authManager } = await import("../services/AuthManager");
                    await authManager.updateCountryIfMissing(session.user.id);
                    await checkOnboarding(session.user.id);
                }
            } catch (error) {
                console.error("[Auth] Initial session fetch failed:", error);
            } finally {
                if (mounted) {
                    setIsLoading(false);
                    setIsInitializing(false);
                    isLoadingRef.current = false;
                }
            }
        };

        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;

            console.log("[Auth] Event:", event, "session user:", session?.user?.id);

            setSession(session);
            setUser(session?.user ?? null);

            if (event === "SIGNED_IN") {
                if (session?.user?.id) {
                    // WORKAROUND for Supabase + React Native Race Condition:
                    setTimeout(async () => {
                        // Force refresh internal state
                        await supabase.auth.getSession();
                        if (mounted) {
                            const { authManager } = await import("../services/AuthManager");
                            await authManager.updateCountryIfMissing(session.user.id);
                            await checkOnboarding(session.user.id);
                        }
                    }, 500);
                }
            } else if (event === "SIGNED_OUT") {
                setIsOnboarded(false);
            }

            // Safety net: ensure loading is false if we get any event other than initial
            if (mounted && isLoadingRef.current && event !== "INITIAL_SESSION") {
                setIsLoading(false);
                isLoadingRef.current = false;
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [checkOnboarding]);

    return (
        <AuthContext.Provider
            value={{
                session,
                user,
                isLoading,
                isLoggedIn: !!session,
                isOnboarded,
                setIsOnboarded,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
