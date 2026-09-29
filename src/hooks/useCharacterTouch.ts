import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { getTouchQuota, touchCharacter, type BondTrackResult } from "../services/bondService";
import { analyticsService } from "../services/AnalyticsService";
import type { TouchPart } from "../components/VRMViewer";

/**
 * Taps inside this window are ignored. It is roughly one reaction long, so she
 * finishes reacting before the next tap, and it stops a burst of taps from
 * spending a free account's three touches in a second.
 */
const COOLDOWN_MS = 1200;

type Options = {
    characterId: string | null;
    isPro: boolean;
    /** Play her reaction. Runs immediately, before the server answers. */
    onReact: (part: TouchPart, x: number, y: number) => void;
    /** The server granted the touch; `bond` carries the XP it earned. */
    onGranted?: (part: TouchPart, x: number, y: number, bond: BondTrackResult) => void;
    /** Out of free touches for today. */
    onLimit: () => void;
};

/**
 * Touch handling for the play screen, shared by the 2D art and the 3D model.
 *
 * The server owns the daily limit and the XP. The client keeps only its last
 * answer, so a free account that is known to be out gets the PRO prompt
 * without a round trip, and a touch that is allowed reacts at once rather
 * than after the network does.
 */
export function useCharacterTouch({ characterId, isPro, onReact, onGranted, onLimit }: Options) {
    /** Free touches left today. Null means unknown, or unlimited for PRO. */
    const [left, setLeft] = useState<number | null>(null);
    const leftRef = useRef<number | null>(null);
    const lastAtRef = useRef(0);

    const apply = useCallback((value: number | null) => {
        leftRef.current = value;
        setLeft(value);
    }, []);

    const refresh = useCallback(async () => {
        const q = await getTouchQuota();
        if (q) apply(q.pro ? null : q.left);
    }, [apply]);

    // Also re-asked when PRO flips, so a purchase lifts the limit at once.
    useEffect(() => {
        void refresh();
    }, [refresh, isPro]);

    const touch = useCallback(
        async (part: TouchPart, x: number, y: number, mode: "2d" | "3d") => {
            if (!characterId) return;
            const now = Date.now();
            if (now - lastAtRef.current < COOLDOWN_MS) return;
            lastAtRef.current = now;

            if (!isPro && leftRef.current === 0) {
                analyticsService.logEvent("character_touch_limit", { part, mode });
                onLimit();
                return;
            }

            onReact(part, x, y);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            analyticsService.logEvent("character_touch", { part, mode, pro: isPro });

            const r = await touchCharacter(characterId);
            if (r.ok) {
                apply(r.left);
                onGranted?.(part, x, y, r.bond);
            } else if (r.reason === "daily_limit") {
                // Out on the server though not here (another device, or a
                // count from before a restart). She has already reacted to
                // this one, without XP, so the prompt follows it.
                apply(0);
                onLimit();
            }
        },
        [characterId, isPro, onReact, onGranted, onLimit, apply]
    );

    return { touch, left };
}
