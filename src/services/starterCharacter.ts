import * as SecureStore from "expo-secure-store";
import { supabase } from "../config/supabase";
import { getCharacters } from "../cache/charactersCache";
import { onboardingDefaultCharacterId } from "./remoteConfig";

/**
 * Gives an account its first character without the onboarding questionnaire,
 * for when `onboarding_enabled` is off.
 *
 * Onboarding looks like a questionnaire but its real output is ownership: it
 * writes a row to `user_assets`, and `checkOnboarding` decides whether someone
 * is onboarded by asking whether such a row exists. Skip the screen without
 * this and the account never becomes onboarded, so it is sent back to a screen
 * that is switched off — a loop with no character and no way out.
 *
 * Which character: `onboarding_default_character_id` when set, otherwise the
 * first the catalogue returns (`characters.order` ascending, public and
 * available only), so the default is whatever the CMS has at the top.
 */
export async function grantStarterCharacter(userId: string): Promise<boolean> {
    try {
        const owned = await supabase
            .from("user_assets")
            .select("id")
            .eq("user_id", userId)
            .eq("item_type", "character")
            .limit(1);
        if (owned.data && owned.data.length > 0) return true;

        const catalogue = await getCharacters();
        if (!catalogue.length) return false;

        const wanted = onboardingDefaultCharacterId();
        const character =
            (wanted && catalogue.find((c) => c.id === wanted)) || catalogue[0];

        const backgroundId = character.background_default_id ?? null;
        const background = (character as any).backgrounds ?? null;

        const assets: Array<Record<string, string>> = [
            { user_id: userId, item_id: character.id, item_type: "character" },
        ];
        if (backgroundId) {
            assets.push({ user_id: userId, item_id: backgroundId, item_type: "background" });
        }

        const { error } = await supabase.from("user_assets").insert(assets);
        if (error) throw error;

        const { data: updated } = await supabase
            .from("user_preferences")
            .update({
                current_character_id: character.id,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .select();
        if (updated && updated.length === 0) {
            await supabase.from("user_preferences").insert({
                user_id: userId,
                current_character_id: character.id,
                updated_at: new Date().toISOString(),
            });
        }

        // What the play screen reads before its first query returns, so the
        // skip lands on a character instead of an empty stage.
        await SecureStore.setItemAsync(
            "play_last_character",
            JSON.stringify({
                characterId: character.id,
                characterName: character.name,
                modelUrl: character.base_model_url ?? "",
                backgroundUrl: background?.image ?? null,
                backgroundId,
                thumbnailUrl: character.thumbnail_url ?? null,
            })
        );

        return true;
    } catch (e) {
        console.warn("[starterCharacter]", e);
        return false;
    }
}
