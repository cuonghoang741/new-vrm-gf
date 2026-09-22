import { useCallback, useState, type RefObject } from "react";
import type { VRMViewerHandle } from "../../components/VRMViewer";
import type { Dance } from "../../components/sheets/DanceSheet";
import { track } from "../../services/economyService";
import { trackBond } from "../../services/bondService";

/**
 * Dance state for the play screen.
 *
 * The Dance button no longer shows an ad itself: it opens the dance picker,
 * where each dance carries its own unlock (free / one ad / PRO / ruby) and
 * the gate runs there. Stopping is never gated.
 */
export function useDance({
    vrmRef,
    is3DMode,
    setIs3DMode,
    characterId,
}: {
    vrmRef: RefObject<VRMViewerHandle | null>;
    /** Whose bond gains the XP for dancing. */
    characterId?: string | null;
    is3DMode: boolean;
    setIs3DMode: (on: boolean) => void;
}) {
    const [isDancing, setIsDancing] = useState(false);
    const [danceSheetOpen, setDanceSheetOpen] = useState(false);
    const [currentDanceId, setCurrentDanceId] = useState<string | null>(null);

    const playDance = useCallback(
        (dance: Dance) => {
            setCurrentDanceId(dance.id);
            setIsDancing(true);
            track("dance");
            void trackBond(characterId ?? "", "dance");
            // Dancing needs the 3D view. The WebView stays mounted in 2D, so
            // the model is normally already there; if it is still loading the
            // viewer queues the animation (window.__pendingAnimationURL).
            if (!is3DMode) setIs3DMode(true);
            vrmRef.current?.loadAnimationByURL(dance.file_url, dance.name);
        },
        [is3DMode, setIs3DMode, vrmRef, characterId]
    );

    const toggleDance = useCallback(() => {
        if (isDancing) {
            vrmRef.current?.stopAnimation();
            setIsDancing(false);
            setCurrentDanceId(null);
            return;
        }
        setDanceSheetOpen(true);
    }, [isDancing, vrmRef]);

    return { isDancing, setIsDancing, danceSheetOpen, setDanceSheetOpen, currentDanceId, playDance, toggleDance };
}
