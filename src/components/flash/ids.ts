/**
 * Which RevenueCat package carries the flash-sale price.
 *
 * It lives inside the `default` offering rather than one of its own, so every
 * screen that reads `offerings.current` sees it. That makes this list load
 * bearing in two directions: the flash sheet uses it to FIND the package, and
 * the paywall uses it to EXCLUDE it. Without the exclusion the normal weekly
 * slot matches `weekly.splash_sale` on the substring "week" — and it sorts
 * first — so the standard paywall quietly shows the discounted price to
 * everyone, forever.
 *
 * `weekly.splash_sale` is the key as configured (the "s" is a typo for flash);
 * the other two are accepted so renaming it in the dashboard cannot break the
 * sale.
 */
export const FLASH_PACKAGE_IDS = [
    "weekly.splash_sale",
    "weekly.flash_sale",
    "flash_sale",
] as const;

/** A dedicated offering, if one is ever created. Checked before `default`. */
export const FLASH_OFFERING_ID = "flash_sale";

export function isFlashPackage(p: { identifier?: string } | null | undefined): boolean {
    const id = (p?.identifier ?? "").toLowerCase();
    return FLASH_PACKAGE_IDS.some((k) => id === k.toLowerCase());
}
