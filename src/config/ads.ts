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
 * Test ads in development, REAL ads in any release build.
 *
 * ⚠️ Never tap an ad on a release build of your own app — AdMob counts that as
 * invalid traffic and bans accounts for it. To exercise ad placements by hand,
 * run a debug build (this flag flips itself) or register the device as a test
 * device in the AdMob console.
 *
 * `EXPO_PUBLIC_FORCE_TEST_ADS=1` is the third way, and the one that makes a
 * QA build safe to hand to a human: a standalone release APK otherwise serves
 * REAL ads, and the whole point of that APK is that someone taps every
 * placement in it. Default behaviour is unchanged — the override only applies
 * when the variable is explicitly set at build time.
 */
export const USE_TEST_ADS =
  __DEV__ || process.env.EXPO_PUBLIC_FORCE_TEST_ADS === "1";

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
  interstitialSplash: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
  rewardedInterstitial: "ca-app-pub-3940256099942544/5354046379",
  native: "ca-app-pub-3940256099942544/2247696110",
  nativeLanguage1: "ca-app-pub-3940256099942544/2247696110",
  nativeLanguage2: "ca-app-pub-3940256099942544/2247696110",
  nativeOnboarding1: "ca-app-pub-3940256099942544/2247696110",
  nativeOnboarding2: "ca-app-pub-3940256099942544/2247696110",
  nativeOnboarding3: "ca-app-pub-3940256099942544/2247696110",
  appOpen: "ca-app-pub-3940256099942544/9257395921",
  appOpenSplash: "ca-app-pub-3940256099942544/9257395921",
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
  /** open_resume — App Open khi quay lại app từ nền. */
  appOpen: Platform.select({
    android: "ca-app-pub-4908431670564026/8317582099",
    ios: "ca-app-pub-4908431670564026/5313274107",
  })!,

  /**
   * ⚠️ ĐỌC TRƯỚC KHI PHÁT HÀNH — các unit bên dưới CHƯA có ID riêng.
   *
   * Kịch bản quảng cáo yêu cầu 7 vị trí riêng (open_splash, inter_splash,
   * native_language_1/_2, native_onboarding_1.1/1.2/1.3). Code đã tách đúng
   * từng vị trí, nhưng ID thì đang trỏ tạm về unit cùng ĐỊNH DẠNG đã có
   * (appOpen / interstitial / native). Hệ quả: hành vi trong app đúng như
   * kịch bản, nhưng báo cáo AdMob gộp chung — không tách được doanh thu
   * theo vị trí, tức là mất đúng cái lý do phải tách vị trí.
   *
   * Việc cần làm: tạo 7 unit trong AdMob console (mỗi unit 1 ID Android +
   * 1 ID iOS) rồi thay vào đây. Không cần sửa chỗ nào khác.
   */

  /** open_splash — App Open ở cold start (khác open_resume ở trên). */
  appOpenSplash: Platform.select({
    android: "ca-app-pub-4908431670564026/8317582099",
    ios: "ca-app-pub-4908431670564026/5313274107",
  })!,
  /** inter_splash — interstitial ở splash, dự phòng khi App Open không fill. */
  interstitialSplash: Platform.select({
    android: "ca-app-pub-4908431670564026/5308612081",
    ios: "ca-app-pub-4908431670564026/3280877837",
  })!,

  /**
   * Màn Language — chọn theo SỐ LẦN mở app, không phải theo trạng thái đã
   * chọn ngôn ngữ hay chưa: lần mở đầu tiên dùng unit 1, từ lần 2 trở đi
   * dùng unit 2. (Màn này chỉ hiện khi user chưa từng chọn ngôn ngữ, nên
   * unit 2 phục vụ người thoát app ngay ở màn chọn rồi mở lại.)
   */
  nativeLanguage1: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,
  nativeLanguage2: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,

  /** Onboarding slide 1 / 3 / 4 (slide 2 cố tình để trống). */
  nativeOnboarding1: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,
  nativeOnboarding2: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,
  nativeOnboarding3: Platform.select({
    android: "ca-app-pub-4908431670564026/3308797995",
    ios: "ca-app-pub-4908431670564026/9252519115",
  })!,
} as const;

/** ID dùng thực tế trong app — tự chọn test/prod theo môi trường. */
export const AdUnits = USE_TEST_ADS ? TEST_AD_UNITS : PROD_AD_UNITS;

export type AdUnitKey = keyof typeof AdUnits;
