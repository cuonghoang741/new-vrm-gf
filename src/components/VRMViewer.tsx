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
    /** Load an FBX animation by name, e.g. "Hip Hop Dancing.fbx" */
    loadAnimationByName: (name: string) => void;
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
                        `window.loadModelByURL && window.loadModelByURL('${url}', '${displayName}')`
                    );
                },
                loadAnimationByName: (name: string) => {
                    injectJS(
                        `window.loadAnimationByName && window.loadAnimationByName('${name}')`
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
                }
            },
            [onReady, onModelLoaded, onMessage]
        );

        // ─── Injected JS that runs before page load ───
        // Sets native-selected model/background so the HTML picks them up on DOMContentLoaded
        const injectedJSBeforeLoad = `
      window.__isReactNativeShell = true;
      ${initialModelName ? `window.nativeSelectedModelName = '${initialModelName}';` : ""}
      ${initialModelURL ? `window.nativeSelectedModelURL = '${initialModelURL}';` : ""}
      ${initialBackgroundUrl ? `window.initialBackgroundUrl = '${initialBackgroundUrl}';` : ""}
      true;
    `;

        return (
            <View style={[styles.container, style]}>
                <WebView
                    ref={webViewRef}
                    source={
                        Platform.OS === "android"
                            ? { uri: "file:///android_asset/index.html" }
                            : require("../../assets/index.html")
                    }
                    style={[styles.webview, transparent && styles.transparent]}
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
                    // Transparent background for overlay usage
                    {...(transparent
                        ? {
                            androidLayerType: "hardware",
                        }
                        : {})}
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
});
