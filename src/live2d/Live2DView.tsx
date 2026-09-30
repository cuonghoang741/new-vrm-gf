// The Live2D engine page, taken from fi005-live2d-ai at e676abd (official
// Cubism Web Framework 5). The Cubism Core is downloaded once and inlined, see
// core.ts. Its window API is documented in that repo's docs/CONTRACTS.md §1.
//
// Calls made before the page reports `ready` are queued and flushed then, so
// callers never have to time them. A page the OS kills reloads itself; the
// parent reloads the model when it sees the next `ready`.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { VIEWER_HTML } from "./viewerHtml";
import { loadCubismCore, peekCubismCore } from "./core";
import type { Live2DConfig, Live2DEffect, Live2DReaction } from "./types";

/** The page's <script src> for the Core, swapped for the Core itself. */
const CORE_TAG = /<script src="https:\/\/cubism\.live2d\.com[^>]*><\/script>/;
/** Backoff while the Core has never been downloaded and the CDN is unreachable. */
const CORE_RETRY_MS = [1500, 3000, 6000, 12000, 20000];

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
    /** CSS blur over her canvas, in px; 0 clears it. The page itself has no blur. */
    setBlur: (px: number) => void;
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

        // The page is only built once the Core is in hand, and the Core is
        // inlined, so the page itself never depends on the network for it.
        const [core, setCore] = useState<string | null>(peekCubismCore);
        useEffect(() => {
            if (core) return;
            let alive = true;
            let attempt = 0;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const tryLoad = () => {
                loadCubismCore()
                    .then((c) => { if (alive) setCore(c); })
                    .catch(() => {
                        if (!alive) return;
                        timer = setTimeout(tryLoad, CORE_RETRY_MS[Math.min(attempt++, CORE_RETRY_MS.length - 1)]);
                    });
            };
            tryLoad();
            return () => { alive = false; if (timer) clearTimeout(timer); };
        }, [core]);
        // A replacer function, not a string: `$` sequences in the Core must not
        // be read as replacement patterns.
        const html = useMemo(
            () => (core ? VIEWER_HTML.replace(CORE_TAG, () => `<script>${core}</script>`) : null),
            [core]
        );

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
            setBlur: (px) => run(
                `document.querySelectorAll('canvas').forEach(function(c){c.style.transition='filter .25s ease';c.style.filter=${JSON.stringify(px > 0 ? `blur(${Math.round(px)}px)` : "")}})`
            ),
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

        if (!html) return null;

        return (
            <WebView
                ref={web}
                source={{ html, baseUrl: "https://live2d.app/" }}
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
