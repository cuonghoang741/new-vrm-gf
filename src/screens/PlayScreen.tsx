import React, {
    useRef,
    useState,
    useCallback,
    useEffect,
} from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    Animated,
    Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import {
    IconSend,
    IconMessageCircle,
    IconX,
    IconPlayerPlay,
    IconHeart,
    IconMusic,
    IconUser,
    IconHanger,
    IconPhoto,
    IconSettings,
    IconCrown,
    IconPhotoFilled,
} from "@tabler/icons-react-native";
import { useAuth } from "../hooks/useAuth";
import VRMViewer, { VRMViewerHandle } from "../components/VRMViewer";
import { chatService, ChatMessage, SuggestedAction } from "../services/chatService";
import { supabase } from "../config/supabase";
import CharacterSheet from "../components/sheets/CharacterSheet";
import CostumeSheet from "../components/sheets/CostumeSheet";
import BackgroundSheet from "../components/sheets/BackgroundSheet";
import SettingsSheet from "../components/sheets/SettingsSheet";
import SubscriptionSheet from "../components/sheets/SubscriptionSheet";
import MediaSheet from "../components/sheets/MediaSheet";
import { useSubscription } from "../contexts/SubscriptionContext";

import * as SecureStore from "expo-secure-store";

const { width, height } = Dimensions.get("window");

const CACHE_KEY = "play_last_character";

interface CachedCharacter {
    characterId: string;
    characterName: string;
    modelUrl: string;
    backgroundUrl: string | null;
    backgroundId: string | null;
}

export default function PlayScreen() {
    const { user, setIsOnboarded } = useAuth();
    const vrmRef = useRef<VRMViewerHandle>(null);
    const flatListRef = useRef<FlatList>(null);

    // Sheet open states (sheets manage their own refs internally)
    const [charSheetOpen, setCharSheetOpen] = useState(false);
    const [costumeSheetOpen, setCostumeSheetOpen] = useState(false);
    const [bgSheetOpen, setBgSheetOpen] = useState(false);
    const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
    const [subscriptionOpen, setSubscriptionOpen] = useState(false);
    const [mediaSheetOpen, setMediaSheetOpen] = useState(false);

    const { isPro } = useSubscription();

    // Character state
    const [characterId, setCharacterId] = useState<string | null>(null);
    const [characterName, setCharacterName] = useState("Companion");
    const [characterModelUrl, setCharacterModelUrl] = useState<string | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [backgroundId, setBackgroundId] = useState<string | null>(null);
    const [vrmReady, setVrmReady] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Animations
    const chatSlideAnim = useRef(new Animated.Value(0)).current;
    const typingDots = useRef(new Animated.Value(0)).current;

    // Save cache helper
    const saveCache = useCallback((data: CachedCharacter) => {
        try {
            SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(data));
        } catch { }
    }, []);

    // Load cached character instantly on mount
    useEffect(() => {
        const loadCache = async () => {
            try {
                const raw = await SecureStore.getItemAsync(CACHE_KEY);
                if (raw) {
                    const cached: CachedCharacter = JSON.parse(raw);
                    setCharacterId(cached.characterId);
                    setCharacterName(cached.characterName);
                    setCharacterModelUrl(cached.modelUrl);
                    setBackgroundUrl(cached.backgroundUrl);
                    setBackgroundId(cached.backgroundId);
                }
            } catch { }
        };
        loadCache();
    }, []);

    // Load user's character from DB (refreshes cache)
    useEffect(() => {
        const loadCharacter = async () => {
            if (!user?.id) return;
            try {
                const { data: prefs } = await supabase
                    .from("user_preferences")
                    .select("current_character_id, matched_character_id, matched_background_id")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                const charId = prefs?.current_character_id || prefs?.matched_character_id;
                if (!charId) return;

                setCharacterId(charId);

                const { data: char } = await supabase
                    .from("characters")
                    .select("name, base_model_url, background_default_id")
                    .eq("id", charId)
                    .single();

                if (char) {
                    setCharacterName(char.name);
                    if (char.base_model_url?.endsWith(".vrm")) {
                        setCharacterModelUrl(char.base_model_url);
                    }
                }

                const bgId = prefs?.matched_background_id || char?.background_default_id;
                let bgUrl: string | null = null;
                if (bgId) {
                    setBackgroundId(bgId);
                    const { data: bg } = await supabase.from("backgrounds").select("image").eq("id", bgId).single();
                    if (bg?.image) {
                        bgUrl = bg.image;
                        setBackgroundUrl(bgUrl);
                    }
                }

                // Update cache
                if (char?.base_model_url?.endsWith(".vrm")) {
                    saveCache({
                        characterId: charId,
                        characterName: char.name,
                        modelUrl: char.base_model_url,
                        backgroundUrl: bgUrl,
                        backgroundId: bgId ?? null,
                    });
                }
            } catch (e) {
                console.error("Failed to load character:", e);
            }
        };
        loadCharacter();
    }, [user?.id, saveCache]);

    // When VRM is ready AND we have model URL → load the model
    useEffect(() => {
        if (vrmReady && characterModelUrl) {
            vrmRef.current?.loadModelByURL(characterModelUrl, characterName);
        }
    }, [vrmReady, characterModelUrl, characterName]);

    // When VRM is ready AND we have background → set it
    useEffect(() => {
        if (vrmReady && backgroundUrl) {
            vrmRef.current?.setBackgroundImage(backgroundUrl);
        }
    }, [vrmReady, backgroundUrl]);

    // Load chat history
    useEffect(() => {
        const loadHistory = async () => {
            if (!characterId || !user?.id) return;
            const history = await chatService.loadHistory(characterId, user.id);
            setMessages(history);
            chatService.markAsSeen(characterId, user.id);
        };
        loadHistory();
    }, [characterId, user?.id]);

    // ─── Chat toggle ───
    const toggleChat = useCallback(() => {
        const opening = !isChatOpen;
        setIsChatOpen(opening);
        Animated.spring(chatSlideAnim, {
            toValue: opening ? 1 : 0,
            tension: 65,
            friction: 11,
            useNativeDriver: true,
        }).start();
        if (!opening) Keyboard.dismiss();
    }, [isChatOpen, chatSlideAnim]);

    // Typing indicator
    useEffect(() => {
        if (isSending) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(typingDots, { toValue: 1, duration: 600, useNativeDriver: true }),
                    Animated.timing(typingDots, { toValue: 0, duration: 600, useNativeDriver: true }),
                ])
            );
            loop.start();
            return () => loop.stop();
        }
    }, [isSending, typingDots]);

    // ─── Execute action from gemini-suggest-action ───
    const executeAction = useCallback((action: SuggestedAction) => {
        if (action.action === "none" || action.confidence < 0.5) return;

        console.log(`[PlayScreen] Action: ${action.action}`, action.parameters);

        switch (action.action) {
            case "play_animation":
                if (action.parameters.animationName) {
                    vrmRef.current?.loadAnimationByName(action.parameters.animationName);
                }
                break;
            case "change_background":
                setBgSheetOpen(true);
                break;
            case "change_costume":
                setCostumeSheetOpen(true);
                break;
            case "change_character":
                setCharSheetOpen(true);
                break;
            default:
                break;
        }
    }, []);

    // ─── Send message ───
    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text || isSending || !characterId || !user?.id) return;
        setInputText("");
        const userMsg: ChatMessage = { id: `temp-${Date.now()}`, role: "user", text, createdAt: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        setIsSending(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        try {
            // Fire both in parallel: chat response + action detection
            const [result, suggestedAction] = await Promise.all([
                chatService.sendMessage(text, characterId, user.id, [...messages, userMsg]),
                chatService.suggestAction(text),
            ]);

            const aiMsg: ChatMessage = { id: `ai-${Date.now()}`, role: "model", text: result.response, createdAt: new Date() };
            setMessages((prev) => [...prev, aiMsg]);

            // Execute the suggested action from Gemini
            executeAction(suggestedAction);

            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (error) {
            const errMsg: ChatMessage = { id: `err-${Date.now()}`, role: "model", text: "Sorry, I couldn't respond right now. Please try again. 💫", createdAt: new Date() };
            setMessages((prev) => [...prev, errMsg]);
        } finally {
            setIsSending(false);
        }
    }, [inputText, isSending, characterId, user?.id, messages, executeAction]);

    // ─── Sheet handlers ───
    const handleCharacterSelect = useCallback(async (char: any) => {
        setCharacterId(char.id);
        setCharacterName(char.name);

        const { data } = await supabase.from("characters").select("base_model_url, background_default_id").eq("id", char.id).single();
        if (data?.base_model_url?.endsWith(".vrm")) {
            setCharacterModelUrl(data.base_model_url);
            vrmRef.current?.loadModelByURL(data.base_model_url, char.name);

            // Update cache
            saveCache({
                characterId: char.id,
                characterName: char.name,
                modelUrl: data.base_model_url,
                backgroundUrl,
                backgroundId,
            });
        }

        // Update user preference
        if (user?.id) {
            await supabase.from("user_preferences").update({ current_character_id: char.id, updated_at: new Date().toISOString() }).eq("user_id", user.id);
        }

        // Reload chat
        if (user?.id) {
            const history = await chatService.loadHistory(char.id, user.id);
            setMessages(history);
        }
    }, [user?.id, backgroundUrl, backgroundId, saveCache]);

    const handleCostumeSelect = useCallback((costume: any) => {
        if (costume.model_url) {
            setCharacterModelUrl(costume.model_url);
            vrmRef.current?.loadModelByURL(costume.model_url, costume.costume_name);
        }
    }, []);

    const handleBackgroundSelect = useCallback((bg: any) => {
        setBackgroundId(bg.id);
        setBackgroundUrl(bg.image);
        vrmRef.current?.setBackgroundImage(bg.image);

        if (user?.id) {
            supabase.from("user_preferences").update({ matched_background_id: bg.id, updated_at: new Date().toISOString() }).eq("user_id", user.id);
        }
    }, [user?.id]);

    // Chat animation
    const chatTranslateY = chatSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });
    const chatOpacity = chatSlideAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.8, 1] });

    const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
        const isAI = item.role === "model";
        return (
            <View style={[styles.messageBubble, isAI ? styles.aiBubble : styles.userBubble]}>
                {isAI && <Text style={styles.aiName}>{characterName}</Text>}
                <Text style={[styles.messageText, isAI ? styles.aiText : styles.userText]}>{item.text}</Text>
            </View>
        );
    }, [characterName]);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* VRM Viewer */}
            <VRMViewer
                ref={vrmRef}
                onReady={() => {
                    setVrmReady(true);
                    vrmRef.current?.setControlsEnabled(true);
                }}
                style={styles.vrmFull}
            />

            {/* Top bar */}
            <View style={styles.topBar}>
                <View>
                    <Text style={styles.charNameTop}>{characterName}</Text>
                    <Text style={styles.statusText}>● Online</Text>
                </View>
                <TouchableOpacity style={styles.settingsBtn} activeOpacity={0.7} onPress={() => setSettingsSheetOpen(true)}>
                    <IconSettings size={22} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
            </View>

            {/* ─── Left side bubble actions ─── */}
            <View style={styles.leftActions}
            >
                <TouchableOpacity
                    style={styles.bubbleBtn}
                    onPress={() => setCharSheetOpen(true)}
                    activeOpacity={0.7}
                >
                    <IconUser size={20} color="#FFFFFF" />
                    <Text style={styles.bubbleLabel}>Character</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bubbleBtn}
                    onPress={() => setCostumeSheetOpen(true)}
                    activeOpacity={0.7}
                >
                    <IconHanger size={20} color="#FFFFFF" />
                    <Text style={styles.bubbleLabel}>Costume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bubbleBtn}
                    onPress={() => setBgSheetOpen(true)}
                    activeOpacity={0.7}
                >
                    <IconPhoto size={20} color="#FFFFFF" />
                    <Text style={styles.bubbleLabel}>Scene</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.bubbleBtn}
                    onPress={() => setMediaSheetOpen(true)}
                    activeOpacity={0.7}
                >
                    <IconPhotoFilled size={20} color="#FFFFFF" />
                    <Text style={styles.bubbleLabel}>Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.bubbleBtn, styles.danceBubble]}
                    onPress={() => vrmRef.current?.loadNextAnimation()}
                    activeOpacity={0.7}
                >
                    <IconMusic size={20} color="#FFFFFF" />
                    <Text style={styles.bubbleLabel}>Dance</Text>
                </TouchableOpacity>
                {!isPro && (
                    <TouchableOpacity
                        style={[styles.bubbleBtn, { backgroundColor: 'rgba(139,92,246,0.3)' }]}
                        onPress={() => setSubscriptionOpen(true)}
                        activeOpacity={0.7}
                    >
                        <IconCrown size={20} color="#F59E0B" />
                        <Text style={[styles.bubbleLabel, { color: '#F59E0B' }]}>PRO</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ─── Right side quick reactions ─── */}
            <View style={styles.rightActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => vrmRef.current?.playRandomGreeting()} activeOpacity={0.7}>
                    <IconPlayerPlay size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => vrmRef.current?.triggerLove()} activeOpacity={0.7}>
                    <IconHeart size={20} color="#FF6B9D" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => vrmRef.current?.triggerDance()} activeOpacity={0.7}>
                    <IconMusic size={20} color="#48BB78" />
                </TouchableOpacity>
            </View>

            {/* Chat FAB */}
            {!isChatOpen && (
                <TouchableOpacity style={styles.chatFab} onPress={toggleChat} activeOpacity={0.8}>
                    <IconMessageCircle size={26} color="#FFFFFF" />
                </TouchableOpacity>
            )}

            {/* ─── Chat overlay ─── */}
            <Animated.View
                style={[styles.chatOverlay, { transform: [{ translateY: chatTranslateY }], opacity: chatOpacity }]}
                pointerEvents={isChatOpen ? "auto" : "none"}
            >
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.chatContainer} keyboardVerticalOffset={0}>
                    <View style={styles.chatHeader}>
                        <View style={styles.chatHeaderHandle} />
                        <View style={styles.chatHeaderRow}>
                            <Text style={styles.chatHeaderTitle}>Chat with {characterName}</Text>
                            <TouchableOpacity onPress={toggleChat} activeOpacity={0.7}><IconX size={22} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
                        </View>
                    </View>

                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={(item) => item.id}
                        style={styles.messageList}
                        contentContainerStyle={styles.messageListContent}
                        showsVerticalScrollIndicator={false}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                        ListEmptyComponent={
                            <View style={styles.emptyChat}><Text style={styles.emptyChatEmoji}>💬</Text><Text style={styles.emptyChatText}>Say hello to {characterName}!</Text></View>
                        }
                        ListFooterComponent={
                            isSending ? <View style={[styles.messageBubble, styles.aiBubble]}><Text style={styles.aiName}>{characterName}</Text><Animated.Text style={[styles.aiText, { opacity: typingDots }]}>typing...</Animated.Text></View> : null
                        }
                    />

                    <View style={styles.inputBar}>
                        <TextInput
                            style={styles.textInput}
                            placeholder={`Message ${characterName}...`}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxLength={500}
                            returnKeyType="default"
                            blurOnSubmit={false}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || isSending}
                            activeOpacity={0.7}
                        >
                            <IconSend size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Animated.View>

            {/* ─── Sheets ─── */}
            <CharacterSheet
                isOpened={charSheetOpen}
                onIsOpenedChange={setCharSheetOpen}
                currentCharacterId={characterId}
                onSelect={handleCharacterSelect}
            />
            <CostumeSheet
                isOpened={costumeSheetOpen}
                onIsOpenedChange={setCostumeSheetOpen}
                characterId={characterId}
                currentCostumeUrl={characterModelUrl}
                onSelect={handleCostumeSelect}
            />
            <BackgroundSheet
                isOpened={bgSheetOpen}
                onIsOpenedChange={setBgSheetOpen}
                currentBackgroundId={backgroundId}
                onSelect={handleBackgroundSelect}
            />
            <SettingsSheet
                isOpened={settingsSheetOpen}
                onIsOpenedChange={setSettingsSheetOpen}
                userId={user?.id}
                userEmail={user?.email}
                onResetOnboarding={async () => {
                    if (!user?.id) return;
                    await supabase.from("user_preferences").update({
                        onboarding_completed: false,
                        updated_at: new Date().toISOString(),
                    }).eq("user_id", user.id);
                    setIsOnboarded(false);
                }}
            />
            <SubscriptionSheet
                isOpened={subscriptionOpen}
                onClose={() => setSubscriptionOpen(false)}
                onPurchaseSuccess={() => {
                    // Refresh to unlock content
                }}
            />
            <MediaSheet
                isOpened={mediaSheetOpen}
                onIsOpenedChange={setMediaSheetOpen}
                characterId={characterId}
                onOpenSubscription={() => { setMediaSheetOpen(false); setSubscriptionOpen(true); }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0a0a1a" },
    vrmFull: { ...StyleSheet.absoluteFillObject },

    // Top bar
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
    settingsBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    },

    // Left bubble actions
    leftActions: {
        position: "absolute", left: 14,
        bottom: Platform.OS === "ios" ? 120 : 100,
        gap: 10, zIndex: 5,
    },
    bubbleBtn: {
        flexDirection: "row", alignItems: "center", gap: 8,
        paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 22,
        backgroundColor: "rgba(155, 89, 255, 0.2)",
        borderWidth: 1, borderColor: "rgba(155, 89, 255, 0.25)",
    },
    danceBubble: {
        backgroundColor: "rgba(72, 187, 120, 0.2)",
        borderColor: "rgba(72, 187, 120, 0.3)",
    },
    bubbleLabel: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },

    // Right actions
    rightActions: {
        position: "absolute", right: 16, top: "35%", gap: 12, zIndex: 5,
    },
    actionBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    },

    // Chat FAB
    chatFab: {
        position: "absolute",
        bottom: Platform.OS === "ios" ? 44 : 28, right: 20,
        width: 60, height: 60, borderRadius: 30,
        backgroundColor: "#9B59FF", justifyContent: "center", alignItems: "center",
        shadowColor: "#9B59FF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
        zIndex: 10,
    },

    // Chat overlay
    chatOverlay: {
        position: "absolute", bottom: 0, left: 0, right: 0, height: height * 0.6, zIndex: 20,
    },
    chatContainer: {
        flex: 1, backgroundColor: "rgba(15, 5, 30, 0.95)",
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(155, 89, 255, 0.15)",
        overflow: "hidden",
    },
    chatHeader: { paddingTop: 8, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(155, 89, 255, 0.08)" },
    chatHeaderHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(155, 89, 255, 0.3)", alignSelf: "center", marginBottom: 12 },
    chatHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    chatHeaderTitle: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },

    // Messages
    messageList: { flex: 1 },
    messageListContent: { padding: 16, paddingBottom: 8 },
    messageBubble: { maxWidth: "80%", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, marginBottom: 8 },
    userBubble: { alignSelf: "flex-end", backgroundColor: "#9B59FF", borderBottomRightRadius: 6 },
    aiBubble: { alignSelf: "flex-start", backgroundColor: "rgba(155, 89, 255, 0.12)", borderBottomLeftRadius: 6 },
    aiName: { fontSize: 11, fontWeight: "600", color: "rgba(155, 89, 255, 0.8)", marginBottom: 3 },
    messageText: { fontSize: 15, lineHeight: 21 },
    userText: { color: "#FFFFFF" },
    aiText: { color: "rgba(255,255,255,0.85)" },
    emptyChat: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
    emptyChatEmoji: { fontSize: 40, marginBottom: 12 },
    emptyChatText: { fontSize: 15, color: "rgba(255,255,255,0.4)" },

    // Input
    inputBar: {
        flexDirection: "row", alignItems: "flex-end",
        paddingHorizontal: 16, paddingVertical: 10,
        paddingBottom: Platform.OS === "ios" ? 30 : 10,
        borderTopWidth: 1, borderTopColor: "rgba(155, 89, 255, 0.08)", gap: 10,
    },
    textInput: {
        flex: 1, backgroundColor: "rgba(155, 89, 255, 0.08)",
        borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10,
        fontSize: 15, color: "#FFFFFF", maxHeight: 100,
        borderWidth: 1, borderColor: "rgba(155, 89, 255, 0.15)",
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#9B59FF", justifyContent: "center", alignItems: "center" },
    sendBtnDisabled: { backgroundColor: "rgba(155, 89, 255, 0.3)" },
});
