import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { VRMViewerHandle } from "../components/VRMViewer";
import {
    canReadLocalModels,
    ensureCached,
    getCachedUri,
    getWebRootSync,
    isDownloading,
    isVrmUrl,
    markWebRootBroken,
    prefetch,
    prepareWebRoot,
} from "../services/vrmCache";

/**
 * How long the copied iOS page gets to report ready before we give up on it.
 * Generous on purpose: a false alarm costs one page reload, a missed failure
 * leaves the paywall preview blank.
 */
const WEB_ROOT_READY_TIMEOUT_MS = 20_000;

/**
 * Chooses where the subscription preview loads each model from.
 *
 *  - cached on disk      -> local file, near-instant
 *  - download in flight  -> wait for it (it is already part-way there), then local
 *  - cold                -> stream from the network as before, which keeps the
 *                           page's own progress overlay, and cache it only after
 *                           it has finished showing
 *
 * The cold case deliberately does not download natively in parallel: two
 * copies of the same 17 MB file racing each other would make the one the
 * user is watching arrive later, not sooner.
 */
export function useVrmPreviewLoader(
    vrmRef: RefObject<VRMViewerHandle | null>,
    isOpened: boolean,
    vrmReady: boolean
) {
    // Start copying the iOS web root early so it is ready by the first open.
    useEffect(() => {
        void prepareWebRoot();
    }, []);

    // Captured once per open: switching the WebView's source while it is
    // showing would reload the whole page under the user.
    const [rootBroken, setRootBroken] = useState(false);
    const webRoot = useMemo(
        () => (isOpened && !rootBroken ? getWebRootSync() : null),
        [isOpened, rootBroken]
    );
    const local = canReadLocalModels(webRoot);

    // Safety net for the iOS page copy, which has not been exercised on a real
    // device: if the preview never reports ready while served from the copy,
    // switch back to the bundled page instead of leaving the paywall blank.
    useEffect(() => {
        if (!isOpened || !webRoot || vrmReady) return;
        const t = setTimeout(() => {
            markWebRootBroken();
            setRootBroken(true);
        }, WEB_ROOT_READY_TIMEOUT_MS);
        return () => clearTimeout(t);
    }, [isOpened, webRoot, vrmReady]);

    /** The model most recently asked for — a late download must not override it. */
    const requestedRef = useRef<string | null>(null);
    /** Streamed from the network; cache it once it is on screen. */
    const pendingCacheRef = useRef<string | null>(null);

    const showModel = useCallback(
        (url: string) => {
            const viewer = vrmRef.current;
            if (!viewer) return;
            requestedRef.current = url;

            const cached = local ? getCachedUri(url) : null;
            if (cached) {
                viewer.loadModelFromCache(cached, url);
                return;
            }
            if (local && isDownloading(url)) {
                void ensureCached(url).then((uri) => {
                    if (requestedRef.current !== url) return;
                    if (uri) vrmRef.current?.loadModelFromCache(uri, url);
                    else vrmRef.current?.loadModelByURL(url);
                });
                return;
            }
            viewer.loadModelByURL(url);
            pendingCacheRef.current = local && isVrmUrl(url) ? url : null;
        },
        [local, vrmRef]
    );

    /**
     * Call when a model has finished loading: cache what was just streamed,
     * then warm the models the user is most likely to swipe to next.
     */
    const onShown = useCallback(
        (neighbours: (string | null | undefined)[]) => {
            const pending = pendingCacheRef.current;
            pendingCacheRef.current = null;
            if (local) prefetch([pending, ...neighbours]);
        },
        [local]
    );

    return {
        showModel,
        onShown,
        /** Props for the preview <VRMViewer>. Empty on Android. */
        viewerSource: webRoot
            ? { sourceUri: webRoot.uri, allowingReadAccessToURL: webRoot.readAccess }
            : {},
    };
}
