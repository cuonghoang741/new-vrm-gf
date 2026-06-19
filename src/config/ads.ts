import { Platform } from "react-native";

/**
 * ===========================================================================
 *  AdMob configuration — single source of truth for all ad unit IDs.
 * ===========================================================================
 *
 *  - Dùng TEST ads khi __DEV__ để tránh bị Google khóa tài khoản AdMob.
 *    (Tuyệt đối KHÔNG click ad thật khi đang test.)
 *  - Mỗi unit có ID riêng cho Android / iOS. Hiện mới có ID Android,
 *    iOS đang để TODO + fallback test (xem PROD_AD_UNITS.ios).
 *
 *  App ID phải khai báo trong app.config.ts (plugin react-native-google-mobile-ads),
 *  để đây chỉ nhằm mục đích tham chiếu / submit store.
 * ===========================================================================
 */

/**
 * TEMP: forced TRUE so the tester/review submission serves TEST ads only —
 * testers and Google reviewers can interact safely (no invalid-traffic risk).
 * ⚠️ Flip back to `__DEV__` for the real-ads release once the app is approved.
 */
export const USE_TEST_ADS = true; // was: __DEV__

/** AdMob App ID (khai báo trong app.config.ts — đây chỉ để tham chiếu). */
export const ADMOB_APP_ID = {
  android: "ca-app-pub-4908431670564026~7331803480",
  ios: "ca-app-pub-4908431670564026~7220122843",
} as const;

/**
 * Google official sample/test IDs (public). Dùng khi USE_TEST_ADS = true.
 * Ref: https://developers.google.com/admob/android/test-ads
 */
const TEST_AD_UNITS = {
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
  rewardedInterstitial: "ca-app-pub-3940256099942544/5354046379",
  native: "ca-app-pub-3940256099942544/2247696110",
  appOpen: "ca-app-pub-3940256099942544/9257395921",
} as const;

/** Ad Unit IDs thật (production). */
const PROD_AD_UNITS = {
  banner: Platform.select({
    android: "ca-app-pub-4908431670564026/7915386712",
    ios: "ca-app-pub-4908431670564026/7201070842",
  })!,
  interstitial: Platform.select({
    android: "ca-app-pub-4908431670564026/5308612081",
    ios: "ca-app-pub-4908431670564026/3280877837",
  })!,
  rewarded: Platform.select({
    android: "ca-app-pub-4908431670564026/5882990447",
    ios: "ca-app-pub-4908431670564026/1565600787",
  })!,
  rewardedInterstitial: Platform.select({
    android: "ca-app-pub-4908431670564026/4621879662",
    ios: "ca-app-pub-4908431670564026/7227861706",
  })!,
  native: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,
  appOpen: Platform.select({
    android: "ca-app-pub-4908431670564026/8317582099",
    ios: "ca-app-pub-4908431670564026/5313274107",
  })!,
} as const;

/** ID dùng thực tế trong app — tự chọn test/prod theo môi trường. */
export const AdUnits = USE_TEST_ADS ? TEST_AD_UNITS : PROD_AD_UNITS;

export type AdUnitKey = keyof typeof AdUnits;
