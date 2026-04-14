import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";
import { clearCharactersCache } from "../cache/charactersCache";
import { analyticsService } from "./AnalyticsService";

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
    async signInWithAppleIdToken(identityToken: string) {
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "apple",
            token: identityToken,
        });

        if (error) throw error;
        
        // Log Analytics
        if (data.user) {
            analyticsService.setUserId(data.user.id);
            analyticsService.logSignIn('apple');
        }
        
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

        if (data.user) {
            analyticsService.setUserId(data.user.id);
            analyticsService.logSignIn('google');
        }

        return data;
    }

    /**
     * Sign out
     */
    async signOut() {
        analyticsService.logSignOut();
        clearCharactersCache();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    /**
     * Update user profile with country (based on timezone) if not set
     */
    async updateCountryIfMissing(userId: string) {
        try {
            // Check if country is already set
            const { data, error } = await supabase.from('profiles').select('country').eq('id', userId).maybeSingle();
            if (error || data?.country) return;

            // Get timezone (e.g., "Asia/Ho_Chi_Minh")
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            
            if (timeZone) {
                await supabase.from('profiles').update({ country: timeZone }).eq('id', userId);
            }
        } catch (e) {
            console.warn("Timezone detection failed:", e);
        }
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
        return supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                this.updateCountryIfMissing(session.user.id);
            }
            callback(event, session);
        });
    }
}

export const authService = new AuthService();
