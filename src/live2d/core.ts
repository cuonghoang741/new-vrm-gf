import { Directory, File, Paths } from "expo-file-system";

/**
 * The Live2D Cubism Core, fetched once from Live2D's CDN and kept on the device.
 *
 * The Core is Live2D's proprietary "Redistributable Code": it may ship inside
 * the app, but this repository is public, so it is never committed. The page
 * first loaded it straight from the CDN, and that CDN answers
 * `no-cache, no-store`: every launch and every preview downloaded it again,
 * and one failed request left Live2D blank with nothing to retry it (seen on a
 * congested emulator). Now the app downloads it once, stores it, and inlines it
 * into the page, so after the first launch it needs no network at all.
 */
export const CUBISM_CORE_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

const DIR = new Directory(Paths.document, "live2d");
const CORE = new File(DIR, "live2dcubismcore.min.js");

let memo: string | null = null;
let inflight: Promise<string> | null = null;

const looksLikeCore = (text: string) => text.length > 100_000 && text.includes("Live2DCubismCore");

/** The Core if it is already in memory, for a first render without a flash. */
export const peekCubismCore = () => memo;

/** Resolves with the Core source; rejects when the CDN cannot be reached. */
export function loadCubismCore(): Promise<string> {
    if (memo) return Promise.resolve(memo);
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            if (CORE.exists) {
                const saved = await CORE.text();
                if (looksLikeCore(saved)) {
                    memo = saved;
                    return saved;
                }
            }
        } catch { /* unreadable: fetch it again */ }

        const res = await fetch(CUBISM_CORE_URL);
        if (!res.ok) throw new Error(`cubism core: HTTP ${res.status}`);
        const text = await res.text();
        if (!looksLikeCore(text)) throw new Error("cubism core: unexpected content");
        try {
            if (!DIR.exists) DIR.create({ intermediates: true });
            CORE.write(text);
        } catch { /* kept in memory for this session either way */ }
        memo = text;
        return text;
    })().finally(() => {
        inflight = null;
    });
    return inflight;
}
