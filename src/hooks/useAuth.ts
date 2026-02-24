import { createContext, useContext } from "react";
import { Session, User } from "@supabase/supabase-js";

export interface AuthContextData {
    session: Session | null;
    user: User | null;
    isLoading: boolean;
    isLoggedIn: boolean;
    isOnboarded: boolean;
    setIsOnboarded: (value: boolean) => void;
}

export const AuthContext = createContext<AuthContextData>({
    session: null,
    user: null,
    isLoading: true,
    isLoggedIn: false,
    isOnboarded: false,
    setIsOnboarded: () => { },
});

export const useAuth = () => useContext(AuthContext);
