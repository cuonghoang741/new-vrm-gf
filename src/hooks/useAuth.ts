import { createContext, useContext } from "react";
import { Session, User } from "@supabase/supabase-js";

export interface AuthContextData {
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    isLoggedIn: boolean;
    isOnboarded: boolean;
    /**
     * False until the onboarding check has actually answered for this user.
     *
     * `isOnboarded` alone cannot say "I don't know yet", and its optimistic
     * default sent a brand-new account past the onboarding branch and onto
     * "Welcome back" for the half second the check was in flight.
     */
    isOnboardedKnown: boolean;
    setIsOnboarded: (value: boolean) => void;
}

export const AuthContext = createContext<AuthContextData>({
    session: null,
    user: null,
    isLoading: true,
    isLoggedIn: false,
    isOnboarded: false,
    isOnboardedKnown: false,
    setIsOnboarded: () => { },
});

export const useAuth = () => useContext(AuthContext);
