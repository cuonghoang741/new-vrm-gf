import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import RubyIcon from "../icons/RubyIcon";
import { SHEET } from "../../theme/sheet";
import { IconHeartFilled } from "@tabler/icons-react-native";
import type { LockState } from "../../hooks/useItemUnlock";

/**
 * One picker tile, Yuuki style (background / dance pickers): 9:14 card,
 * radius 16, name on a bottom fade. The lock is drawn by kind so a glance
 * tells the user what it costs:
 *   ad          — dim + pink play badge
 *   pro         — darker dim + gold lock badge + PRO pill
 *   pro_or_ruby — as pro, plus a ruby price pill (free users may buy it)
 *   ruby        — dim + ruby price pill in the middle
 *   level       — heaviest dim + heart badge + "Lv N" pill, and under it
 *                 whatever else the item still costs (PRO, ruby): the level
 *                 is a gate in front of the price, not instead of it
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
    const height = width / SHEET.tileAspect;
    const isProLock = lock === "pro" || lock === "pro_or_ruby";
    // A level-locked PRO item is still a PRO item; hiding the pill made the
    // tile look free the moment the level was reached.
    const showProPill = isProLock || (lock === "level" && !!proTier);
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
                            styles.center,
                            {
                                backgroundColor:
                                    lock === "level" ? "rgba(0,0,0,0.66)"
                                    : isProLock ? "rgba(0,0,0,0.55)"
                                    : "rgba(0,0,0,0.45)",
                            },
                        ]}
                    >
                        {lock === "ad" && (
                            <LinearGradient colors={SHEET.accentGradient} style={[styles.badge, styles.badgeAd]}>
                                <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
                            </LinearGradient>
                        )}
                        {isProLock && (
                            <LinearGradient colors={SHEET.goldGradient} style={styles.badge}>
                                <Ionicons name="lock-closed" size={20} color="#fff" />
                            </LinearGradient>
                        )}
                        {lock === "level" && (
                            <View style={styles.levelStack}>
                                <View style={styles.levelBadge}>
                                    <IconHeartFilled size={17} color="#FF6FA5" />
                                    <Text style={styles.levelBadgeText}>Lv {requiredLevel ?? 1}</Text>
                                </View>
                                {price > 0 && (
                                    <View style={styles.rubyPillSmall}>
                                        <RubyIcon size={10} color="#fff" />
                                        <Text style={styles.rubyPillSmallText}>{price}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                        {lock === "ruby" && (
                            <View style={styles.rubyPillBig}>
                                <RubyIcon size={14} color="#fff" />
                                <Text style={styles.rubyPillBigText}>{price}</Text>
                            </View>
                        )}
                        {lock === "pro_or_ruby" && price > 0 && (
                            <View style={styles.rubyPillSmall}>
                                <RubyIcon size={10} color="#fff" />
                                <Text style={styles.rubyPillSmallText}>{price}</Text>
                            </View>
                        )}
                    </View>
                )}

                {showProPill && !selected && (
                    <LinearGradient colors={SHEET.goldGradient} style={styles.proPill}>
                        <Text style={styles.proPillText}>PRO</Text>
                    </LinearGradient>
                )}

                {!!topLeft && <View style={styles.topLeft}>{topLeft}</View>}

                <LinearGradient colors={["transparent", "rgba(0,0,0,0.78)"]} style={styles.caption}>
                    <Text style={styles.name} numberOfLines={1}>{name}</Text>
                </LinearGradient>

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
    badge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
    },
    badgeAd: { shadowColor: SHEET.accent, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
    levelStack: { alignItems: "center", gap: 6 },
    levelBadge: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 11, height: 30, borderRadius: 15,
        backgroundColor: "rgba(20,10,30,0.85)",
        borderWidth: 1.2, borderColor: "rgba(255,111,165,0.75)",
    },
    levelBadgeText: { color: "#fff", fontSize: 13, fontWeight: "900" },
    rubyPillBig: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(255,77,141,0.92)",
    },
    rubyPillBigText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    rubyPillSmall: {
        position: "absolute",
        bottom: 34,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 8,
        height: 20,
        borderRadius: 10,
        backgroundColor: "rgba(255,77,141,0.9)",
    },
    rubyPillSmallText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    proPill: { position: "absolute", top: 8, right: 8, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
    proPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
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
