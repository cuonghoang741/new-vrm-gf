import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";
import { clearCharactersCache } from "../cache/charactersCache";

export class AuthService {
    /**
     * Get the current session
     */
    async getSession(): Promise<Session | null> {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session;
    }

    /**
     * Get the current user
     */
    async getUser(): Promise<User | null> {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        return data.user;
    }

    /**
     * Sign in with Apple ID Token (iOS native)
     */
    async signInWithAppleIdToken(
        identityToken: string,
        nonce: string,
        authorizationCode: string
    ) {
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "apple",
            token: identityToken,
            nonce,
            access_token: authorizationCode,
        });

        if (error) throw error;
        return data;
    }

    /**
     * Sign in with Google OAuth (opens browser)
     */
    async signInWithGoogleOAuth(redirectTo: string) {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo,
                queryParams: { prompt: "consent" },
                skipBrowserRedirect: true,
            },
        });

        if (error) throw error;
        return data;
    }

    /**
     * Set session from OAuth callback params
     */
    async setSessionFromParams(accessToken: string, refreshToken: string) {
        const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (error) throw error;
        return data;
    }

    /**
     * Sign out
     */
    async signOut() {
        clearCharactersCache();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    /**
     * Subscribe to auth state changes
     */
    onAuthStateChange(
        callback: (
            event: string,
            session: Session | null
        ) => void
    ) {
        return supabase.auth.onAuthStateChange(callback as any);
    }
}

export const authService = new AuthService();
