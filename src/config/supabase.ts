import { createClient } from "@supabase/supabase-js";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

const ExpoSecureStoreAdapter = {
    getItem: (key: string) => {
        return getItemAsync(key);
    },
    setItem: (key: string, value: string) => {
        if (value.length > 2048) {
            console.warn(
                "Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully."
            );
        }
        return setItemAsync(key, value);
    },
    removeItem: (key: string) => {
        return deleteItemAsync(key);
    },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://kwqqmjfsrgoczbutuisx.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cXFtamZzcmdvY3pidXR1aXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODI0MjcsImV4cCI6MjA4NzU1ODQyN30.SpEyZ4PPiq6JMpDJcZ-NVJSxNM6ORHp7ZJ9Bog3X9Tk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: ExpoSecureStoreAdapter as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
