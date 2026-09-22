/**
 * i18n resources — 10 ngôn ngữ y hệt Yuuki: en, vi, ja, zh, ko, es, pt, de, fr, it.
 *
 * Bảng chữ của từng ngôn ngữ nằm ở `./locales/<mã>.ts`, mỗi file một ngôn ngữ.
 * File này chỉ còn phần khai báo và ráp lại — trước đây tất cả nằm chung một
 * file ~1900 dòng, sửa một chuỗi tiếng Ý phải cuộn qua chín thứ tiếng khác.
 *
 * Cách thêm chữ: thêm KEY vào `locales/en.ts` (bảng gốc), rồi thêm bản dịch
 * tương ứng vào 9 file còn lại. Thiếu key ở ngôn ngữ nào thì tự rơi về `en`
 * (fallbackLng), nên app không bao giờ hiện raw key.
 */

import type { Dict } from "./locales/types";
import en from "./locales/en";
import vi from "./locales/vi";
import ja from "./locales/ja";
import zh from "./locales/zh";
import ko from "./locales/ko";
import es from "./locales/es";
import pt from "./locales/pt";
import de from "./locales/de";
import fr from "./locales/fr";
import it from "./locales/it";

export const SUPPORTED = [
    "en", "vi", "ja", "zh", "ko", "es", "pt", "de", "fr", "it",
] as const;
export type SupportedLang = (typeof SUPPORTED)[number];

/** Tên bản địa + cờ, dùng cho màn chọn ngôn ngữ. */
/**
 * `code` is what the UI shows. Country-flag emoji (the `flag` field) render as
 * empty boxes on most Android builds — they were showing as "?" tiles — so the
 * two-letter code is the reliable badge; `flag` stays for anywhere that has a
 * font which can draw it.
 */
export const LANGUAGE_META: Record<SupportedLang, { name: string; flag: string; code: string }> = {
    en: { code: "EN", name: "English", flag: "🇬🇧" },
    vi: { code: "VI", name: "Tiếng Việt", flag: "🇻🇳" },
    ja: { code: "JA", name: "日本語", flag: "🇯🇵" },
    zh: { code: "ZH", name: "中文", flag: "🇨🇳" },
    ko: { code: "KO", name: "한국어", flag: "🇰🇷" },
    es: { code: "ES", name: "Español", flag: "🇪🇸" },
    pt: { code: "PT", name: "Português", flag: "🇵🇹" },
    de: { code: "DE", name: "Deutsch", flag: "🇩🇪" },
    fr: { code: "FR", name: "Français", flag: "🇫🇷" },
    it: { code: "IT", name: "Italiano", flag: "🇮🇹" },
};

export const resources: Record<SupportedLang, { translation: Dict }> = {
    en: { translation: en },
    vi: { translation: vi },
    ja: { translation: ja },
    zh: { translation: zh },
    ko: { translation: ko },
    es: { translation: es },
    pt: { translation: pt },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it },
};
