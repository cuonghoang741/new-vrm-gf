import React, { PropsWithChildren, useEffect, useState, useCallback, useRef } from "react";
import { AuthContext } from "../hooks/useAuth";
import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true); // For initial boot
    const [isOnboarded, setIsOnboardedRaw] = useState<boolean>(true);
    /**
     * Has the check above actually run for the signed-in user?
     *
     * `isOnboarded` defaults to true so a returning user never flickers
     * through onboarding — but that same default is a lie for a brand-new
     * account, and the navigator acted on it. This is the "we do not know
     * yet" the boolean could not express.
     */
    const [isOnboardedKnown, setIsOnboardedKnown] = useState<boolean>(false);

    const setIsOnboarded = useCallback((v: boolean) => {
        setIsOnboardedRaw(v);
        setIsOnboardedKnown(true);
    }, []);
    const [isInitializing, setIsInitializing] = useState<boolean>(true);
    const isLoadingRef = useRef(true);

    // Check onboarding status from database.
    //
    // A failed query is not an answer. It used to fall through to "not
    // onboarded", so on a slow or flaky connection an existing user was sent
    // back through onboarding, which grants another character and makes it
    // current. Seen on a congested emulator: a QA account with two characters
    // landed on "How old are you?". Now it retries with backoff, and if it
    // still cannot read the answer it assumes onboarded: the play screen
    // already heals an account with no character (it picks the first owned
    // one, else the first public one), while the opposite mistake rewrites a
    // real user's state.
    const checkOnboarding = useCallback(async (userId: string) => {
        const delays = [0, 600, 1500, 3000];
        for (const delay of delays) {
            if (delay) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                // Ping session to ensure headers update
                await supabase.auth.getSession();
            }
            try {
                const { data, error } = await supabase
                    .from("user_assets")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("item_type", "character")
                    .limit(1);
                if (!error) {
                    setIsOnboarded(!!data && data.length > 0);
                    return;
                }
                console.warn("[Auth] checkOnboarding query failed:", error.message);
            } catch (e) {
                console.warn("[Auth] checkOnboarding threw:", e);
            }
        }
        console.warn("[Auth] onboarding status unreadable; assuming onboarded");
        setIsOnboarded(true);
    }, [setIsOnboarded]);

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
                isOnboardedKnown,
                setIsOnboarded,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
