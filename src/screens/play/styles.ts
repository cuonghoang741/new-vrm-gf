import { Dimensions, Platform, StyleSheet } from "react-native";
import { ACCENT, ACCENT_GLOW, GLASS_BORDER, GLASS_FILL, GOLD } from "./theme";

/**
 * Every style for PlayScreen.
 *
 * Split out of the screen itself, which had ~300 lines of StyleSheet pinned
 * under ~1600 lines of logic — reaching a style meant scrolling past the whole
 * component, and the file was too long to hold in your head either way.
 */

const { width, height } = Dimensions.get("window");

/** Anchored adaptive banner slot height, mirrored from AdBanner. */
export const PLAY_BANNER_H = 60;

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#050505", // Near black background
    },
    vrmFull: {
        ...StyleSheet.absoluteFillObject,
    },
    pipCameraContainer: {
        position: 'absolute',
        // Same side as the call controls. On the left it landed on top of the
        // 2D/3D toggle, the ruby pill and the streak button, and it read as
        // belonging to them rather than to the call; the FaceTime toggle that
        // turns it on is in the right-hand rail.
        top: 120,
        right: 20,
        width: 100,
        height: 140,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
        zIndex: 50,
    },
    pipCamera: {
        flex: 1,
        transform: [{ scaleX: -1 }], // Mirror front camera
    },

    // Absolutely centred on the bar rather than flexed into the space left
    // over: with flex the diamond's width pushed the whole cluster right of
    // centre. box-none pointer events keep the diamond tappable underneath.
    switcherInBar: {
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    topBar: {
        position: "absolute", top: Platform.OS === "ios" ? 60 : 40,
        left: 20, right: 20,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        zIndex: 5,
    },
    charNameTop: {
        fontSize: 20, fontWeight: "700", color: "#FFFFFF",
        textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    },
    statusText: { fontSize: 12, color: "#48BB78", fontWeight: "500", marginTop: 2 },
    /** Call button in the top bar, sized like the gem beside it. */
    callBtn: {
        width: 38, height: 38, borderRadius: 19,
        justifyContent: "center", alignItems: "center",
        backgroundColor: "#3BB273",
        borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)",
    },
    callBtnEnd: { backgroundColor: "#FF5C7A", borderColor: "rgba(255,255,255,0.9)" },

    /** Flame button under the 2D/3D toggle, matched to its 42pt height. */
    streakBtn: {
        width: 42, height: 42, borderRadius: 21, marginTop: 8,
        justifyContent: "center", alignItems: "center",
        backgroundColor: "rgba(20,10,30,0.55)",
        borderWidth: 1.5, borderColor: "rgba(255,140,0,0.75)",
    },
    streakBadge: {
        position: "absolute", right: -4, bottom: -3,
        minWidth: 17, height: 17, borderRadius: 9,
        paddingHorizontal: 4,
        alignItems: "center", justifyContent: "center",
    },
    streakBadgeText: { color: "#3A1E00", fontSize: 10, fontWeight: "900" },
    streakDot: {
        position: "absolute", top: -1, right: -1,
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: "#FF3B5C",
        borderWidth: 1.5, borderColor: "rgba(20,10,30,0.9)",
    },
    crownOnGem: {
        position: "absolute",
        top: -5,
        right: -5,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#2A1440",
        alignItems: "center",
        justifyContent: "center",
    },
    upgradeProInner: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: ACCENT,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.85)",
        shadowColor: ACCENT,
        shadowOpacity: 0.75,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 2 },
        elevation: 6,
    },
    rubyPill: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 5,
        paddingHorizontal: 14,
        // 42 to match the 2D/3D toggle directly above it in the same rail —
        // it was 32 and read as a different control family.
        height: 42,
        borderRadius: 21,
        marginTop: 8,
        overflow: "hidden",
        // Colour comes from the surface tokens at the call site, like the
        // action buttons; the hardcoded glass constants fought them.
        borderWidth: 1,
    },
    rubyPillText: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "700",
    },
    settingsBtn: {
        // kept for potential reuse
    },

    // Left bubble actions
    leftActions: {
        position: "absolute", left: 14,
        bottom: Platform.OS === "ios" ? 120 : 100,
        gap: 10, zIndex: 5,
    },

    // Static character (non-3D mode)
    staticCharacter: {
        ...StyleSheet.absoluteFillObject,
    },

    // 3D toggle independent
    leftFloatingContainer: {
        position: 'absolute',
        left: 20,
        top: Platform.OS === 'ios' ? 140 : 120, // Below topBar info
        zIndex: 100,
    },
    impressive3DBtn: {
        width: 100,
        height: 48,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    liquidToggleWrapper: {
        borderRadius: 24,
        overflow: 'hidden',
        width: 110,
        height: 42,
        borderWidth: 1,
        borderColor: GLASS_BORDER,
        backgroundColor: Platform.OS === 'android' ? GLASS_FILL : 'transparent',
        shadowColor: '#1A0A2E',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    toggleRow: {
        flexDirection: 'row',
        flex: 1,
        padding: 4,
        alignItems: 'stretch',
    },
    toggleOption: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
    },
    toggleOptionActive: {
        backgroundColor: ACCENT,
        shadowColor: ACCENT,
        shadowOpacity: 0.55,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
    },
    toggleLabel: {
        fontSize: 12,
        fontWeight: '800',
    },
    toggleLabelInactive: {
        color: 'rgba(201,166,255,0.75)',
    },
    toggleLabelActive: {
        color: '#FFFFFF',
    },

    proBadgeLeft: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: GOLD,
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
        zIndex: 10,
    },
    proBadgeLeftText: {
        fontSize: 10,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: 0.5,
    },

    // 3D toggle PRO badge (legacy)
    proBadgeMini: {
        position: "absolute", top: -4, right: -4,
        backgroundColor: GOLD, borderRadius: 6,
        paddingHorizontal: 4, paddingVertical: 1,
    },
    proBadgeMiniText: {
        fontSize: 7, fontWeight: "900", color: "#fff",
    },


    // Chat overlay
    charContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    nudeBlurContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatOverlay: {
        position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 20,
    },
    chatContainer: {
        flex: 1, backgroundColor: "transparent",
        overflow: "hidden",
        justifyContent: "flex-end", // Push everything to bottom
    },
    chatScrim: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        // Covers the message list (30% of the screen) plus the input bar.
        height: height * 0.52,
    },
    chatMessagesWrapper: {
        width: "86%",
        maxHeight: height * 0.3,
        alignSelf: "flex-start", // align left
    },


    // Messages
    messageList: { flexGrow: 1 },
    messageListContent: { padding: 16, paddingBottom: 8 },
    messageBubble: { maxWidth: "80%", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, marginBottom: 8 },
    userBubble: {
        alignSelf: "flex-end",
        backgroundColor: ACCENT,
        borderBottomRightRadius: 6,
        shadowColor: ACCENT_GLOW,
        shadowOpacity: 1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    aiBubble: { alignSelf: "flex-start", backgroundColor: GLASS_FILL, borderWidth: 1, borderColor: GLASS_BORDER, borderBottomLeftRadius: 6 },
    userBubbleLiquid: {
        alignSelf: "flex-end",
        borderBottomRightRadius: 6,
        backgroundColor: Platform.OS === 'android' ? 'rgba(255, 107, 157, 0.22)' : 'transparent',
    },
    aiBubbleLiquid: {
        alignSelf: "flex-start",
        borderBottomLeftRadius: 6,
        backgroundColor: Platform.OS === 'android' ? 'rgba(15, 5, 30, 0.3)' : 'transparent',
    },
    aiName: { fontSize: 11, fontWeight: "700", color: "rgba(255, 150, 190, 0.95)", marginBottom: 3, letterSpacing: 0.2 },
    messageText: {
        fontSize: 14, lineHeight: 20,
    },
    mediaContainer: {
        width: 200, height: 260, borderRadius: 12, overflow: "hidden", marginBottom: 8,
    },
    messageMedia: {
        width: "100%", height: "100%",
    },
    lockedMediaOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    lockBadge: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: "rgba(255, 107, 157, 0.6)",
        alignItems: "center", justifyContent: "center",
        marginBottom: 8,
    },
    lockText: {
        fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1,
    },
    userText: { color: "#FFFFFF" },
    aiText: { color: "rgba(255,255,255,0.85)" },

    // Input
    // No bottom padding: the banner IS the bottom of the screen when it is
    // showing, so reserving safe area under it just leaves a dead strip. The
    // composer above already drops its own safe-area padding when the banner
    // is present (see ChatOverlay's showPlayBanner branch).
    /** AdBanner's own reserved height; the chat block keeps this much clear. */
    playBannerSlot: { paddingBottom: 0 },
    playBannerPinned: {
        position: "absolute",
        left: 0, right: 0, bottom: 0,
        // ABOVE the chat layer (20). An ad that anything can draw over is an
        // obscured ad, which is a mediation finding as well as a lost
        // impression; the chat block keeps PLAY_BANNER_H clear for it.
        zIndex: 25,
    },
    inputBar: {
        flexDirection: "row", alignItems: "flex-end",
        paddingHorizontal: 16, paddingVertical: 10,
        paddingBottom: Platform.OS === "ios" ? 30 : 10,
        borderTopWidth: 1, borderTopColor: "rgba(255, 255, 255, 0.06)", gap: 10,
    },
    textInput: {
        flex: 1, backgroundColor: "rgba(255, 143, 184, 0.08)",
        borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
        fontSize: 15, color: "#FFFFFF", maxHeight: 100,
        borderWidth: 1, borderColor: "rgba(255, 143, 184, 0.15)",
    },
    liquidInputWrapper: {
        flex: 1,
        borderRadius: 22,
        overflow: 'hidden',
        minHeight: 44,
        maxHeight: 120,
        borderWidth: Platform.OS === 'android' ? 1 : 0,
        borderColor: GLASS_BORDER,
        backgroundColor: Platform.OS === 'android' ? GLASS_FILL : 'transparent',
        justifyContent: 'center',
    },
    inputBlurWrapper: {
        flex: 1,
        borderRadius: 22,
        overflow: 'hidden',
        minHeight: 44,
        maxHeight: 120,
        justifyContent: 'center',
        backgroundColor: GLASS_FILL,
        borderWidth: 1,
        borderColor: GLASS_BORDER,
    },
    textInputLiquid: {
        flex: 1,
        paddingHorizontal: 18,
        paddingVertical: Platform.OS === 'ios' ? 12 : 10,
        fontSize: 15,
        color: "#FFFFFF",
        textAlignVertical: 'center',
    },
    // Was #9B59FF — a purple left over from an older palette, the one obviously
    // off-tone control in a composer that is otherwise rose.
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FF6B9D", justifyContent: "center", alignItems: "center" },
    sendBtnLiquid: { width: 44, height: 44, borderRadius: 22 },
    /** Call: a bare glyph, so the composer keeps one filled button (send). */
    callBtnGhost: {
        width: 40, height: 44,
        alignItems: "center", justifyContent: "center",
    },
    sendBtnDisabled: { backgroundColor: "rgba(255, 107, 157, 0.3)" },
});
