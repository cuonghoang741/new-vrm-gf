import React, { PropsWithChildren, useEffect, useState, useCallback } from "react";
import { AuthContext } from "../hooks/useAuth";
import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";

export default function AuthProvider({ children }: PropsWithChildren) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isOnboarded, setIsOnboarded] = useState<boolean>(false);

    // Check onboarding status from database
    const checkOnboarding = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from("user_preferences")
                .select("onboarding_completed")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!error && data?.onboarding_completed) {
                setIsOnboarded(true);
            } else {
                setIsOnboarded(false);
            }
        } catch {
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
