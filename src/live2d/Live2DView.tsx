// The Live2D engine page, taken from fi005-live2d-ai at e676abd (official
// Cubism Web Framework 5, Cubism Core inlined, runs offline). Its window API is
// documented in that repo's docs/CONTRACTS.md §1.
//
// Calls made before the page reports `ready` are queued and flushed then, so
// callers never have to time them. A page the OS kills reloads itself; the
// parent reloads the model when it sees the next `ready`.
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { VIEWER_HTML } from "./viewerHtml";
import type { Live2DConfig, Live2DEffect, Live2DReaction } from "./types";

export type Live2DWeather = "none" | "sakura" | "rain" | "snow" | "fireflies" | "stars";

export type Live2DHandle = {
    load: (c: Live2DConfig) => void;
    react: (r: Live2DReaction) => void;
    resetExpression: () => void;
    /** Synthetic mouth flap for `ms`. */
    talk: (ms: number) => void;
    effect: (kind: Live2DEffect) => void;
    weather: (kind: Live2DWeather) => void;
    pause: () => void;
    resume: () => void;
};

export type Live2DEvent =
    | { type: "ready" }
    | { type: "loading" }
    | { type: "loaded"; expressions?: string[]; motions?: Record<string, number>; hitAreas?: string[] }
    | { type: "tap"; areas: string[]; x?: number; y?: number }
    | { type: "stroke"; progress: number }
    | { type: "strokeEnd" }
    | { type: "error"; message: string };

const js = (fn: string, ...args: unknown[]) =>
    `window.${fn} && window.${fn}(${args.map((a) => JSON.stringify(a ?? null)).join(",")})`;

export const Live2DView = forwardRef<Live2DHandle, { onEvent?: (e: Live2DEvent) => void }>(
    function Live2DView({ onEvent }, ref) {
        const web = useRef<WebView>(null);
        const ready = useRef(false);
        const queue = useRef<string[]>([]);

        const inject = (code: string) => web.current?.injectJavaScript(`try{${code}}catch(e){};true;`);
        const run = useCallback((code: string) => {
            if (ready.current) inject(code);
            else queue.current.push(code);
        }, []);

        useImperativeHandle(ref, () => ({
            load: (c) => run(js("loadModel", c.modelUrl, { scale: c.scale, offsetY: c.offsetY, offsetX: c.offsetX })),
            react: (r) => run(js("react", r)),
            resetExpression: () => run(js("resetExpression")),
            talk: (ms) => run(js("talk", Math.round(ms))),
            effect: (k) => run(js("effect", k)),
            weather: (k) => run(js("weather", k)),
            pause: () => run(js("pause")),
            resume: () => run(js("resume")),
        }), [run]);

        const onMessage = (e: WebViewMessageEvent) => {
            let msg: Live2DEvent;
            try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
            if (msg.type === "ready") {
                ready.current = true;
                queue.current.splice(0).forEach(inject);
            }
            onEvent?.(msg);
        };

        const onGone = () => { ready.current = false; web.current?.reload(); };

        return (
            <WebView
                ref={web}
                source={{ html: VIEWER_HTML, baseUrl: "https://live2d.app/" }}
                originWhitelist={["*"]}
                onMessage={onMessage}
                javaScriptEnabled
                domStorageEnabled
                style={styles.web}
                containerStyle={styles.web}
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                setBuiltInZoomControls={false}
                androidLayerType="hardware"
                cacheEnabled
                onRenderProcessGone={onGone}
                onContentProcessDidTerminate={onGone}
            />
        );
    },
);

const styles = StyleSheet.create({
    web: { flex: 1, backgroundColor: "transparent" },
});
