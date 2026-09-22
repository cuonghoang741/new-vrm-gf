import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SHEET } from "../../theme/sheet";

const COLUMNS = 3;
export const TILE_WIDTH =
    (Dimensions.get("window").width - SHEET.gridPadding * 2 - SHEET.gridGap * (COLUMNS - 1)) / COLUMNS;
const ROW_HEIGHT = TILE_WIDTH / SHEET.tileAspect + SHEET.gridGap;

/**
 * The 3-column grid every picker sheet shares: skeleton with the grid's exact
 * footprint while loading (nothing jumps when data lands), retry on error,
 * and a scroll to the selected tile on open.
 */
export function PickerGrid<T extends { id: string }>({
    items,
    loading,
    error,
    onRetry,
    emptyText,
    selectedId,
    visible,
    renderTile,
}: {
    items: T[];
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    emptyText: string;
    selectedId?: string | null;
    visible: boolean;
    renderTile: (item: T, width: number) => React.ReactElement;
}) {
    const { t } = useTranslation();
    const listRef = useRef<FlatList<T>>(null);
    const pulse = useRef(new Animated.Value(0.35)).current;
    const showSkeleton = loading && items.length === 0;

    useEffect(() => {
        if (!showSkeleton) return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [showSkeleton, pulse]);

    useEffect(() => {
        if (!visible || !selectedId || items.length === 0) return;
        const index = items.findIndex((i) => i.id === selectedId);
        if (index < COLUMNS * 2) return; // already on screen
        const timer = setTimeout(() => {
            try {
                // With numColumns, FlatList indexes rows, not items.
                listRef.current?.scrollToIndex({ index: Math.floor(index / COLUMNS), animated: true, viewPosition: 0.4 });
            } catch {
                /* list not laid out yet */
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [visible, selectedId, items]);

    if (showSkeleton) {
        return (
            <View style={styles.skeleton}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <Animated.View key={i} style={[styles.skeletonTile, { opacity: pulse }]} />
                ))}
            </View>
        );
    }
    if (error && items.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorText}>{t("common.failed_load")}</Text>
                <Pressable onPress={onRetry} hitSlop={10}>
                    <Text style={styles.retry}>{t("common.retry")}</Text>
                </Pressable>
            </View>
        );
    }
    if (items.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={styles.empty}>{emptyText}</Text>
            </View>
        );
    }
    return (
        <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(i) => i.id}
            numColumns={COLUMNS}
            renderItem={({ item }) => renderTile(item, TILE_WIDTH)}
            // Lock badges change without the data changing (an unlock landed,
            // PRO turned on); a new renderTile per parent render must repaint.
            extraData={renderTile}
            columnWrapperStyle={{ gap: SHEET.gridGap }}
            contentContainerStyle={styles.content}
            ItemSeparatorComponent={() => <View style={{ height: SHEET.gridGap }} />}
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, row) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * row, index: row })}
            onScrollToIndexFailed={() => { }}
            initialNumToRender={12}
            windowSize={7}
        />
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: SHEET.gridPadding, paddingTop: 6, paddingBottom: 48 },
    skeleton: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: SHEET.gridGap,
        paddingHorizontal: SHEET.gridPadding,
        paddingTop: 6,
    },
    skeletonTile: {
        width: TILE_WIDTH,
        height: TILE_WIDTH / SHEET.tileAspect,
        borderRadius: SHEET.tileRadius,
        backgroundColor: "rgba(255,255,255,0.10)",
    },
    center: { flex: 1, minHeight: 220, alignItems: "center", justifyContent: "center", padding: 20 },
    errorText: { color: "#fff", fontSize: 16, marginBottom: 8 },
    retry: { color: SHEET.accent, fontSize: 16, fontWeight: "700" },
    empty: { color: SHEET.textMuted, fontSize: 14 },
});
