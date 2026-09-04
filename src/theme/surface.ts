/**
 * Tokens for UI that floats over the scene (bubble buttons, the chat input) —
 * anything whose legibility depends on the background image behind it, not on
 * the app's own theme.
 *
 * `backgrounds.is_dark` in Supabase already says which way each scene goes, and
 * it is populated for every row, so nothing here needs to inspect pixels.
 *
 * The rule is contrast, not mimicry: over a dark scene we use a dark glass with
 * light content, over a light scene a light glass with dark content. Either way
 * the glass separates from the scene and the icons separate from the glass, so
 * a busy photograph behind can never swallow a control.
 *
 * The accents shift too. Rose, gold and red read fine on dark violet but wash
 * out badly on a near-white glass, so the light set uses deeper mixes that hold
 * roughly 4.5:1 against it.
 */
export type SurfaceTokens = {
    /** Fill for the floating control itself. */
    glass: string;
    /** Hairline that keeps the glass from dissolving into a similar scene. */
    border: string;
    /** Icons and labels on the glass. */
    icon: string;
    /** Secondary text on the glass (placeholders, hints). */
    muted: string;
    /** Brand rose — notification dots, active states. */
    accent: string;
    /** Premium / PRO. */
    gold: string;
    /** Stop, end-call, recording. */
    danger: string;
    /**
     * A much thinner fill, for large surfaces like the chat bar. `glass` would
     * hide too much of the scene at that size; this only tints it.
     */
    veil: string;
    /** Shadow colour that lifts the control off busy imagery. */
    shadow: string;
};

const OVER_DARK: SurfaceTokens = {
    glass: 'rgba(28, 16, 48, 0.68)',
    border: 'rgba(201, 166, 255, 0.28)',
    icon: '#F4ECFB',
    muted: 'rgba(244, 236, 251, 0.6)',
    accent: '#FF3D7F',
    gold: '#F2C14E',
    danger: '#FF5C7A',
    veil: 'rgba(255, 255, 255, 0.10)',
    shadow: 'rgba(0, 0, 0, 0.55)',
};

const OVER_LIGHT: SurfaceTokens = {
    glass: 'rgba(255, 253, 255, 0.82)',
    border: 'rgba(46, 20, 74, 0.16)',
    icon: '#2A1440',
    muted: 'rgba(42, 20, 64, 0.55)',
    // Deeper than the dark-scene accents: the bright versions sit at roughly
    // 2:1 on a near-white glass, which is unreadable at icon size.
    accent: '#E01B60',
    gold: '#9C6B12',
    danger: '#D6224A',
    veil: 'rgba(15, 5, 30, 0.08)',
    shadow: 'rgba(38, 16, 60, 0.28)',
};

/** Pick the token set for whatever scene is currently behind the UI. */
export function surfaceOn(isBackgroundDark: boolean): SurfaceTokens {
    return isBackgroundDark ? OVER_DARK : OVER_LIGHT;
}
