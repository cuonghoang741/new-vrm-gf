import React, { useCallback, useMemo, useRef } from "react";
import {
    PanResponder,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { surfaceOn } from "../theme/surface";

export type SwitcherCharacter = {
    id: string;
    name: string;
    thumbnail_url?: string | null;
    small_thumb_url?: string | null;
    avatar?: string | null;
};

interface Props {
    characters: SwitcherCharacter[];
    activeId: string | null;
    /** Runs the app's normal character-change path, gate included. */
    onSelect: (c: SwitcherCharacter) => void;
    isBackgroundDark?: boolean;
    /** Smaller sizing for the top bar, where vertical room is tight. */
    compact?: boolean;
}

const ACTIVE = 60;
const SIDE = 42;
const ACTIVE_SM = 40;
const SIDE_SM = 28;

/**
 * Quick character switch at the top of the Play screen.
 *
 * Shows exactly three at a time — previous, active, next — with the active one
 * centred and larger. Swipe horizontally to move along the list, or tap a side
 * avatar to jump to it.
 *
 * The list wraps, so the control is never a dead end at either edge; with
 * fewer than three characters it simply renders what exists rather than
 * padding with blanks.
 *
 * Selection is delegated straight to the caller so the quick switch goes
 * through the same path — and the same rewarded-ad gate — as picking from the
 * character sheet. A shortcut that skipped the gate would make the gate
 * pointless, since this control is the faster way to do the same thing.
 */
export function CharacterSwitcher({
    characters,
    activeId,
    onSelect,
    isBackgroundDark = true,
    compact = false,
}: Props) {
    const surface = surfaceOn(isBackgroundDark);
    const dims = compact
        ? { active: ACTIVE_SM, side: SIDE_SM, gap: 8, ring: 2 }
        : { active: ACTIVE, side: SIDE, gap: 12, ring: 2.5 };

    const index = useMemo(() => {
        const i = characters.findIndex((c) => c.id === activeId);
        return i < 0 ? 0 : i;
    }, [characters, activeId]);

    const step = useCallback(
        (delta: number) => {
            if (characters.length < 2) return;
            const n = characters.length;
            const next = characters[(index + delta + n) % n];
            if (next && next.id !== activeId) {
                Haptics.selectionAsync();
                onSelect(next);
            }
        },
        [characters, index, activeId, onSelect]
    );

    // Horizontal swipe. Claimed only once the gesture is clearly sideways, so
    // it never steals a vertical scroll from whatever is underneath.
    const pan = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
            onPanResponderRelease: (_, g) => {
                if (g.dx <= -40) stepRef.current(1);
                else if (g.dx >= 40) stepRef.current(-1);
            },
        })
    ).current;
    const stepRef = useRef(step);
    stepRef.current = step;

    if (characters.length === 0) return null;

    const n = characters.length;
    const prev = n > 1 ? characters[(index - 1 + n) % n] : null;
    const next = n > 2 ? characters[(index + 1) % n] : null;
    const active = characters[index];

    const uri = (c: SwitcherCharacter) =>
        c.small_thumb_url ?? c.thumbnail_url ?? c.avatar ?? undefined;

    return (
        <View style={[styles.wrap, { gap: dims.gap }]} {...pan.panHandlers}>
            {prev && (
                <Pressable onPress={() => step(-1)} hitSlop={6}>
                    <Image
                        source={{ uri: uri(prev) }}
                        style={[
                            styles.side,
                            { width: dims.side, height: dims.side, borderRadius: dims.side / 2, borderColor: surface.border },
                        ]}
                        contentFit="cover"
                        transition={160}
                    />
                </Pressable>
            )}

            <View
                style={[
                    styles.activeRing,
                    {
                        width: dims.active + 6,
                        height: dims.active + 6,
                        borderRadius: (dims.active + 6) / 2,
                        borderWidth: dims.ring,
                        borderColor: surface.accent,
                    },
                ]}
            >
                <Image
                    source={{ uri: uri(active) }}
                    style={[styles.active, { width: dims.active, height: dims.active, borderRadius: dims.active / 2 }]}
                    contentFit="cover"
                    transition={160}
                />
            </View>

            {next && (
                <Pressable onPress={() => step(1)} hitSlop={6}>
                    <Image
                        source={{ uri: uri(next) }}
                        style={[
                            styles.side,
                            { width: dims.side, height: dims.side, borderRadius: dims.side / 2, borderColor: surface.border },
                        ]}
                        contentFit="cover"
                        transition={160}
                    />
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    side: {
        width: SIDE,
        height: SIDE,
        borderRadius: SIDE / 2,
        borderWidth: 1.5,
        opacity: 0.65,
    },
    activeRing: {
        width: ACTIVE + 6,
        height: ACTIVE + 6,
        borderRadius: (ACTIVE + 6) / 2,
        borderWidth: 2.5,
        alignItems: "center",
        justifyContent: "center",
    },
    active: { width: ACTIVE, height: ACTIVE, borderRadius: ACTIVE / 2 },
});
