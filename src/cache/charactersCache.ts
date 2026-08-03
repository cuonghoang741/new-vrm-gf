import { supabase } from "../config/supabase";
import { Characters } from "../types/database";
import { currentLang } from "../i18n";

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

    // Localize name/description for the current language (falls back to the
    // base English text when a translation is missing).
    const lang = currentLang();
    const trMap: Record<string, { name?: string; description?: string }> = {};
    if (lang && lang !== "en") {
        const { data: tr } = await supabase
            .from("character_translates")
            .select("character_id, name, description")
            .eq("language_code", lang)
            .in("character_id", charIds);
        for (const r of (tr ?? []) as any[]) trMap[r.character_id] = r;
    }

    // Attach total_costumes + localized text to each character
    return data.map((c: any) => ({
        ...c,
        name: trMap[c.id]?.name || c.name,
        description: trMap[c.id]?.description || c.description,
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
