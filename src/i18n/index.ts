import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { resources, SUPPORTED, SupportedLang } from "./resources";

const STORE_KEY = "app_language";

/** Ngôn ngữ mặc định theo máy, rơi về 'en' nếu máy dùng thứ tiếng chưa hỗ trợ. */
function deviceLang(): SupportedLang {
    try {
        const code = getLocales()?.[0]?.languageCode ?? "en";
        return (SUPPORTED as readonly string[]).includes(code)
            ? (code as SupportedLang)
            : "en";
    } catch {
        return "en";
    }
}

let _current: SupportedLang = "en";

/** Gọi MỘT LẦN khi khởi động (trước khi render UI có chữ). */
export async function initI18n(): Promise<SupportedLang> {
    let saved: string | null = null;
    try {
        saved = await SecureStore.getItemAsync(STORE_KEY);
    } catch {
        /* first run / store lỗi → theo máy */
    }
    const lng: SupportedLang =
        saved && (SUPPORTED as readonly string[]).includes(saved)
            ? (saved as SupportedLang)
            : deviceLang();
    _current = lng;

    await i18n.use(initReactI18next).init({
        resources,
        lng,
        fallbackLng: "en",
        interpolation: { escapeValue: false },
        returnNull: false,
    });
    return lng;
}

/** Đổi ngôn ngữ + lưu lại (persist). Mọi màn dùng useTranslation sẽ tự re-render. */
export async function setAppLanguage(lng: SupportedLang): Promise<void> {
    _current = lng;
    await i18n.changeLanguage(lng);
    try {
        await SecureStore.setItemAsync(STORE_KEY, lng);
    } catch {
        /* best-effort */
    }
}

/** Ngôn ngữ đang dùng (đồng bộ). */
export function currentLang(): SupportedLang {
    return _current;
}

/** Đã từng lưu lựa chọn ngôn ngữ chưa (để quyết định có hiện màn Language không). */
export async function hasChosenLanguage(): Promise<boolean> {
    try {
        return (await SecureStore.getItemAsync(STORE_KEY)) != null;
    } catch {
        return false;
    }
}

export { i18n };
export { SUPPORTED, LANGUAGE_META } from "./resources";
export type { SupportedLang } from "./resources";
