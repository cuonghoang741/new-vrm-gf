import { analyticsService } from "./AnalyticsService";

/**
 * The event names from the tracking sheet, one function per event.
 *
 * Naming is the sheet's: `<screen>_<action>` in snake_case, and the parameter
 * names are copied from it too ("item", "locked", "price", "method",
 * "balance", "entry", "hearts"…), so the dashboards built on that sheet work
 * without a mapping layer.
 *
 * Two deliberate deviations, because TrueFeel is not the app the sheet was
 * written for:
 *   * There is no Sing, Photo Studio or Background Music here, so those rows
 *     are skipped rather than faked.
 *   * Our currency is ruby, not hearts. The events keep the sheet's `hearts`
 *     parameter name and carry the ruby amount, so one column means one thing
 *     across both apps.
 *
 * The older, differently-named events in AnalyticsService stay as they are;
 * these are additional.
 */

type Params = Record<string, string | number | boolean | undefined>;

const send = (name: string, params?: Params) => {
    // Drop undefined values: Firebase rejects them and they carry nothing.
    const clean: Params = {};
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) clean[k] = v;
    void analyticsService.logEvent(name, clean);
};

/** Fire-once-per-session guard for screen views that can re-mount. */
const onceKeys = new Set<string>();
const once = (key: string, fn: () => void) => {
    if (onceKeys.has(key)) return;
    onceKeys.add(key);
    fn();
};

export const track = {
    /** Escape hatch for slot events whose name is chosen from a map. */
    raw: (name: string, params?: Params) => send(name, params),

    // ── Splash ──────────────────────────────────────────────────────────────
    splashView: () => once("splash_scr_view", () => send("splash_scr_view")),
    splashInterOpen: () => send("splash_inter_open"),

    // ── Language ────────────────────────────────────────────────────────────
    languageView: () => send("language_scr_view"),
    languageNativeOpen: (first: boolean) =>
        send(first ? "language_native_1_1_open" : "language_native_1_2_open"),
    languageSelect: (language: string) => send("language_select", { language }),
    languageSaveSelect: (language: string) => send("language_save_select", { language }),

    // ── Onboarding (3 questions + the match screen) ─────────────────────────
    onboardingStepView: (step: 1 | 2 | 3 | 4) => send(`onboarding${step}_view`),
    onboardingNativeOpen: (step: 1 | 3 | 4) => send(`onboarding${step}_native_open`),
    onboardingNextSelect: (step: number) => send("onboarding_next_select", { step }),
    onboardingGetStarted: () => send("onboarding4_get_started_select"),

    // ── Welcome back ───────────────────────────────────────────────────────
    welcomeBackView: () => send("welcome_back_scr_view"),
    welcomeBackNativeOpen: () => send("welcome_back_native_open"),

    // ── Home / Play ────────────────────────────────────────────────────────
    homeView: () => send("home_scr_view"),
    homeChatSend: () => send("home_chat_send"),
    homeDanceSelect: () => send("home_dance_select"),
    homeVideoCallSelect: () => send("home_video_call_select"),
    homeSceneSelect: () => send("home_scene_select"),
    homeOutfitSelect: () => send("home_outfit_select"),
    homeGallerySelect: () => send("home_gallery_select"),
    homeCharacterSwitchSelect: () => send("home_character_switch_select"),
    homeCharacterAvatarSelect: (item: string) => send("home_character_avatar_select", { item }),
    homePremiumSelect: () => send("home_premium_select"),
    homeHeartsSelect: (balance: number) => send("home_hearts_select", { balance }),
    homeSettingsSelect: () => send("home_settings_select"),
    bannerHomeOpen: () => send("banner_home_open"),

    // ── Pickers: dance / scene / outfit / gallery / character ───────────────
    danceSheetView: () => send("dance_sheet_view"),
    sceneSheetView: () => send("scene_sheet_view"),
    outfitSheetView: () => send("outfit_sheet_view"),
    galleryView: () => send("gallery_scr_view"),
    characterDetailView: (tab: "for_you" | "all") => send("character_detail_view", { tab }),

    itemSelect: (kind: ItemKind, item: string, locked: boolean, price?: number) =>
        send(SELECT_EVENT[kind], { item, locked, price }),
    unlockView: (kind: ItemKind, item: string, price: number, balance: number) =>
        send(`${PREFIX[kind]}_unlock_view`, { item, price, balance }),
    unlockSelect: (kind: ItemKind, item: string, price: number, method: UnlockMethod) =>
        send(`${PREFIX[kind]}_unlock_select`, { item, price, method }),
    unlockSuccess: (kind: ItemKind, item: string, price: number, method: UnlockMethod) =>
        send(`${PREFIX[kind]}_unlock_success`, { item, price, method }),
    unlockLater: (kind: ItemKind, item: string) => send(`${PREFIX[kind]}_unlock_later_select`, { item }),

    characterStartChat: (item: string) => send("character_start_chat_select", { item }),

    // ── Ruby store (the sheet's Hearts store) ──────────────────────────────
    heartsStoreView: (entry: string, balance: number) => send("hearts_store_view", { entry, balance }),
    heartsInsufficient: (entry: string, price: number, balance: number) =>
        send("hearts_insufficient_view", { entry, price, balance }),
    heartsPackSelect: (item: string, hearts: number, value: number, currency: string) =>
        send("hearts_pack_select", { item, hearts, value, currency }),
    heartsPurchaseSuccess: (item: string, hearts: number, value: number, currency: string) =>
        send("hearts_purchase_success", { item, hearts, value, currency }),
    heartsPurchaseFailed: (item: string, code: string) => send("hearts_purchase_failed", { item, code }),
    heartsProSelect: () => send("hearts_pro_select"),

    // ── Daily tasks (quests) ───────────────────────────────────────────────
    dailyTaskGo: (task: string) => send("daily_task_go_select", { task }),
    dailyTaskCompleted: (task: string, hearts: number) => send("daily_task_completed", { task, hearts }),

    // ── Streak (daily check-in) ────────────────────────────────────────────
    streakView: (streak: number, best: number) => send("streak_sheet_view", { streak, best }),
    streakCheckinSelect: (day: number, hearts: number) => send("streak_checkin_select", { day, hearts }),
    streakCheckinSuccess: (day: number, hearts: number, isPro: boolean) =>
        send("streak_checkin_success", { day, hearts, is_pro: isPro }),

    // ── PRO paywall ────────────────────────────────────────────────────────
    proPaywallView: (entry: string) => send("pro_paywall_view", { entry }),
    proPlanSelect: (plan: string) => send("pro_plan_select", { plan }),
    proSubscribeSelect: (plan: string) => send("pro_subscribe_select", { plan }),
    proSubscribeSuccess: (plan: string, value: number, currency: string) =>
        send("pro_subscribe_success", { plan, value, currency }),
    proSubscribeFailed: (plan: string, code: string) => send("pro_subscribe_failed", { plan, code }),
    proRestoreSelect: () => send("pro_restore_select"),
    proPaywallClose: (plan?: string) => send("pro_paywall_close_select", { plan }),

    // ── Rewarded ad for ruby ───────────────────────────────────────────────
    rewardPopupView: () => send("reward_popup_view"),
    rewardWatchSelect: () => send("reward_watch_select"),
    rewardEarned: (hearts: number) => send("reward_earned_success", { hearts }),
};

/** Item families that share the "<prefix>_unlock_*" event shape. */
export type ItemKind = "dance" | "scene_bg" | "outfit" | "gallery" | "character";
export type UnlockMethod = "hearts" | "ad" | "pro";

const PREFIX: Record<ItemKind, string> = {
    dance: "dance",
    scene_bg: "scene_bg",
    outfit: "outfit",
    gallery: "gallery",
    character: "character",
};

/** The sheet names the "tapped an item" event differently per family. */
const SELECT_EVENT: Record<ItemKind, string> = {
    dance: "dance_item_select",
    scene_bg: "scene_bg_select",
    outfit: "outfit_select",
    gallery: "gallery_photo_select",
    character: "character_item_select",
};
