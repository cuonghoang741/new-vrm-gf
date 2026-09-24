import { supabase } from "../../config/supabase";
import { analyticsService } from "../../services/AnalyticsService";
import type { VRMViewerHandle } from "../../components/VRMViewer";
import type { CachedCharacter } from "./cache";

/**
 * What putting on an outfit is allowed to touch. Body moved verbatim from
 * PlayScreen's `handleCostumeSelect`, so the switch cannot have changed
 * behaviour — see [selectCharacter] for the same reasoning.
 */
export interface CostumeSelectDeps {
    userId: string | undefined;
    vrmRef: React.RefObject<VRMViewerHandle | null>;
    saveCache: (data: CachedCharacter) => void;

    characterId: string | null;
    characterName: string;
    characterThumbnail: string | null;
    characterAvatar: string | null;
    characterModelUrl: string | null;
    backgroundUrl: string | null;
    backgroundId: string | null;
    agentElevenlabsId: string | null;
    isBackgroundDark: boolean;

    setCharacterModelUrl: (v: string | null) => void;
    setCharacterThumbnail: (v: string | null) => void;
    setCharacterAvatar: (v: string | null) => void;
    setCharacterAvatarNoBg?: (v: string | null) => void;
    setCharacterAvatarSmall: (v: string | null) => void;
    setCostumeName: (v: string | null) => void;
    setBackgroundId: (v: string | null) => void;
    setIsNudeBlurred: (v: boolean) => void;
}

/** Apply a costume to the active character. */
export function selectCostume(costume: any, deps: CostumeSelectDeps) {
    const {
        userId, vrmRef, saveCache,
        characterId, characterName, characterThumbnail, characterAvatar, characterModelUrl,
        backgroundUrl, backgroundId, agentElevenlabsId, isBackgroundDark,
        setCharacterModelUrl, setCharacterThumbnail, setCharacterAvatar,
        setCharacterAvatarNoBg,
    setCharacterAvatarSmall, setCostumeName, setBackgroundId, setIsNudeBlurred,
    } = deps;
    const user = userId ? { id: userId } : null;

    analyticsService.logCostumeChange(
        costume.id ?? costume.costume_name ?? "unknown",
        characterId ?? undefined
    );
    setBackgroundId(costume.background_id || backgroundId);
    setCostumeName(costume.costume_name || null);
    if (costume.model_url) {
        setCharacterModelUrl(costume.model_url);
        setIsNudeBlurred(false);
        vrmRef.current?.loadModelByURL(costume.model_url, costume.costume_name);
    }

    // Cập nhật ảnh đại diện 2D từ costume.url
    // Nếu costume.url là VRM (data entry cũ), dùng thumbnail làm fallback
    const isImage = (uri?: string) => uri && /\.(png|jpg|jpeg|webp|gif)/i.test(uri);
    const avatarToSet = isImage(costume.url) ? costume.url : (isImage(costume.thumbnail) ? costume.thumbnail : costume.url);

    if (avatarToSet) {
        setCharacterAvatar(avatarToSet);
        setCharacterAvatarSmall(avatarToSet);
    }
    // The 2D layer's copy, with the outfit photographed against nothing.
    setCharacterAvatarNoBg?.(costume.url_nobg ?? costume.thumbnail_nobg ?? null);

    if (costume.thumbnail) {
        setCharacterThumbnail(costume.thumbnail);
    }

    // Cập nhật lại cache offline cho mượt
    if (characterId) {
        saveCache({
            characterId,
            characterName,
            modelUrl: costume.model_url || characterModelUrl || "",
            backgroundUrl,
            backgroundId,
            thumbnailUrl: costume.thumbnail || characterThumbnail || null,
            avatarUrl: costume.url || characterAvatar || null,
            agentElevenlabsId,
            isBackgroundDark,
        });
    }

    // Cache ownership
    if (user?.id && costume.id) {
        supabase.from("user_assets")
            .insert({ user_id: user.id, item_id: costume.id, item_type: "character_costume" })
            .then(() => { }, () => { });

        // Lưu trang phục cuối cùng của nhân vật này lên DB
        if (characterId) {
            supabase.from("user_character")
                .upsert(
                    { user_id: user.id, character_id: characterId, current_costume_id: costume.id },
                    { onConflict: "user_id,character_id" }
                )
                .then();
        }
    }
}
