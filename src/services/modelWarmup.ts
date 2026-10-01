import * as SecureStore from "expo-secure-store";
import { getCharacters } from "../cache/charactersCache";
import { onboardingDefaultCharacterId } from "./remoteConfig";
import { ensureCached, getCachedUri, isVrmUrl, prefetch, prepareWebRoot } from "./vrmCache";
import type { CachedCharacter } from "../screens/play/cache";

/**
 * Have her model on disk before the play screen asks for it.
 *
 * A VRM is ~15 MB; streamed on arrival it held the scene empty for seconds,
 * on a slow network for much longer. These start the download as early as we
 * can know which model it will be, so the play screen reads it from disk:
 *
 *  - sign-in screen: the default character a new account will be given
 *  - welcome back / app start: the character they were with last time
 *
 * All best effort and fire-and-forget; a failure just means streaming later.
 */

/** The character a new account starts with (same rule as grantStarterCharacter). */
export async function warmDefaultModel(): Promise<void> {
    try {
        void prepareWebRoot();
        const catalogue = await getCharacters();
        if (!catalogue.length) return;
        const wanted = onboardingDefaultCharacterId();
        const c = (wanted && catalogue.find((x) => x.id === wanted)) || catalogue[0];
        const url = (c as { base_model_url?: string | null }).base_model_url;
        if (isVrmUrl(url)) await ensureCached(url);
        // The next few in the catalogue, which the onboarding match and the
        // picker show first, queued behind it one at a time.
        prefetch(catalogue.slice(1, 3).map((x) => (x as { base_model_url?: string | null }).base_model_url));
    } catch { /* streaming later */ }
}

/** The character from last session (the snapshot PlayScreen keeps). */
export async function warmLastModel(): Promise<void> {
    try {
        void prepareWebRoot();
        const raw = await SecureStore.getItemAsync("play_last_character");
        if (!raw) return;
        const last = JSON.parse(raw) as CachedCharacter;
        if (!last.live2d && isVrmUrl(last.modelUrl)) await ensureCached(last.modelUrl);
    } catch { /* streaming later */ }
}

/** Disk copy if there is one; never waits. */
export const cachedModelUri = (url?: string | null) => getCachedUri(url);
