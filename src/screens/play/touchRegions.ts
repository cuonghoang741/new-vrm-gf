import type { TouchPart } from "../../components/VRMViewer";

/**
 * Where on the 2D art a tap landed, by position alone.
 *
 * The art fills the screen with "cover" and "top center", so her head sits
 * near the top and her body runs down the middle. That varies with each
 * illustration, and the only cost of a wrong guess is a different emoji. The
 * 3D model raycasts onto the real mesh instead.
 */
export function region2D(x: number, y: number, width: number, height: number): TouchPart | null {
    if (width <= 0 || height <= 0) return null;
    const fx = (x - width / 2) / width;
    const fy = y / height;
    // The margins are scenery, not her.
    if (fy < 0.06 || fy > 0.95 || Math.abs(fx) > 0.38) return null;
    if (fy < 0.16) return "head";
    if (fy < 0.27) return "face";
    if (Math.abs(fx) > 0.2 && fy < 0.62) return "hand";
    if (fy < 0.4) return "chest";
    if (fy < 0.52) return "belly";
    if (fy < 0.66) return "hips";
    return "legs";
}

/** Her reaction, drawn as an emoji at the tap in both 2D and 3D. */
export const TOUCH_EMOJI: Record<TouchPart, string> = {
    head: "🥰",
    face: "☺️",
    hand: "👋",
    belly: "😆",
    chest: "😳",
    hips: "😳",
    legs: "😲",
};
