import { supabase } from "../config/supabase";
import { Session, User } from "@supabase/supabase-js";
import { clearCharactersCache } from "../cache/charactersCache";
import { analyticsService } from "./AnalyticsService";
import * as SecureStore from "expo-secure-store";
import { revenueCatManager } from "./revenueCatManager";

// Helper to ensure SUPABASE_URL and ANON_KEY are available (from config)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://kwqqmjfsrgoczbutuisx.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function ensureClientId(): Promise<string> {
  let clientId = await SecureStore.getItemAsync("client_id");
  if (!clientId) {
    clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await SecureStore.setItemAsync("client_id", clientId);
  }
  return clientId;
}

async function getSupabaseAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export class AuthManager {
  private _isDeletingAccount = false;
  private _user: User | null = null;

  constructor() {
    // Initialize user if there is a session already
    supabase.auth.getSession().then(({ data: { session } }) => {
      this._user = session?.user ?? null;
    });
  }

  setDeletingAccount(value: boolean) {
    this._isDeletingAccount = value;
  }

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
    this._user = data.user;
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
      this._user = data.user;
      analyticsService.setUserId(data.user.id);
      analyticsService.logSignIn("apple");
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
      this._user = data.user;
      analyticsService.setUserId(data.user.id);
      analyticsService.logSignIn("google");
    }

    return data;
  }

  /**
   * Sign out
   */
  async logout() {
    analyticsService.logSignOut();
    clearCharactersCache();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // Alias for compatibility if needed
  async signOut() {
    return this.logout();
  }

  /**
   * Update user profile with country (based on timezone) if not set
   */
  async updateCountryIfMissing(userId: string) {
    try {
      // Check if country is already set
      const { data, error } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", userId)
        .maybeSingle();
      if (error || data?.country) return;

      // Get timezone (e.g., "Asia/Ho_Chi_Minh")
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (timeZone) {
        await supabase
          .from("profiles")
          .update({ country: timeZone })
          .eq("id", userId);
      }
    } catch (e) {
      console.warn("Timezone detection failed:", e);
    }
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      this._user = session?.user ?? null;
      if (session?.user) {
        this.updateCountryIfMissing(session.user.id);
      }
      callback(event, session);
    });
  }

  /**
   * Local account deletion by running DELETE queries on all user-related tables.
   * This is simpler than using an edge function as it runs directly from the client.
   */
  async deleteAccountLocally(onBeforeLogout?: () => void | Promise<void>): Promise<void> {
    if (this._isDeletingAccount) {
      return;
    }
    this.setDeletingAccount(true);
    try {
      const user = await this.getUser();
      const userId = user?.id?.toLowerCase() ?? null;
      const clientId = userId ? null : await ensureClientId();

      if (!userId && !clientId) {
        // No identifiers, just logout
        await this.clearLocalStateAfterDeletion();
        await onBeforeLogout?.();
        await this.logout();
        return;
      }

      const baseHeaders = await getSupabaseAuthHeaders();
      baseHeaders["Prefer"] = "return=minimal";

      const tablesToDelete = [
        "relationship_milestones",
        "character_relationship",
        "level_up_rewards",
        "user_daily_quests",
        "user_level_quests",
        "user_login_rewards",
        "user_streaks",
        "user_medals",
        "user_character",
        "user_stats",
        "user_currency",
        "user_assets",
        "transactions",
        "purchases",
        "subscriptions",
        "user_preferences",
        "api_characters",
        "conversation",
        "app_feedback",
        "calls",
        "scheduled_notifications",
        "user_notification_preferences",
        "spicy_content_notifications",
        "notification_counters",
        "user_call_quota",
      ];
      const tablesWithoutClientId = new Set(["api_characters", "subscriptions", "user_call_quota"]);

      for (const table of tablesToDelete) {
        try {
          const params = new URLSearchParams();
          if (userId) {
            params.append("user_id", `eq.${userId}`);
            if (!tablesWithoutClientId.has(table)) {
              params.append("client_id", "is.null");
            }
          } else if (clientId) {
            params.append("client_id", `eq.${clientId}`);
            params.append("user_id", "is.null");
          }

          const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
          const headers = { ...baseHeaders };
          if (!userId && clientId) {
            headers["X-Client-Id"] = clientId;
          }

          const response = await fetch(url, {
            method: "DELETE",
            headers,
          });

          if (!response.ok) {
            console.warn(
              `[AuthManager] Failed to delete ${table}: ${response.status} ${await response.text()}`
            );
          }
        } catch (error) {
          console.warn(`[AuthManager] Error deleting ${table}`, error);
        }
      }

      await this.clearLocalStateAfterDeletion();

      // Reset RevenueCat before callback to ensure no lingering pro state
      await revenueCatManager.logout();

      // Call callback before logout (so UI can respond before redirect)
      await onBeforeLogout?.();

      await this.logout();
    } catch (error) {
      console.error("[AuthManager] deleteAccountLocally failed", error);
      throw error;
    } finally {
      this.setDeletingAccount(false);
    }
  }

  async clearLocalStateAfterDeletion() {
    clearCharactersCache();
    // Clear all local caches/storage
    const keysToDelete = [
      "play_last_character",
      "client_id",
      "supabase.auth.token",
      "supabase-auth-token",
    ];
    for (const key of keysToDelete) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {}
    }
  }
}

export const authManager = new AuthManager();
// Alias for backward compatibility
export const authService = authManager;
