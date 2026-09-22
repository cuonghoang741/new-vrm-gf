import React, {
    useRef,
    useCallback,
    useImperativeHandle,
    forwardRef,
    useState,
} from "react";
import { StyleSheet, View, Platform } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

// ─── Public handle exposed via ref ───
export interface VRMViewerHandle {
    /** Load a VRM model by catalog name, e.g. "001/001_vrm/001_01.vrm" */
    loadModelByName: (name: string) => void;
    /** Load a VRM model by full URL */
    loadModelByURL: (url: string, displayName?: string) => void;
    /**
     * Load a VRM from a local file:// copy (see services/vrmCache), falling back
     * to `remoteUrl` if the page cannot read the file.
     */
    loadModelFromCache: (localUri: string, remoteUrl: string, displayName?: string) => void;
    /** Load an FBX animation by name, e.g. "Hip Hop Dancing.fbx" */
    loadAnimationByName: (name: string) => void;
    /** Play an FBX from an absolute URL (dance catalogue). */
    loadAnimationByURL: (url: string, name?: string) => void;
    /** Play the next random animation */
    loadNextAnimation: () => void;
    /** Stop the current animation and return back to idle */
    stopAnimation: () => void;
    /** Load random VRM + animation */
    loadRandomFiles: () => void;
    /** Set background image or video URL */
    setBackgroundImage: (url: string) => void;
    /** Next / previous background from fetched list */
    nextBackground: () => void;
    prevBackground: () => void;
    /** Enable / disable OrbitControls (rotate, zoom, pan) */
    setControlsEnabled: (enabled: boolean) => void;
    /** Blur the rendered 3D canvas (e.g. to tease a locked costume preview). */
    setPreviewBlur: (on: boolean) => void;
    /** 0 = high (default), 1 = balanced, 2 = battery saver. */
    setRenderQuality: (q: number) => void;
    /** Stop drawing frames (pre-warmed, hidden viewer) without unloading anything. */
    setRenderPaused: (paused: boolean) => void;
    /** Enable / disable call mode (head tracking, close-up camera) */
    setCallMode: (enabled: boolean) => void;
    /** Reset camera to default position */
    resetCamera: () => void;
    /** Set mouth openness for lipsync [0..1] */
    setMouthOpen: (value: number) => void;
    /** Play a random greeting animation */
    playRandomGreeting: () => void;
    /** Trigger a love expression */
    triggerLove: () => void;
    /** Trigger a dance animation */
    triggerDance: () => void;
    /** Run arbitrary JS inside the webview */
    injectJS: (js: string) => void;
}

// ─── Props ───
export interface VRMViewerProps {
    /** Optional initial VRM model catalog name to load on mount */
    initialModelName?: string;
    /** Optional initial VRM model URL to load on mount */
    initialModelURL?: string;
    /** Optional initial background image URL */
    initialBackgroundUrl?: string;
    /** Called when the WebView has finished initial load (model + background ready) */
    onReady?: () => void;
    /** Called when the VRM model is loaded into the scene */
    onModelLoaded?: () => void;
    /** Called for any message from the WebView */
    onMessage?: (message: string) => void;
    /** Whether the WebView canvas is transparent */
    transparent?: boolean;
    /** Container style override */
    style?: any;
    /**
     * Serve the page from this file:// URL instead of the bundled index.html.
     * iOS uses it so the page sits next to the cached models it must read.
     */
    sourceUri?: string;
    /** iOS: directory the page may read local files from (pairs with sourceUri). */
    allowingReadAccessToURL?: string;
}

const VRMViewer = forwardRef<VRMViewerHandle, VRMViewerProps>(
    (
        {
            initialModelName,
            initialModelURL,
            initialBackgroundUrl,
            onReady,
            onModelLoaded,
            onMessage,
            transparent = true,
            style,
            sourceUri,
            allowingReadAccessToURL,
        },
        ref
    ) => {
        const webViewRef = useRef<WebView>(null);
        const [isReady, setIsReady] = useState(false);

        // ─── JS injection helper ───
        const injectJS = useCallback((js: string) => {
            webViewRef.current?.injectJavaScript(`(function(){${js}})(); true;`);
        }, []);

        // ─── Expose imperative API ───
        useImperativeHandle(
            ref,
            () => ({
                loadModelByName: (name: string) => {
                    injectJS(`window.loadModelByName && window.loadModelByName('${name}')`);
                },
                loadModelByURL: (url: string, displayName = "Remote Model") => {
                    injectJS(
                        `window.__vrmLocalSrc = null; window.loadModelByURL && window.loadModelByURL('${url}', '${displayName}')`
                    );
                },
                loadModelFromCache: (localUri: string, remoteUrl: string, displayName = "Remote Model") => {
                    // three.js loads through fetch(), and Chromium's fetch refuses
                    // file:// outright — so read the file with XHR (which the
                    // WebView's file-access flags do allow), hand the page a blob:
                    // URL, and let the existing loader take it from there. Any
                    // failure falls back to the network URL, so a cache problem
                    // can cost speed but never the preview itself.
                    const L = JSON.stringify(localUri);
                    const R = JSON.stringify(remoteUrl);
                    const N = JSON.stringify(displayName);
                    injectJS(`
                        var local = ${L}, remote = ${R}, name = ${N};
                        if (!window.loadModelByURL) return;
                        // Same file already on screen: blob URLs differ per read,
                        // so the page's own same-URL check cannot catch this.
                        if (window.__vrmLocalSrc === local) return;
                        var report = function (m) {
                            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m);
                        };
                        var fallback = function () {
                            window.__vrmLocalSrc = null;
                            report('vrmCache:fallback');
                            window.loadModelByURL(remote, name);
                        };
                        try {
                            var x = new XMLHttpRequest();
                            x.open('GET', local, true);
                            x.responseType = 'blob';
                            x.onload = function () {
                                // file:// reports status 0 on success.
                                if ((x.status === 200 || x.status === 0) && x.response && x.response.size > 0) {
                                    var prev = window.__vrmBlobUrl;
                                    window.__vrmBlobUrl = URL.createObjectURL(x.response);
                                    window.__vrmLocalSrc = local;
                                    report('vrmCache:hit');
                                    window.loadModelByURL(window.__vrmBlobUrl, name);
                                    // Free the previous model's 17 MB once it can no longer be in use.
                                    if (prev) setTimeout(function () { URL.revokeObjectURL(prev); }, 30000);
                                } else {
                                    fallback();
                                }
                            };
                            x.onerror = fallback;
                            x.send();
                        } catch (e) {
                            fallback();
                        }
                    `);
                },
                loadAnimationByName: (name: string) => {
                    injectJS(
                        `window.loadAnimationByName && window.loadAnimationByName('${name}')`
                    );
                },
                loadAnimationByURL: (url: string, name?: string) => {
                    injectJS(
                        `window.loadAnimationByURL && window.loadAnimationByURL(${JSON.stringify(url)}, ${JSON.stringify(name ?? "")})`
                    );
                },
                loadNextAnimation: () => {
                    injectJS(`window.loadNextAnimation && window.loadNextAnimation()`);
                },
                stopAnimation: () => {
                    injectJS(`window.stopAnimation && window.stopAnimation()`);
                },
                loadRandomFiles: () => {
                    injectJS(`window.loadRandomFiles && window.loadRandomFiles()`);
                },
                setBackgroundImage: (url: string) => {
                    injectJS(`window.setBackgroundImage && window.setBackgroundImage('${url}')`);
                },
                nextBackground: () => {
                    injectJS(`window.nextBackground && window.nextBackground()`);
                },
                prevBackground: () => {
                    injectJS(`window.prevBackground && window.prevBackground()`);
                },
                setControlsEnabled: (enabled: boolean) => {
                    injectJS(`window.setControlsEnabled && window.setControlsEnabled(${enabled})`);
                },
                setRenderPaused: (paused: boolean) => {
                    injectJS(`window.setRenderPaused && window.setRenderPaused(${paused})`);
                },
                setPreviewBlur: (on: boolean) => {
                    injectJS(`window.setPreviewBlur && window.setPreviewBlur(${on})`);
                },
                setRenderQuality: (q: number) => {
                    injectJS(`window.setRenderQuality && window.setRenderQuality(${q | 0})`);
                },
                setCallMode: (enabled: boolean) => {
                    injectJS(`window.setCallMode && window.setCallMode(${enabled})`);
                },
                resetCamera: () => {
                    injectJS(`window.resetCamera && window.resetCamera()`);
                },
                setMouthOpen: (value: number) => {
                    injectJS(`window.setMouthOpen && window.setMouthOpen(${value})`);
                },
                playRandomGreeting: () => {
                    injectJS(`window.playRandomGreeting && window.playRandomGreeting()`);
                },
                triggerLove: () => {
                    injectJS(`window.triggerLove && window.triggerLove()`);
                },
                triggerDance: () => {
                    injectJS(`window.triggerDance && window.triggerDance()`);
                },
                injectJS,
            }),
            [injectJS]
        );

        // ─── Message handler ───
        const handleMessage = useCallback(
            (event: WebViewMessageEvent) => {
                const msg = event.nativeEvent.data;
                onMessage?.(msg);

                if (msg === "initialReady") {
                    setIsReady(true);
                    onReady?.();
                } else if (msg === "modelLoaded") {
                    onModelLoaded?.();
                } else if (__DEV__ && msg.startsWith("pageError:")) {
                    console.warn(`[VRMViewer] ${msg}`);
                } else if (msg.startsWith("vrmCache:")) {
                    // "hit" = read from disk; "fallback" = the page could not read
                    // the file and streamed it instead. A steady run of fallbacks
                    // on a device means local reads are blocked there.
                    console.log(`[VRMViewer] ${msg}`);
                }
            },
            [onReady, onModelLoaded, onMessage]
        );

        // ─── Injected JS that runs before page load ───
        // Sets native-selected model/background so the HTML picks them up on DOMContentLoaded
        const injectedJSBeforeLoad = `
      window.__isReactNativeShell = true;
      ${__DEV__ ? `(function(){function p(m){try{window.ReactNativeWebView.postMessage('pageError:'+m)}catch(e){}}
        window.addEventListener('error',function(e){p((e.message||'')+' @'+(e.filename||(e.target&&(e.target.src||e.target.href))||'')+':'+(e.lineno||''))},true);
        window.addEventListener('unhandledrejection',function(e){p('rejection '+(e.reason&&(e.reason.stack||e.reason.message)||e.reason))});})();` : ""}
      ${initialModelName ? `window.nativeSelectedModelName = '${initialModelName}';` : ""}
      ${initialModelURL ? `window.nativeSelectedModelURL = '${initialModelURL}';` : ""}
      ${initialBackgroundUrl ? `window.initialBackgroundUrl = '${initialBackgroundUrl}';` : ""}
      true;
    `;

        return (
            <View style={[styles.container, style]}>
                <WebView
                    ref={webViewRef}
                    // Android: load from android_asset (copied at build time by the
                    // withCopyIndexHtml plugin) — file:// avoids the http/DNS issues
                    // of require()'d assets. iOS: the bundled require() source works.
                    source={
                        sourceUri
                            ? { uri: sourceUri }
                            : Platform.OS === "android"
                                ? { uri: "file:///android_asset/index.html" }
                                : require("../../assets/index.html")
                    }
                    allowingReadAccessToURL={allowingReadAccessToURL}
                    style={[styles.webview, transparent ? styles.transparent : styles.opaque]}
                    originWhitelist={["*"]}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowFileAccess={true}
                    allowFileAccessFromFileURLs={true}
                    allowUniversalAccessFromFileURLs={true}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    injectedJavaScriptBeforeContentLoaded={injectedJSBeforeLoad}
                    onMessage={handleMessage}
                    scrollEnabled={false}
                    bounces={false}
                    overScrollMode="never"
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    // GPU-composite the WebView always (a software layer renders the
                    // WebGL canvas on the CPU = severe lag). An opaque WebView also
                    // avoids per-frame alpha-blending the 3D scene over the RN tree.
                    androidLayerType="hardware"
                />
            </View>
        );
    }
);

VRMViewer.displayName = "VRMViewer";

export default VRMViewer;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: "hidden",
    },
    webview: {
        flex: 1,
        backgroundColor: "transparent",
    },
    transparent: {
        backgroundColor: "transparent",
    },
    opaque: {
        backgroundColor: "#0a0a1a",
    },
});
