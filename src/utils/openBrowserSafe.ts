import * as WebBrowser from "expo-web-browser";
import { AdsManager } from "../services/AdsManager";

/**
 * Open an external URL in the in-app browser, suppressing the App Open ad that
 * would otherwise fire when the user returns (policy rule 18 — no resume ad
 * after leaving for external/non-content surfaces).
 */
export async function openBrowserSafe(
    url: string,
    options?: WebBrowser.WebBrowserOpenOptions
) {
    AdsManager.suppressNextResumeAd();
    return WebBrowser.openBrowserAsync(url, options);
}
