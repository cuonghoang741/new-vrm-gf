import { supabase } from "../../config/supabase";
import { chatService, ChatMessage, SuggestedAction } from "../../services/chatService";
import { track } from "../../services/trackEvents";
import type { VRMViewerHandle } from "../../components/VRMViewer";

/**
 * Everything a model-suggested action is allowed to do to the play scene.
 *
 * The dispatcher below used to be a `useCallback` inside PlayScreen, where the
 * set of things it could reach was whatever happened to be in scope — about
 * twenty pieces of state, invisible unless you read all 1600 lines. Naming
 * that set is the point of this type: it is now a hard, reviewable boundary,
 * and adding a new action makes any new capability it needs explicit.
 */
export interface SceneControls {
    vrmRef: React.RefObject<VRMViewerHandle | null>;
    isPro: boolean;
    is3DMode: boolean;
    characterId: string | null;
    characterModelUrl: string | null;
    userId: string | undefined;

    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setCharSheetOpen: (open: boolean) => void;
    setCostumeSheetOpen: (open: boolean) => void;
    setBgSheetOpen: (open: boolean) => void;
    setMediaSheetOpen: (open: boolean) => void;
    setSubscriptionOpen: (open: boolean) => void;
    setIs3DMode: (on: boolean) => void;
    setVrmReady: (ready: boolean) => void;
    setIsNudeBlurred: (on: boolean) => void;
    setBaseModelUrl: (url: string | null) => void;
    setCharacterModelUrl: (url: string | null) => void;
}

/** Below this the model is guessing; acting on it makes the app feel possessed. */
const MIN_CONFIDENCE = 0.5;

/** Run one suggested action against the scene. Safe to call with anything. */
export function executeSceneAction(action: SuggestedAction, c: SceneControls) {
    if (action.action === "none" || action.confidence < MIN_CONFIDENCE) return;

    console.log(`[PlayScreen] Action: ${action.action}`, action.parameters);

    switch (action.action) {
        case "play_animation":
            if (action.parameters.animationName) {
                c.vrmRef.current?.loadAnimationByName(action.parameters.animationName);
            }
            break;

        case "change_background":
            c.setBgSheetOpen(true);
            break;

        case "change_costume":
            c.setCostumeSheetOpen(true);
            break;

        case "change_character":
            c.setCharSheetOpen(true);
            break;

        case "send_photo":
        case "send_video":
        case "send_nude_media":
            void sendMedia(action.action, c, action.parameters.mediaTag);
            break;

        case "become_nude":
            void becomeNude(c);
            break;

        case "start_voice_call":
        case "start_video_call":
            c.vrmRef.current?.setCallMode(true);
            break;

        case "open_subscription":
            c.setSubscriptionOpen(true);
            break;

        default:
            break;
    }
}

async function sendMedia(
    action: "send_photo" | "send_video" | "send_nude_media",
    c: SceneControls,
    tag?: string
) {
    const type =
        action === "send_video" ? "video" : action === "send_nude_media" ? "nude" : "image";

    const media = await chatService.fetchRandomMedia(c.characterId || "", type, c.isPro, tag);
    if (!media) {
        // Fallback: open media sheet if no specific media found
        c.setMediaSheetOpen(true);
        return;
    }

    // Locked media is handled exactly as the gallery handles it: gallery media
    // carries no ruby price, so PRO is the only unlock and the paywall is the
    // whole interaction. The bubble still renders it blurred behind a lock, so
    // she is seen to have sent something rather than silently refusing.
    const isLocked = media.tier === "pro" && !c.isPro;
    if (isLocked) {
        track.itemSelect("gallery", media.id, true);
        track.unlockSelect("gallery", media.id, 0, "pro");
    }

    const mediaMsg: ChatMessage = {
        id: `ai-media-${Date.now()}`,
        role: "model",
        text: "", // Independent media message without text
        mediaUrl: media.url,
        mediaType: media.type,
        mediaTier: media.tier,
        createdAt: new Date(),
    };
    c.setMessages((prev) => [...prev, mediaMsg]);

    // Persist to DB with media_id link
    chatService.saveMediaMessage(c.characterId || "", c.userId || "", media.id);
}

async function becomeNude(c: SceneControls) {
    // 1. Force 3D Mode
    if (!c.is3DMode) {
        c.setIs3DMode(true);
        c.setVrmReady(false);
    }

    // 2. Find nude costume
    const { data: costumes } = await supabase
        .from("character_costumes")
        .select("*")
        .eq("character_id", c.characterId)
        .ilike("costume_name", "%nude%")
        .limit(1);

    if (!costumes || costumes.length === 0) {
        console.log("[PlayScreen] Action become_nude: No nude costume found for this character");
        // Fallback: show costume sheet so user can see available options
        c.setCostumeSheetOpen(true);
        return;
    }

    const nude = costumes[0];
    console.log(`[PlayScreen] Action become_nude: Applying costume ${nude.costume_name}`);

    if (c.characterModelUrl) {
        c.setBaseModelUrl(c.characterModelUrl);
    }
    c.setCharacterModelUrl(nude.model_url);
    c.vrmRef.current?.loadModelByURL(nude.model_url);

    // 3. Set blur if not pro
    if (!c.isPro) {
        c.setIsNudeBlurred(true);
    }
}
