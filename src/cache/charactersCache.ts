import { supabase } from "../config/supabase";
import { Characters } from "../types/database";

/**
 * Lightweight in-memory cache for the public characters query.
 *
 * Flow:
 *  1. SignInScreen calls `fetchAndCache()` on mount → stores the result.
 *  2. OnboardingScreen calls `getCharacters()` → returns the cached data
 *     instantly, or falls back to a fresh fetch if the cache is empty.
 */

interface CachedCharacters {
    data: Characters[];
    timestamp: number;
}

let _cache: CachedCharacters | null = null;

/** The shared query that both screens need */
async function queryPublicCharacters(): Promise<Characters[]> {
    const { data, error } = await supabase
        .from("characters")
        .select("*, backgrounds!background_default_id(id, name, image)")
        .eq("is_public", true)
        .eq("available", true)
        .not("base_model_url", "ilike", "%.png")
        .order("order", { ascending: true });

    if (error || !data) return [];

    // Fetch available costume counts per character
    const charIds = data.map((c: any) => c.id);
    const { data: costumeCounts } = await supabase
        .from("character_costumes")
        .select("character_id")
        .eq("available", true)
        .in("character_id", charIds);

    // Build a count map
    const countMap: Record<string, number> = {};
    if (costumeCounts) {
        for (const row of costumeCounts) {
            countMap[row.character_id] = (countMap[row.character_id] || 0) + 1;
        }
    }

    // Attach total_costumes to each character
    return data.map((c: any) => ({
        ...c,
        total_costumes: countMap[c.id] || 0,
    })) as Characters[];
}

/** Fetch characters and store in cache. Called by SignInScreen. */
export async function fetchAndCacheCharacters(): Promise<Characters[]> {
    const chars = await queryPublicCharacters();
    _cache = { data: chars, timestamp: Date.now() };
    return chars;
}

/**
 * Get characters from cache if available, otherwise fetch fresh.
 * Called by OnboardingScreen.
 *
 * @param maxAgeMs  Cache is considered stale after this many ms (default 5 min)
 */
export async function getCharacters(maxAgeMs = 5 * 60 * 1000): Promise<Characters[]> {
    if (_cache && Date.now() - _cache.timestamp < maxAgeMs) {
        return _cache.data;
    }
    return fetchAndCacheCharacters();
}

/** Manually clear the cache (e.g. on sign-out) */
export function clearCharactersCache(): void {
    _cache = null;
}
