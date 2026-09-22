import type { ImageSourcePropType } from "react-native";
import type { SupportedLang } from "./index";

/**
 * Flag artwork, as bundled PNGs rather than emoji.
 *
 * The screen used to render 🇬🇧-style emoji. Plenty of Android builds ship no
 * font covering regional-indicator pairs, so those devices drew "?" boxes — the
 * reason this briefly became two-letter text codes instead. Images are the only
 * version that looks the same everywhere, and all ten together weigh ~7 KB.
 *
 * `require` paths must be static literals: Metro resolves them at build time.
 */
export const FLAGS: Record<SupportedLang, ImageSourcePropType> = {
    en: require("../../assets/flags/en.png"),
    vi: require("../../assets/flags/vi.png"),
    ja: require("../../assets/flags/ja.png"),
    zh: require("../../assets/flags/zh.png"),
    ko: require("../../assets/flags/ko.png"),
    es: require("../../assets/flags/es.png"),
    pt: require("../../assets/flags/pt.png"),
    de: require("../../assets/flags/de.png"),
    fr: require("../../assets/flags/fr.png"),
    it: require("../../assets/flags/it.png"),
};
