import { supabase } from "../../config/supabase";
import { getCharacters } from "../../cache/charactersCache";
import type { CachedCharacter } from "./cache";

/**
 * Everything the character loader writes to, named.
 *
 * This ran as a 150-line `useEffect` inside PlayScreen. The problem was not
 * its length so much as that it wrote to a dozen pieces of state chosen from
 * whatever the closure happened to hold; nothing declared what a "character
 * load" was allowed to change. That list is now this type.
 */
export interface CharacterLoadTarget {
    userId: string | undefined;

    /** True until the first DB load settles — see PlayScreen's cache restore. */
    isCacheRestored: React.MutableRefObject<boolean>;
    saveCache: (data: CachedCharacter) => void;

    /**
     * The device cache as it was at launch. Awaited before deciding whether
     * the user's last background survives the load: reading the `backgroundId`
     * state instead raced the cache restore (it was still null), so the chosen
     * background was replaced by the character's default on every launch.
     */
    cached: Promise<CachedCharacter | null>;
    backgroundId: string | null;
    backgroundUrl: string | null;
    isBackgroundDark: boolean;

    setCharacterId: (v: string | null) => void;
    setCharacterName: (v: string) => void;
    setCharacterThumbnail: (v: string | null) => void;
    setCharacterAvatar: (v: string | null) => void;
    setCharacterModelUrl: (v: string | null) => void;
    setBaseModelUrl: (v: string | null) => void;
    setAgentElevenlabsId: (v: string | null) => void;
    setBackgroundId: (v: string | null) => void;
    setBackgroundUrl: (v: string | null) => void;
    setIsBackgroundDark: (v: boolean) => void;
}

/**
 * Load the signed-in user's current character (and its default background)
 * from Supabase, then refresh the local cache. Never throws.
 */
export async function loadCharacterForUser(c: CharacterLoadTarget): Promise<void> {
    if (!c.userId) return;
    try {
        const { data: prefs } = await supabase
            .from("user_preferences")
            .select("current_character_id")
            .eq("user_id", c.userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        let charId = prefs?.current_character_id;

        // Self-healing: If user bypassed Onboarding but their preference failed to save previously
        if (!charId) {
            console.log("[PlayScreen] No current_character_id found. Attempting to heal...");
            const { data: firstAsset } = await supabase
                .from("user_assets")
                .select("item_id")
                .eq("user_id", c.userId)
                .eq("item_type", "character")
                .limit(1)
                .maybeSingle();

            if (firstAsset?.item_id) {
                charId = firstAsset.item_id;
            } else {
                // Extreme fallback
                const { data: firstPublic } = await supabase.from("characters").select("id").eq("is_public", true).eq("available", true).limit(1).maybeSingle();
                if (firstPublic?.id) charId = firstPublic.id;
            }

            if (charId) {
                // Patch the missing user_preferences
                supabase.from("user_preferences").update({ current_character_id: charId, updated_at: new Date().toISOString() }).eq("user_id", c.userId).select().then(({ data }) => {
                    if (data && data.length === 0) {
                        supabase.from("user_preferences").insert({ user_id: c.userId, current_character_id: charId, updated_at: new Date().toISOString() }).then();
                    }
                });
            }
        }

        if (!charId) return;

        c.setCharacterId(charId);

        let { data: char } = await supabase
            .from("characters")
            .select("name, base_model_url, background_default_id, thumbnail_url, avatar, agent_elevenlabs_id")
            .eq("id", charId)
            .maybeSingle();

        if (!char) {
            console.log("[PlayScreen] Character not found in DB! Attempting to fallback to public character...");
            const { data: firstPublic } = await supabase.from("characters").select("id, name, base_model_url, background_default_id, thumbnail_url, avatar, agent_elevenlabs_id").eq("is_public", true).eq("available", true).limit(1).maybeSingle();
            if (firstPublic) {
                charId = firstPublic.id;
                char = firstPublic;
                supabase.from("user_preferences").update({ current_character_id: charId, updated_at: new Date().toISOString() }).eq("user_id", c.userId).then();
                c.setCharacterId(charId);
            } else {
                return;
            }
        }

        console.log("Character found:", char);

        let finalModelUrl = char ? (char.base_model_url ?? "") : "";
        let finalThumbnailUrl = char ? (char.thumbnail_url ?? null) : null;
        let finalAvatarUrl = char ? (char.avatar ?? null) : null;

        if (char) {
            // Lấy trang phục đang mặc hiện tại (nếu có)
            const { data: userChar } = await supabase
                .from("user_character")
                .select("current_costume_id")
                .eq("user_id", c.userId)
                .eq("character_id", charId)
                .maybeSingle();

            if (userChar?.current_costume_id) {
                const { data: costume } = await supabase
                    .from("character_costumes")
                    .select("model_url, thumbnail, url")
                    .eq("id", userChar.current_costume_id)
                    .maybeSingle();
                if (costume) {
                    if (costume.model_url) finalModelUrl = costume.model_url;
                    if (costume.thumbnail) finalThumbnailUrl = costume.thumbnail;
                    if (costume.url) finalAvatarUrl = costume.url;
                }
            }

            c.setCharacterName(char.name);
            c.setCharacterThumbnail(finalThumbnailUrl);
            c.setCharacterAvatar(finalAvatarUrl);
            if (finalModelUrl.endsWith(".vrm")) {
                c.setCharacterModelUrl(finalModelUrl);
                c.setBaseModelUrl(char.base_model_url); // Store the default base model
            }
            if (char.agent_elevenlabs_id) {
                c.setAgentElevenlabsId(char.agent_elevenlabs_id);
            }
        }

        const bgId = char?.background_default_id;
        let bgUrl: string | null = null;

        // Only override with default background if we HAVEN'T just restored from cache
        const cached = await c.cached;
        if (bgId) {
            if (cached?.backgroundId && cached.backgroundUrl) {
                console.log("[PlayScreen] Keeping cached background:", cached.backgroundId);
                bgUrl = cached.backgroundUrl;
            } else {
                c.setBackgroundId(bgId);
                const { data: bg } = await supabase.from("backgrounds").select("image, is_dark").eq("id", bgId).single();
                if (bg?.image) {
                    bgUrl = bg.image;
                    c.setBackgroundUrl(bgUrl);
                    c.setIsBackgroundDark(bg.is_dark ?? true);
                }
            }
        }


        // Clear the restoration flag after the first load attempt
        c.isCacheRestored.current = false;

        // Update cache
        if (char) {
            c.saveCache({
                characterId: charId,
                characterName: char.name,
                modelUrl: finalModelUrl,
                backgroundUrl: bgUrl,
                backgroundId: bgId ?? null,
                thumbnailUrl: finalThumbnailUrl,
                avatarUrl: finalAvatarUrl,
                agentElevenlabsId: char.agent_elevenlabs_id ?? null,
                isBackgroundDark: c.isBackgroundDark,
            });
        }
    } catch (e) {
        console.error("Failed to load character:", e);
    }
}
