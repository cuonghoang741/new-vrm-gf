import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import { IconHeartFilled } from "@tabler/icons-react-native";
import type { LockState } from "../../hooks/useItemUnlock";

import { useTranslation } from "react-i18next";
/**
 * One picker tile: 9:14 card, radius 16, name on a bottom fade.
 *
 * What it costs is a BAR across the bottom of the card, one bar per item, in
 * the same colour language Yuuki uses so the whole app reads the same way:
 *
 *   ad          — pink gradient, play glyph, "AD"
 *   ruby        — dark glass with a rose tint, ruby glyph, the price
 *   pro         — gold gradient, diamond, "PRO"
 *   pro_or_ruby — gold half AND rose half: this needs the subscription and
 *                 then costs ruby. It is the case that used to lie — the tile
 *                 said only "PRO", so people subscribed to reach an item and
 *                 discovered the ruby price afterwards.
 *   level       — the bar is replaced by a heart and "Lv N", with whatever
 *                 else it costs beside it: closeness is a gate in FRONT of the
 *                 price, not instead of it.
 *
 * A bar rather than a corner badge because a price has to be readable, and
 * because two gates need two slots that sit next to each other.
 */
type Props = {
    width: number;
    name: string;
    image?: string | null;
    /** Icon shown on a gradient when there is no picture (dances without thumbnails). */
    placeholderIcon?: React.ComponentProps<typeof Ionicons>["name"];
    lock: LockState;
    price?: number;
    /** Bond level this item opens at, shown on a `level` lock. */
    requiredLevel?: number;
    /** The item's tier is PRO — shown even while the level lock is what bites. */
    proTier?: boolean;
    selected?: boolean;
    /** Greyed out because the whole section needs something first (e.g. 3D/PRO). */
    disabled?: boolean;
    onPress: () => void;
    /** Small corner badges, e.g. a video or moon/sun glyph. */
    topLeft?: React.ReactNode;
};

/**
 * Gradients for tiles with no picture. Picked from the name so two dances
 * without thumbnails never look like the same tile twice over.
 */
const PLACEHOLDER_GRADIENTS: [string, string][] = [
    ["#FFB6D9", "#FF4D8D"],
    ["#B6C9FF", "#5B6CFF"],
    ["#FFD6A5", "#FF7A45"],
    ["#B9F3D2", "#22B07D"],
    ["#E3B6FF", "#8B3DFF"],
];

function ItemTileImpl({ width, name, image, placeholderIcon, lock, price = 0, requiredLevel, proTier, selected, disabled, onPress, topLeft }: Props) {
    const { t } = useTranslation();
    const height = width / SHEET.tileAspect;
    const isProLock = lock === "pro" || lock === "pro_or_ruby";
    const gradient = isProLock
        ? (["#FFB347", "#FF4D8D"] as [string, string])
        : PLACEHOLDER_GRADIENTS[
            [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % PLACEHOLDER_GRADIENTS.length
        ];

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.tile,
                { width, height },
                isProLock && styles.tilePro,
                selected && styles.tileSelected,
                disabled && { opacity: 0.45 },
                pressed && { transform: [{ scale: 0.97 }] },
            ]}
        >
            <View style={styles.clip}>
                {image ? (
                    <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={image} />
                ) : (
                    <LinearGradient
                        colors={gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.center]}
                    >
                        {/* A vector icon, not an emoji: emoji fonts are missing on
                            some devices/simulators and render as "?" boxes. */}
                        <Ionicons name={placeholderIcon ?? "sparkles"} size={34} color="rgba(255,255,255,0.92)" style={{ marginBottom: 18 }} />
                    </LinearGradient>
                )}

                {!selected && lock !== "free" && (
                    <View
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor:
                                    lock === "level" ? "rgba(0,0,0,0.6)"
                                    : isProLock ? "rgba(0,0,0,0.42)"
                                    : "rgba(0,0,0,0.34)",
                            },
                        ]}
                    />
                )}

                {!selected && lock === "level" && (
                    <View style={styles.levelStack}>
                        <View style={styles.levelBadge}>
                            <IconHeartFilled size={17} color="#FF6FA5" />
                            <Text style={styles.levelBadgeText}>Lv {requiredLevel ?? 1}</Text>
                        </View>
                        {(proTier || price > 0) && (
                            <View style={styles.levelAlso}>
                                {proTier && <Text style={styles.levelAlsoPro}>PRO</Text>}
                                {price > 0 && (
                                    <>
                                        <RubyIcon size={10} color="#fff" />
                                        <Text style={styles.levelAlsoText}>{price}</Text>
                                    </>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {!!topLeft && <View style={styles.topLeft}>{topLeft}</View>}

                <LinearGradient colors={["transparent", "rgba(0,0,0,0.78)"]} style={styles.caption}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                </LinearGradient>

                {/* What it costs, along the bottom edge. One bar, or two
                    halves when the item needs PRO *and* ruby. */}
                {!selected && lock !== "free" && lock !== "level" && (
                    <View style={styles.gateBar}>
                        {(lock === "pro" || lock === "pro_or_ruby") && (
                            <LinearGradient
                                colors={SHEET.goldGradient}
                                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                                style={[styles.gateHalf, lock === "pro" && styles.gateFull]}
                            >
                                <Ionicons name="diamond" size={11} color="#3A2600" />
                                <Text style={styles.gateProText}>PRO</Text>
                            </LinearGradient>
                        )}
                        {(lock === "ruby" || lock === "pro_or_ruby") && price > 0 && (
                            <View style={[styles.gateHalf, styles.gateRuby, lock === "ruby" && styles.gateFull]}>
                                <RubyIcon size={12} color="#fff" />
                                <Text style={styles.gateText}>{price}</Text>
                            </View>
                        )}
                        {lock === "ad" && (
                            <LinearGradient
                                colors={SHEET.accentGradient}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={[styles.gateHalf, styles.gateFull]}
                            >
                                <Ionicons name="play" size={11} color="#fff" />
                                <Text style={styles.gateText}>{t("media.lock_ad")}</Text>
                            </LinearGradient>
                        )}
                    </View>
                )}

                {selected && (
                    <View style={styles.check}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                )}
            </View>
        </Pressable>
    );
}

export const ItemTile = memo(ItemTileImpl);

const styles = StyleSheet.create({
    tile: {
        borderRadius: SHEET.tileRadius,
        borderWidth: 1.2,
        borderColor: "rgba(255,255,255,0.10)",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
        backgroundColor: "#221F2D",
    },
    tilePro: { borderColor: "rgba(255,215,0,0.4)", shadowColor: SHEET.gold, shadowOpacity: 0.15 },
    tileSelected: { borderColor: SHEET.accent, borderWidth: 2.5, shadowColor: SHEET.accent, shadowOpacity: 0.4, shadowRadius: 16 },
    clip: { flex: 1, borderRadius: SHEET.tileRadius - 1.5, overflow: "hidden" },
    center: { alignItems: "center", justifyContent: "center" },
    /** The cost strip. Sits on the caption fade, flush to the card's edges. */
    gateBar: {
        position: "absolute", left: 0, right: 0, bottom: 0,
        flexDirection: "row", height: 24, overflow: "hidden",
    },
    gateHalf: {
        flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    },
    /** One gate: the strip is a single block rather than two halves. */
    gateFull: { flex: 1 },
    gateRuby: { backgroundColor: "rgba(214, 51, 108, 0.92)" },
    gateText: { color: "#fff", fontSize: 11.5, fontWeight: "900" },
    gateProText: { color: "#3A2600", fontSize: 11.5, fontWeight: "900" },
    levelAlso: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, height: 20, borderRadius: 10,
        backgroundColor: "rgba(0,0,0,0.55)",
    },
    levelAlsoPro: { color: SHEET.gold, fontSize: 10.5, fontWeight: "900" },
    levelAlsoText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    levelStack: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center", justifyContent: "center", gap: 6,
    },
    levelBadge: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 11, height: 30, borderRadius: 15,
        backgroundColor: "rgba(20,10,30,0.85)",
        borderWidth: 1.2, borderColor: "rgba(255,111,165,0.75)",
    },
    levelBadgeText: { color: "#fff", fontSize: 13, fontWeight: "900" },
    topLeft: { position: "absolute", top: 8, left: 8, flexDirection: "row", gap: 4 },
    caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingTop: 18, paddingBottom: 8 },
    name: { color: "#fff", fontSize: 13, fontWeight: "700" },
    check: {
        position: "absolute",
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: SHEET.accent,
        alignItems: "center",
        justifyContent: "center",
    },
});
