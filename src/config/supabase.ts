import { createClient } from "@supabase/supabase-js";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { AppState } from "react-native";

/**
 * Chunked SecureStore adapter for Supabase Auth.
 * 
 * Expo SecureStore has a 2048 byte limit per key. Supabase JWT sessions
 * (especially with Apple/Google OAuth provider tokens) often exceed this.
 * 
 * This adapter splits large values into multiple chunks stored under
 * sequential keys (e.g. "key", "key-1", "key-2", ...) and reassembles
 * them on read. No additional packages needed.
 */
const CHUNK_SIZE = 2000; // Leave some margin under the 2048 limit

const ChunkedSecureStoreAdapter = {
    getItem: async (key: string): Promise<string | null> => {
        const firstChunk = await getItemAsync(key);
        if (firstChunk === null) return null;

        let result = firstChunk;
        let index = 1;
        while (true) {
            const chunk = await getItemAsync(`${key}-${index}`);
            if (chunk === null) break;
            result += chunk;
            index++;
        }
        return result;
    },

    setItem: async (key: string, value: string): Promise<void> => {
        // Clean up any old chunks from a previous save
        let oldIndex = 1;
        while (true) {
            const existing = await getItemAsync(`${key}-${oldIndex}`);
            if (existing === null) break;
            await deleteItemAsync(`${key}-${oldIndex}`);
            oldIndex++;
        }

        if (value.length <= CHUNK_SIZE) {
            await setItemAsync(key, value);
            return;
        }

        // Split into chunks
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
            chunks.push(value.substring(i, i + CHUNK_SIZE));
        }

        // First chunk under original key, rest under key-1, key-2, ...
        await setItemAsync(key, chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
            await setItemAsync(`${key}-${i}`, chunks[i]);
        }
    },

    removeItem: async (key: string): Promise<void> => {
        await deleteItemAsync(key);
        let index = 1;
        while (true) {
            try {
                const chunk = await getItemAsync(`${key}-${index}`);
                if (chunk === null) break;
                await deleteItemAsync(`${key}-${index}`);
                index++;
            } catch {
                break;
            }
        }
    },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://kwqqmjfsrgoczbutuisx.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cXFtamZzcmdvY3pidXR1aXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODI0MjcsImV4cCI6MjA4NzU1ODQyN30.SpEyZ4PPiq6JMpDJcZ-NVJSxNM6ORHp7ZJ9Bog3X9Tk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ChunkedSecureStoreAdapter as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

/**
 * Auto-refresh token when app comes to foreground.
 * This is critical for keeping the session alive and usable.
 */
AppState.addEventListener("change", (state) => {
    if (state === "active") {
        supabase.auth.startAutoRefresh();
    } else {
        supabase.auth.stopAutoRefresh();
    }
});
