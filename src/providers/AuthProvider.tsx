import React, { PropsWithChildren, useEffect, useState, useCallback } from "react";
import { AuthContext } from "../hooks/useAuth";
import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isOnboarded, setIsOnboarded] = useState<boolean>(true); // Default true → show Play while checking

    // Check onboarding status from database
    const checkOnboarding = useCallback(async (userId: string) => {
        try {
            console.log("[Auth] Checking onboarding for user:", userId);
            const { data, error } = await supabase
                .from("user_assets")
                .select("id")
                .eq("user_id", userId)
                .eq("item_type", "character")
                .limit(1);

            console.log("[Auth] user_assets query result:", { data, error });

            if (!error && data && data.length > 0) {
                console.log("[Auth] User is onboarded ✅");
                setIsOnboarded(true);
            } else {
                console.log("[Auth] User NOT onboarded ❌");
                setIsOnboarded(false);
            }
        } catch (e) {
            console.error("[Auth] checkOnboarding error:", e);
            setIsOnboarded(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const fetchSession = async () => {
            setIsLoading(true);
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();
                if (!mounted) return;
                setSession(session);
                setUser(session?.user ?? null);

                // Check onboarding if logged in
                if (session?.user?.id) {
                    await checkOnboarding(session.user.id);
                }
            } catch (error) {
                console.error("Error fetching session:", error);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        fetchSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!mounted) return;
            setSession(session);
            setUser(session?.user ?? null);

            // Only re-check onboarding on actual sign-in (not INITIAL_SESSION which races with fetchSession)
            if (event === "SIGNED_IN" && session?.user?.id) {
                await checkOnboarding(session.user.id);
            } else if (event === "SIGNED_OUT") {
                setIsOnboarded(false);
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
