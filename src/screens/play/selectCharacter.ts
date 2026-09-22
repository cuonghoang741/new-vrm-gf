import { supabase } from "../../config/supabase";
import { chatService, ChatMessage } from "../../services/chatService";
import { analyticsService } from "../../services/AnalyticsService";
import type { VRMViewerHandle } from "../../components/VRMViewer";
import type { CachedCharacter } from "./cache";

/**
 * What switching to another character is allowed to touch.
 *
 * The body below is moved verbatim out of PlayScreen — deliberately not
 * rewritten, so this extraction cannot change behaviour. Only the surrounding
 * declaration is new, and it is the point: the switch writes to sixteen
 * pieces of state, which is worth being able to see at a glance.
 */
export interface CharacterSelectDeps {
    userId: string | undefined;
    is3DMode: boolean;
    /** Current scene values the switch reads before overwriting them. */
    backgroundUrl: string | null;
    backgroundId: string | null;
    agentElevenlabsId: string | null;
    isBackgroundDark: boolean;
    vrmRef: React.RefObject<VRMViewerHandle | null>;
    saveCache: (data: CachedCharacter) => void;

    setCharacterId: (v: string | null) => void;
    setCharacterName: (v: string) => void;
    setCharacterThumbnail: (v: string | null) => void;
    setCharacterThumbnailSmall: (v: string | null) => void;
    setCharacterAvatar: (v: string | null) => void;
    setCharacterAvatarSmall: (v: string | null) => void;
    setCharacterModelUrl: (v: string | null) => void;
    setBaseModelUrl: (v: string | null) => void;
    setAgentElevenlabsId: (v: string | null) => void;
    setBackgroundId: (v: string | null) => void;
    setBackgroundUrl: (v: string | null) => void;
    setBackgroundName: (v: string | null) => void;
    setIsBackgroundDark: (v: boolean) => void;
    setIsNudeBlurred: (v: boolean) => void;
    setIs3DMode: (v: boolean) => void;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

/** Switch the active character. Mirrors PlayScreen's old handleCharacterSelect. */
export async function selectCharacter(char: any, deps: CharacterSelectDeps) {
    const {
        userId, is3DMode, vrmRef, saveCache,
        backgroundUrl, backgroundId, agentElevenlabsId, isBackgroundDark,
        setCharacterId, setCharacterName, setCharacterThumbnail, setCharacterThumbnailSmall,
        setCharacterAvatar, setCharacterAvatarSmall, setCharacterModelUrl, setBaseModelUrl,
        setAgentElevenlabsId, setBackgroundId, setBackgroundUrl, setBackgroundName,
        setIsBackgroundDark, setIsNudeBlurred, setIs3DMode, setMessages,
    } = deps;
    const user = userId ? { id: userId } : null;

    setCharacterId(char.id);
    setCharacterName(char.name);
    setIsNudeBlurred(false);
    if (char.thumbnail_url) setCharacterThumbnail(char.thumbnail_url);

    // Fetch full detail for the character (including avatar/vrm/background)
    const { data: fullChar } = await supabase
        .from("characters")
        .select("base_model_url, background_default_id, thumbnail_url, avatar, small_thumb_url, small_avatar")
        .eq("id", char.id)
        .single();

    if (fullChar) {
        if (fullChar.thumbnail_url) setCharacterThumbnail(fullChar.thumbnail_url);
        if (fullChar.small_thumb_url) setCharacterThumbnailSmall(fullChar.small_thumb_url);
        if (fullChar.avatar) setCharacterAvatar(fullChar.avatar);
        if (fullChar.small_avatar) setCharacterAvatarSmall(fullChar.small_avatar);

        // Handle VRM if applicable
        if (fullChar.base_model_url?.toLowerCase().endsWith(".vrm")) {
            setCharacterModelUrl(fullChar.base_model_url);
            setBaseModelUrl(fullChar.base_model_url);
            vrmRef.current?.loadModelByURL(fullChar.base_model_url, char.name);
        } else {
            setCharacterModelUrl(null);
            setBaseModelUrl(null);
            setIs3DMode(false); // Drop back to 2D mode for non-VRM characters
        }

        // Handle Background
        let charBgUrl = backgroundUrl;
        let charBgId = fullChar.background_default_id || backgroundId;

        if (fullChar.background_default_id) {
            const { data: bgData } = await supabase
                .from("backgrounds")
                .select("image, is_dark, name")
                .eq("id", fullChar.background_default_id)
                .single();
            if (bgData?.image) {
                charBgUrl = bgData.image;
                setBackgroundUrl(charBgUrl);
                setBackgroundId(fullChar.background_default_id ?? null);
                setIsBackgroundDark(bgData.is_dark ?? true);
                setBackgroundName(bgData.name || null);
                if (is3DMode) vrmRef.current?.setBackgroundImage(charBgUrl!);
            }
        }

        // Log Analytics
        analyticsService.logCharacterSelect(char.id, char.name);

        // Update Cache
        saveCache({
            characterId: char.id,
            characterName: char.name,
            modelUrl: fullChar.base_model_url || "",
            backgroundUrl: charBgUrl,
            backgroundId: charBgId,
            thumbnailUrl: fullChar.thumbnail_url || char.thumbnail_url || null,
            avatarUrl: fullChar.avatar || null,
            smallThumbUrl: fullChar.small_thumb_url || null,
            smallAvatarUrl: fullChar.small_avatar || null,
            agentElevenlabsId,
            isBackgroundDark
        });
    }

    // Update user preference + cache ownership
    if (user?.id) {
        const { data: prefData } = await supabase.from("user_preferences").update({ current_character_id: char.id, updated_at: new Date().toISOString() }).eq("user_id", user.id).select();
        if (prefData && prefData.length === 0) {
            await supabase.from("user_preferences").insert({ user_id: user.id, current_character_id: char.id, updated_at: new Date().toISOString() });
        }
        supabase.from("user_assets")
            .insert({ user_id: user.id, item_id: char.id, item_type: "character" })
            .then(() => { }, () => { });
    }

    // Reload chat
    const uId = user?.id;
    const cId = char.id;
    if (uId && cId) {
        const history = await chatService.loadHistory(cId, uId);
        setMessages(history);
    }
}
