import { useEffect } from "react";
import { getCharacters } from "../cache/charactersCache";
import { prefetch, prepareWebRoot } from "../services/vrmCache";

/**
 * Before the paywall is ever opened, download the one model it will show
 * first, so the preview comes up from disk instead of a 17 MB download.
 *
 * That model is the current character's BASE model — the paywall opens with
 * no costume selected (see SubscriptionSheet), not whatever outfit the user is
 * wearing on the main screen. If the character is not in the public roster the
 * paywall falls back to the first one, and so does this.
 *
 * Only one model, and only for non-PRO users: this spends the user's data on
 * something they have not asked for yet, so it stays to the single file that
 * makes the first open fast. PRO users rarely see the paywall at all.
 *
 * The delay keeps it off the startup path, where the main screen is busy
 * loading its own model and scene.
 */
const DELAY_MS = 15_000;

export function usePrefetchPaywallModel(characterId: string | null, isPro: boolean) {
    useEffect(() => {
        if (isPro || !characterId) return;
        const t = setTimeout(async () => {
            void prepareWebRoot();
            try {
                const roster = await getCharacters();
                const target = roster.find((c: any) => c.id === characterId) ?? roster[0];
                prefetch([(target as any)?.base_model_url]);
            } catch {
                /* the paywall still works without it, just slower */
            }
        }, DELAY_MS);
        return () => clearTimeout(t);
    }, [characterId, isPro]);
}
