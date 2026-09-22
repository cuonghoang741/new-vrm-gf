/**
 * Palette for the picker sheets and the Quest page — taken from Yuuki's
 * background/dance pickers and check-in page so both apps read the same.
 */
export const SHEET = {
    bgTop: "#1A0A2E",
    bgBottom: "#0F0A1E",
    /** Over the blurred character picture: lets it glow at the top, keeps the grid readable. */
    scrim: ["rgba(26,10,46,0.45)", "rgba(20,10,36,0.78)", "rgba(15,10,30,0.94)"] as const,

    accent: "#FF4D8D",
    accentGradient: ["#FF6FA3", "#FF2E74"] as const,
    gold: "#FFD700",
    goldGradient: ["#FFD700", "#FF8C00"] as const,
    ruby: "#FF6FA5",
    purple: "#9C4DFF",
    success: "#4ADE80",
    disabled: "#3A2A4A",

    card: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.10)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.55)",
    textFaint: "rgba(255,255,255,0.35)",

    tileRadius: 16,
    gridGap: 10,
    gridPadding: 16,
    /** Yuuki: 9 wide × 14 tall. */
    tileAspect: 9 / 14,
} as const;
