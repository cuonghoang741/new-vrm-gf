import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";

/**
 * On-disk cache for VRM models, so the subscription preview opens on a local
 * file instead of a fresh 15–20 MB download every time.
 *
 * Why the app has to do this itself: the models live on R2 (`*.r2.dev`), which
 * sends no Cache-Control at all — only ETag/Last-Modified. The WebView's HTTP
 * cache can only guess at freshness for those, and Android's WebView cache is
 * small next to a 17 MB file. On top of that the paywall unmounts its WebView
 * on close, so the in-page cache in index.html dies with it. Nothing survived
 * between two opens.
 *
 * What is cached is deliberately narrow. The full catalogue is ~640 MB; the
 * cache holds what the user is about to look at (see `prefetch` callers) and
 * is capped at MAX_BYTES, oldest-used first out.
 *
 * Layout — everything under one folder, because on iOS the WebView may only
 * read files inside the directory it was granted (see `prepareWebRoot`):
 *
 *   <cache>/vrmweb/index.html   iOS only: copy of the viewer page
 *   <cache>/vrmweb/models/*.vrm
 *   <cache>/vrmweb/meta.json    url -> file, size, etag, last used
 */

const ROOT = new Directory(Paths.cache, "vrmweb");
const MODELS = new Directory(ROOT, "models");
const META = new File(ROOT, "meta.json");

/** ~17 models at the catalogue's average size. */
const MAX_BYTES = 300 * 1024 * 1024;

interface Entry {
    file: string;
    size: number;
    /** Recorded on the first revalidation, not at download time. */
    etag: string | null;
    lastUsed: number;
}

interface Meta {
    entries: Record<string, Entry>;
    /** Asset hash of the index.html copy, so an update to the page is picked up. */
    webRootHash?: string | null;
}

export interface WebRoot {
    /** file:// URL of the copied viewer page. */
    uri: string;
    /** Directory the WebView is allowed to read — covers the page and the models. */
    readAccess: string;
}

let meta: Meta | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<string, Promise<string | null>>();
/** URLs already checked against the server this session. */
const revalidated = new Set<string>();
/** Prefetches run one at a time so they never compete with each other. */
let queue: Promise<unknown> = Promise.resolve();

export function isVrmUrl(url?: string | null): url is string {
    return !!url && /^https?:\/\//i.test(url) && /\.vrm(\?|#|$)/i.test(url);
}

/** Stable, readable file name: 32-bit FNV-1a of the URL + its last path segment. */
function fileNameFor(url: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < url.length; i++) {
        h ^= url.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    const tail = (url.split(/[?#]/)[0].split("/").pop() || "model.vrm")
        .replace(/[^A-Za-z0-9._-]/g, "_")
        .slice(-48);
    return `${(h >>> 0).toString(16).padStart(8, "0")}-${tail}`;
}

function ensureDirs() {
    if (!ROOT.exists) ROOT.create({ intermediates: true, idempotent: true });
    if (!MODELS.exists) MODELS.create({ intermediates: true, idempotent: true });
}

function loadMeta(): Meta {
    if (meta) return meta;
    meta = { entries: {} };
    try {
        ensureDirs();
        if (META.exists) {
            const parsed = JSON.parse(META.textSync());
            if (parsed && typeof parsed === "object" && parsed.entries) meta = parsed;
        }
    } catch {
        meta = { entries: {} };
    }
    const m = meta as Meta;
    // The OS may purge the cache folder under storage pressure; forget what is gone.
    for (const [url, e] of Object.entries(m.entries)) {
        if (!new File(MODELS, e.file).exists) delete m.entries[url];
    }
    // A download interrupted by the app being killed leaves a .part behind.
    try {
        for (const f of MODELS.list()) {
            if (f instanceof File && f.uri.endsWith(".part")) f.delete();
        }
    } catch {
        /* best-effort */
    }
    return m;
}

function saveMeta() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
            ensureDirs();
            if (!META.exists) META.create();
            META.write(JSON.stringify(meta));
        } catch {
            /* best-effort: losing the index only costs a re-download */
        }
    }, 500);
}

/** file:// URI of the cached copy, or null. Counts as a use for eviction. */
export function getCachedUri(url?: string | null): string | null {
    if (!isVrmUrl(url)) return null;
    const m = loadMeta();
    const e = m.entries[url];
    if (!e) return null;
    const f = new File(MODELS, e.file);
    if (!f.exists) {
        delete m.entries[url];
        saveMeta();
        return null;
    }
    e.lastUsed = Date.now();
    saveMeta();
    return f.uri;
}

export function isDownloading(url?: string | null): boolean {
    return !!url && inflight.has(url);
}

/** Download if missing; resolves to the local URI, or null if it could not be fetched. */
export function ensureCached(url?: string | null): Promise<string | null> {
    if (!isVrmUrl(url)) return Promise.resolve(null);
    const hit = getCachedUri(url);
    if (hit) {
        void revalidate(url);
        return Promise.resolve(hit);
    }
    const running = inflight.get(url);
    if (running) return running;
    const p = download(url).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
}

/** Queue background downloads, one at a time. Non-VRM and empty entries are skipped. */
export function prefetch(urls: (string | null | undefined)[]) {
    for (const url of urls) {
        if (!isVrmUrl(url)) continue;
        queue = queue.then(() => ensureCached(url)).catch(() => null);
    }
}

async function download(url: string): Promise<string | null> {
    const m = loadMeta();
    const name = fileNameFor(url);
    // Download to .part and rename on success: a finished-looking file on disk
    // is then always a complete one, even if the app dies mid-download.
    const part = new File(MODELS, `${name}.part`);
    const dest = new File(MODELS, name);
    try {
        ensureDirs();
        if (part.exists) part.delete();
        const got = await File.downloadFileAsync(url, part, { idempotent: true });
        const size = got.size ?? 0;
        if (!size) throw new Error("empty download");
        if (dest.exists) dest.delete();
        got.move(dest);
        m.entries[url] = { file: name, size, etag: null, lastUsed: Date.now() };
        revalidated.add(url); // just fetched — current by definition
        evict(url);
        saveMeta();
        return dest.uri;
    } catch (e) {
        try {
            if (part.exists) part.delete();
        } catch {
            /* ignore */
        }
        console.warn("[vrmCache] download failed:", url, e);
        return null;
    }
}

/**
 * Once per session, ask the server whether a cached model changed under the
 * same URL (HEAD, so no body). The current open still uses the cached copy;
 * a changed model is re-downloaded in the background for the next one.
 */
async function revalidate(url: string) {
    if (revalidated.has(url)) return;
    revalidated.add(url);
    try {
        const res = await fetch(url, { method: "HEAD" });
        const etag = res.ok ? res.headers.get("etag") : null;
        const m = loadMeta();
        const e = m.entries[url];
        if (!e || !etag) return;
        if (e.etag === null) {
            e.etag = etag;
            saveMeta();
            return;
        }
        if (e.etag !== etag) {
            try {
                new File(MODELS, e.file).delete();
            } catch {
                /* ignore */
            }
            delete m.entries[url];
            saveMeta();
            prefetch([url]);
        }
    } catch {
        /* offline: keep what we have */
    }
}

/** Drop least-recently-used models until under MAX_BYTES, never `keep`. */
function evict(keep?: string) {
    const m = loadMeta();
    let total = Object.values(m.entries).reduce((s, e) => s + e.size, 0);
    if (total <= MAX_BYTES) return;
    const victims = Object.entries(m.entries)
        .filter(([u]) => u !== keep)
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [u, e] of victims) {
        if (total <= MAX_BYTES) break;
        try {
            new File(MODELS, e.file).delete();
        } catch {
            /* ignore */
        }
        total -= e.size;
        delete m.entries[u];
    }
}

// ---- iOS web root ---------------------------------------------------------

let webRoot: WebRoot | null = null;
let webRootPromise: Promise<WebRoot | null> | null = null;

/**
 * iOS only. WKWebView reads local files only inside the directory it was
 * granted for the page, and the bundled index.html sits in the app bundle
 * while the models sit in Caches — two different containers, no single grant
 * covers both. So the preview page is copied next to the models and loaded
 * from there. Android needs none of this: its page is file:///android_asset
 * with universal file access already on.
 */
export function prepareWebRoot(): Promise<WebRoot | null> {
    if (Platform.OS !== "ios") return Promise.resolve(null);
    if (webRootPromise) return webRootPromise;
    webRootPromise = (async () => {
        try {
            const asset = Asset.fromModule(require("../../assets/index.html"));
            await asset.downloadAsync();
            if (!asset.localUri) throw new Error("index.html has no local URI");
            const m = loadMeta();
            ensureDirs();
            const dest = new File(ROOT, "index.html");
            if (!dest.exists || m.webRootHash !== asset.hash) {
                const html = await new File(asset.localUri).text();
                if (dest.exists) dest.delete();
                dest.create();
                dest.write(html);
                m.webRootHash = asset.hash ?? null;
                saveMeta();
            }
            webRoot = { uri: dest.uri, readAccess: ROOT.uri };
            return webRoot;
        } catch (e) {
            console.warn("[vrmCache] web root unavailable, preview falls back to network:", e);
            webRootPromise = null; // allow a retry later
            return null;
        }
    })();
    return webRootPromise;
}

let webRootBroken = false;

/** The prepared web root if ready and not known-broken, else null (never blocks). */
export function getWebRootSync(): WebRoot | null {
    return webRootBroken ? null : webRoot;
}

/**
 * The copied page never came up. Stop using it for the rest of the session so
 * every later open goes straight to the bundled page — slower, never blank.
 */
export function markWebRootBroken() {
    if (!webRootBroken) console.warn("[vrmCache] copied web root never became ready; using bundled page");
    webRootBroken = true;
}

/** Whether a WebView on this platform can read the cached files right now. */
export function canReadLocalModels(root: WebRoot | null): boolean {
    return Platform.OS === "android" || !!root;
}
