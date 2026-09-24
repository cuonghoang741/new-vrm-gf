/**
 * Artwork for the flash sale, hosted rather than bundled.
 *
 * It only ever appears during a three-hour window that most sessions never
 * see, so 125 KB of base64 in every bundle for every user is the wrong trade —
 * and `require()`ing a PNG does not survive the Android release build anyway
 * (see `components/icons/iconCharacters.ts`). Same R2 bucket as the character
 * art the app already streams.
 */
export const FLASH_GIFT_IMAGE =
    "https://pub-2682fd3d83e342588016f364737f5758.r2.dev/app-art/flash-gift.png";
