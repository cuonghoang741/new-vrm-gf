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
    Pressable,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";

import {
    IconSend,
    IconMessageCircle,
    IconX,
    IconMusic,
    IconUser,
    IconHanger,
    IconPhoto,
    IconSettings,
    IconCrown,
    IconPhotoFilled,
    IconCube,
    IconPhoneCall,
    IconVideo,
    IconPhone,
} from "@tabler/icons-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Audio } from 'expo-av';
import { useConversation } from "@elevenlabs/react-native";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/common/Button";
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
    thumbnailUrl?: string | null;
    agentElevenlabsId?: string | null;
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
    const [characterThumbnail, setCharacterThumbnail] = useState<string | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [backgroundId, setBackgroundId] = useState<string | null>(null);
    const [vrmReady, setVrmReady] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false); // Only PRO can enable
    const [agentElevenlabsId, setAgentElevenlabsId] = useState<string | null>(null);
    const [isVideoCall, setIsVideoCall] = useState(false);
    const [isDancing, setIsDancing] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Call duration tracking
    const callStartTimeRef = useRef<number | null>(null);
    const [callQuota, setCallQuota] = useState<number>(0);
    const callQuotaRef = useRef<number>(0);

    const formatTime = (totalSecs: number) => {
        const m = Math.floor(Math.max(0, totalSecs) / 60);
        const s = Math.floor(Math.max(0, totalSecs)) % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Load user quota
    useEffect(() => {
        if (!user?.id) return;
        supabase.from("user_call_quota").select("remaining_seconds").eq("user_id", user.id).single()
            .then(({ data }) => {
                if (data?.remaining_seconds !== undefined) {
                    setCallQuota(data.remaining_seconds);
                    callQuotaRef.current = data.remaining_seconds;
                }
            });
    }, [user?.id, subscriptionOpen]);

    const conversation = useConversation({
        onConnect: () => {
            console.log("ElevenLabs Connected");
            callStartTimeRef.current = Date.now();
            if (!isChatOpen) setIsChatOpen(true);
            Animated.spring(chatSlideAnim, {
                toValue: 1,
                tension: 65,
                friction: 11,
                useNativeDriver: true,
            }).start();
        },
        onDisconnect: () => {
            console.log("ElevenLabs Disconnected");
            vrmRef.current?.setMouthOpen(0);
            vrmRef.current?.setCallMode(false);
            setIsVideoCall(false);

            if (callStartTimeRef.current && characterId && user?.id) {
                const durationSeconds = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                const minutes = Math.floor(durationSeconds / 60);
                const seconds = durationSeconds % 60;
                const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                const endMessage = `📞 Call ended (${formattedDuration})`;

                const newMsg: ChatMessage = {
                    id: `call-end-${Date.now()}`,
                    role: "model",
                    text: endMessage,
                    createdAt: new Date(),
                };

                setMessages((prev) => [...prev, newMsg]);
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
                chatService.saveCallMessage(endMessage, characterId, user.id, true);

                // Save quota DB
                supabase.from("user_call_quota")
                    .update({ remaining_seconds: Math.max(0, callQuotaRef.current), updated_at: new Date().toISOString() })
                    .eq("user_id", user.id)
                    .then(() => { });

                callStartTimeRef.current = null;
            }
        },
        onError: (err) => console.error("ElevenLabs Error:", err),
        onModeChange: ({ mode }) => {
            if (mode === "speaking") {
                vrmRef.current?.setMouthOpen(0.6);
            } else {
                vrmRef.current?.setMouthOpen(0);
            }
        },
        onMessage: (props: { message: string; source: string }) => {
            if (!props.message || !characterId || !user?.id) return;
            const isAI = props.source === 'ai';
            const newMsg: ChatMessage = {
                id: `call-${Date.now()}-${Math.random()}`,
                role: isAI ? "model" : "user",
                text: props.message,
                createdAt: new Date(),
            };
            setMessages((prev) => [...prev, newMsg]);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

            // Save to DB
            chatService.saveCallMessage(props.message, characterId, user.id, isAI);
        }
    });

    // Animations
    const chatSlideAnim = useRef(new Animated.Value(0)).current;
    const dot1Anim = useRef(new Animated.Value(0)).current;
    const dot2Anim = useRef(new Animated.Value(0)).current;
    const dot3Anim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0)).current;

    // Live countdown
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (conversation.status === "connected") {
            interval = setInterval(() => {
                setCallQuota(prev => {
                    const next = prev - 1;
                    callQuotaRef.current = next;
                    if (next <= 0) {
                        conversation.endSession();
                        setSubscriptionOpen(true);
                        return 0;
                    }
                    return next;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [conversation.status, conversation.endSession]);

    // Pulsing effect for "Calling..." state
    useEffect(() => {
        if (conversation.status === "connecting") {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
                ])
            );
            loop.start();
            return () => loop.stop();
        }
    }, [conversation.status, pulseAnim]);

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
                    if (cached.thumbnailUrl) setCharacterThumbnail(cached.thumbnailUrl);
                    if (cached.agentElevenlabsId) setAgentElevenlabsId(cached.agentElevenlabsId);
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
                    .select("current_character_id")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                let charId = prefs?.current_character_id;

                // Self-healing: If user bypassed Onboarding but their preference failed to save previously
                if (!charId) {
                    console.log("[PlayScreen] No current_character_id found. Attempting to heal...");
                    const { data: firstAsset } = await supabase
                        .from("user_assets")
                        .select("item_id")
                        .eq("user_id", user.id)
                        .eq("item_type", "character")
                        .limit(1)
                        .maybeSingle();

                    if (firstAsset?.item_id) {
                        charId = firstAsset.item_id;
                    } else {
                        // Extreme fallback
                        const { data: firstPublic } = await supabase.from("characters").select("id").eq("is_public", true).limit(1).maybeSingle();
                        if (firstPublic?.id) charId = firstPublic.id;
                    }

                    if (charId) {
                        // Patch the missing user_preferences
                        supabase.from("user_preferences").update({ current_character_id: charId, updated_at: new Date().toISOString() }).eq("user_id", user.id).select().then(({ data }) => {
                            if (data && data.length === 0) {
                                supabase.from("user_preferences").insert({ user_id: user.id, current_character_id: charId, updated_at: new Date().toISOString() }).then();
                            }
                        });
                    }
                }

                if (!charId) return;

                setCharacterId(charId);

                const { data: char } = await supabase
                    .from("characters")
                    .select("name, base_model_url, background_default_id, thumbnail_url, agent_elevenlabs_id")
                    .eq("id", charId)
                    .single();

                console.log("Character found:", char);

                let finalModelUrl = char ? (char.base_model_url ?? "") : "";
                let finalThumbnailUrl = char ? (char.thumbnail_url ?? null) : null;

                if (char) {
                    // Lấy trang phục đang mặc hiện tại (nếu có)
                    const { data: userChar } = await supabase
                        .from("user_character")
                        .select("current_costume_id")
                        .eq("user_id", user.id)
                        .eq("character_id", charId)
                        .maybeSingle();

                    if (userChar?.current_costume_id) {
                        const { data: costume } = await supabase
                            .from("character_costumes")
                            .select("model_url, thumbnail")
                            .eq("id", userChar.current_costume_id)
                            .maybeSingle();
                        if (costume) {
                            if (costume.model_url) finalModelUrl = costume.model_url;
                            if (costume.thumbnail) finalThumbnailUrl = costume.thumbnail;
                        }
                    }

                    setCharacterName(char.name);
                    setCharacterThumbnail(finalThumbnailUrl);
                    if (finalModelUrl.endsWith(".vrm")) {
                        setCharacterModelUrl(finalModelUrl);
                    }
                    if (char.agent_elevenlabs_id) {
                        setAgentElevenlabsId(char.agent_elevenlabs_id);
                    }
                }

                const bgId = char?.background_default_id;
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
                if (char) {
                    saveCache({
                        characterId: charId,
                        characterName: char.name,
                        modelUrl: finalModelUrl,
                        backgroundUrl: bgUrl,
                        backgroundId: bgId ?? null,
                        thumbnailUrl: finalThumbnailUrl,
                        agentElevenlabsId: char.agent_elevenlabs_id ?? null,
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

    // ─── Call toggle ───
    const toggleCall = useCallback(async () => {
        if (conversation.status === "connected" || conversation.status === "connecting") {
            await conversation.endSession();
            setIsVideoCall(false);
            vrmRef.current?.setCallMode(false);
        } else {
            if (callQuotaRef.current <= 0) {
                setSubscriptionOpen(true);
                return;
            }
            if (agentElevenlabsId) {
                const audioPerm = await Audio.requestPermissionsAsync();
                if (audioPerm.status !== 'granted') {
                    alert("Microphone permission is required to make calls.");
                    return;
                }

                try {
                    // Start audio-only call by default
                    setIsVideoCall(false);
                    vrmRef.current?.setCallMode(false);
                    await conversation.startSession({
                        agentId: agentElevenlabsId,
                    });
                } catch (e: any) {
                    console.error("Failed to start elevenlabs session:", e);
                }
            } else {
                alert("This character does not support voice calling yet.");
            }
        }
    }, [conversation, isPro, agentElevenlabsId]);

    // ─── Video Call / Camera Toggle ───
    const toggleCamera = useCallback(async () => {
        if (!isPro) {
            setSubscriptionOpen(true);
            return;
        }

        if (isVideoCall) {
            // Turn off camera
            setIsVideoCall(false);
            // vrmRef.current?.setCallMode(false); // Optional: if you want to exit close-up
        } else {
            // Turn on camera
            if (!permission?.granted) {
                const status = await requestPermission();
                if (!status.granted) {
                    alert("Camera permission is required for video call overlay.");
                    return;
                }
            }
            setIsVideoCall(true);
            if (!is3DMode) {
                setIs3DMode(true); // Ensure VRM is visible
            }
            vrmRef.current?.setCallMode(true);
        }
    }, [isPro, isVideoCall, permission, requestPermission, is3DMode]);

    // Typing indicator - 3 bouncing dots
    useEffect(() => {
        if (isSending) {
            const createBounce = (anim: Animated.Value, delay: number) =>
                Animated.loop(
                    Animated.sequence([
                        Animated.delay(delay),
                        Animated.timing(anim, { toValue: -6, duration: 300, useNativeDriver: true }),
                        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
                    ])
                );
            const a1 = createBounce(dot1Anim, 0);
            const a2 = createBounce(dot2Anim, 150);
            const a3 = createBounce(dot3Anim, 300);
            a1.start(); a2.start(); a3.start();
            return () => { a1.stop(); a2.stop(); a3.stop(); dot1Anim.setValue(0); dot2Anim.setValue(0); dot3Anim.setValue(0); };
        }
    }, [isSending, dot1Anim, dot2Anim, dot3Anim]);

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

            case "send_photo":
                setMediaSheetOpen(true);
                // MediaSheet defaults to "image" tab
                break;

            case "send_video":
                setMediaSheetOpen(true);
                // TODO: auto-switch to video tab
                break;

            case "send_nude_media":
                // PRO-gated: open subscription if not PRO, else open media
                if (!isPro) {
                    setSubscriptionOpen(true);
                } else {
                    setMediaSheetOpen(true);
                }
                break;

            case "become_nude":
                // PRO-gated nude costume
                if (!isPro) {
                    setSubscriptionOpen(true);
                } else {
                    setCostumeSheetOpen(true);
                }
                break;

            case "start_voice_call":
                // Enable call mode (close-up camera + head tracking)
                vrmRef.current?.setCallMode(true);
                break;

            case "start_video_call":
                vrmRef.current?.setCallMode(true);
                break;

            case "open_subscription":
                setSubscriptionOpen(true);
                break;

            default:
                break;
        }
    }, [isPro]);

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
            // Fire action detection in background
            chatService.suggestAction(text).then(action => {
                executeAction(action);
            }).catch(() => { });

            const aiMsgBaseId = `ai-${Date.now()}`;

            // Call the edge function (returns pre-split messages)
            const result = await chatService.sendMessage(text, characterId, user.id, [...messages, userMsg]);

            console.log("[PlayScreen] AI result:", JSON.stringify(result));

            const validMessages = (result.messages || []).filter((msg: string) => msg && msg.trim().length > 0);
            const finalMsgs = validMessages.length > 0 ? validMessages : (result.response?.trim() ? [result.response.trim()] : []);

            if (finalMsgs.length === 0) {
                setIsSending(false);
                return;
            }

            setIsSending(false);

            // Show each message sequentially with a short delay
            for (let msgIdx = 0; msgIdx < finalMsgs.length; msgIdx++) {
                setMessages((prev) => [...prev, {
                    id: `${aiMsgBaseId}-${msgIdx}`,
                    role: "model" as const,
                    text: finalMsgs[msgIdx],
                    createdAt: new Date(),
                }]);
                flatListRef.current?.scrollToEnd({ animated: true });

                // Pause between messages for natural feel
                if (msgIdx < finalMsgs.length - 1) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (error) {
            console.error("[PlayScreen] Chat error:", error);
            const errMsg: ChatMessage = { id: `err-${Date.now()}`, role: "model", text: "Sorry, I couldn't respond right now. Please try again. 💫", createdAt: new Date() };
            setMessages((prev) => [...prev, errMsg]);
            setIsSending(false);
        }
    }, [inputText, isSending, characterId, user?.id, messages, executeAction]);

    // ─── Sheet handlers ───
    const handleCharacterSelect = useCallback(async (char: any) => {
        setCharacterId(char.id);
        setCharacterName(char.name);
        if (char.thumbnail_url) setCharacterThumbnail(char.thumbnail_url);

        const { data } = await supabase.from("characters").select("base_model_url, background_default_id, thumbnail_url").eq("id", char.id).single();
        if (data?.thumbnail_url) setCharacterThumbnail(data.thumbnail_url);
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
                thumbnailUrl: data.thumbnail_url ?? char.thumbnail_url ?? null,
            });
        }

        // Update user preference + cache ownership
        if (user?.id) {
            const { data } = await supabase.from("user_preferences").update({ current_character_id: char.id, updated_at: new Date().toISOString() }).eq("user_id", user.id).select();
            if (data && data.length === 0) {
                await supabase.from("user_preferences").insert({ user_id: user.id, current_character_id: char.id, updated_at: new Date().toISOString() });
            }
            supabase.from("user_assets")
                .insert({ user_id: user.id, item_id: char.id, item_type: "character" })
                .then(() => { }, () => { });
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
        if (costume.thumbnail) {
            setCharacterThumbnail(costume.thumbnail);
        }

        // Cập nhật lại cache offline cho mượt
        if (characterId) {
            saveCache({
                characterId,
                characterName,
                modelUrl: costume.model_url || characterModelUrl || "",
                backgroundUrl,
                backgroundId,
                thumbnailUrl: costume.thumbnail || characterThumbnail,
                agentElevenlabsId,
            });
        }

        // Cache ownership
        if (user?.id && costume.id) {
            supabase.from("user_assets")
                .insert({ user_id: user.id, item_id: costume.id, item_type: "character_costume" })
                .then(() => { }, () => { });

            // Lưu trang phục cuối cùng của nhân vật này lên DB
            if (characterId) {
                supabase.from("user_character")
                    .upsert(
                        { user_id: user.id, character_id: characterId, current_costume_id: costume.id },
                        { onConflict: "user_id,character_id" }
                    )
                    .then();
            }
        }
    }, [user?.id, characterId, characterName, characterModelUrl, characterThumbnail, backgroundUrl, backgroundId, agentElevenlabsId, saveCache]);

    const handleBackgroundSelect = useCallback((bg: any) => {
        setBackgroundId(bg.id);
        // Use video_url if available, otherwise fall back to image
        const bgSource = bg.video_url || bg.image;
        setBackgroundUrl(bgSource);
        vrmRef.current?.setBackgroundImage(bgSource);

        if (user?.id) {
            // Cache ownership
            supabase.from("user_assets")
                .insert({ user_id: user.id, item_id: bg.id, item_type: "background" })
                .then(() => { }, () => { });
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

            {/* VRM Viewer (PRO) or Static Image (non-PRO) */}
            {is3DMode && isPro ? (
                <View style={styles.vrmFull}>
                    <VRMViewer
                        ref={vrmRef}
                        onReady={() => {
                            setVrmReady(true);
                            vrmRef.current?.setControlsEnabled(true);
                            if (isVideoCall) {
                                vrmRef.current?.setCallMode(true);
                            }
                            if (isDancing) {
                                setTimeout(() => {
                                    vrmRef.current?.loadNextAnimation();
                                }, 500);
                            }
                        }}
                        style={StyleSheet.absoluteFillObject}
                    />
                </View>
            ) : (
                <View style={styles.vrmFull}>
                    {backgroundUrl && (
                        <Image
                            source={{ uri: backgroundUrl }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                        />
                    )}
                    {characterThumbnail && (
                        <Image
                            source={{ uri: characterThumbnail }}
                            style={styles.staticCharacter}
                            contentFit="cover"
                        />
                    )}
                </View>
            )}

            {/* User Front Camera floating pip for Video Call */}
            {isVideoCall && (
                <View style={styles.pipCameraContainer}>
                    <CameraView style={styles.pipCamera} facing="front" />
                </View>
            )}

            {/* Visual Overlay when connecting (Setup Call Screen) */}
            {conversation.status === "connecting" && (
                <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 999, justifyContent: 'center', alignItems: 'center' }]}>
                    {/* Pulsing rings */}
                    <Animated.View style={{ transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.9, 1.4] }) }], opacity: pulseAnim, position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
                    <Animated.View style={{ transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.2] }) }], opacity: pulseAnim, position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />

                    {characterThumbnail && (
                        <Image source={{ uri: characterThumbnail }} style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' }} contentFit="cover" />
                    )}

                    <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 30 }}>{characterName}</Text>
                    <Animated.Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', opacity: pulseAnim, marginTop: 10 }}>Calling...</Animated.Text>

                    {/* End Call Button */}
                    <Pressable
                        style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 100, elevation: 5, shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }}
                        onPress={() => conversation.endSession()}
                    >
                        <IconPhone size={32} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
                    </Pressable>
                </BlurView>
            )}

            {/* Top bar */}
            <View style={styles.topBar}>
                <View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.charNameTop}>{characterName}</Text>
                        {isPro && (
                            <Pressable onPress={() => setSubscriptionOpen(true)} hitSlop={8}>
                                <IconCrown size={18} color="#F59E0B" fill="#F59E0B" />
                            </Pressable>
                        )}
                    </View>
                    <Text style={styles.statusText}>
                        ● Online {callQuota > 0 ? `| 📞 ${formatTime(callQuota)}` : ''}
                    </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {conversation.status === "connected" && (
                        <Button
                            variant="liquid"
                            size="sm"
                            onPress={toggleCamera}
                            startIcon={isVideoCall ? IconVideo : IconVideo}
                            startIconColor={isVideoCall ? "#8B5CF6" : "rgba(255,255,255,0.7)"}
                        >
                            {isVideoCall ? "Cam On" : "Cam Off"}
                        </Button>
                    )}
                    <Button
                        variant="liquid"
                        onPress={() => setSettingsSheetOpen(true)}
                        startIcon={IconSettings}
                        isIconOnly
                    />
                </View>
            </View>

            {/* ─── Left side bubble actions ─── */}
            <View style={styles.leftActions}>
                {!["connected", "connecting"].includes(conversation.status) && (
                    <>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconUser}
                            onPress={() => setCharSheetOpen(true)}
                        >
                            Character
                        </Button>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconHanger}
                            onPress={() => setCostumeSheetOpen(true)}
                        >
                            Costume
                        </Button>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconPhoto}
                            onPress={() => setBgSheetOpen(true)}
                        >
                            Scene
                        </Button>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconPhotoFilled}
                            onPress={() => setMediaSheetOpen(true)}
                        >
                            Gallery
                        </Button>
                        <View>
                            <Button
                                variant="liquid"
                                size="sm"
                                startIcon={isDancing ? IconX : IconMusic}
                                startIconColor={isDancing ? "#EF4444" : undefined}
                                onPress={() => {
                                    if (!isPro) {
                                        setSubscriptionOpen(true);
                                        return;
                                    }
                                    if (!is3DMode) {
                                        setVrmReady(false);
                                        setIs3DMode(true);
                                        setIsDancing(true);
                                    } else {
                                        if (isDancing) {
                                            vrmRef.current?.stopAnimation();
                                            setIsDancing(false);
                                        } else {
                                            vrmRef.current?.loadNextAnimation();
                                            setIsDancing(true);
                                        }
                                    }
                                }}
                            >
                                {isDancing ? "Stop" : "Dance"}
                            </Button>
                            {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                        </View>
                        <View>
                            <Button
                                variant="liquid"
                                size="sm"
                                startIcon={IconCube}
                                startIconColor={is3DMode && isPro ? '#8B5CF6' : undefined}
                                onPress={() => {
                                    if (!isPro) {
                                        setSubscriptionOpen(true);
                                    } else {
                                        setVrmReady(false); // Reset so VRM re-triggers model+bg load on mount
                                        setIs3DMode(prev => !prev);
                                    }
                                }}
                            >
                                3D
                            </Button>
                            {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                        </View>
                    </>
                )}

                {agentElevenlabsId && (
                    <View>
                        <Button
                            variant="liquid"
                            size="sm"
                            startIcon={IconPhoneCall}
                            startIconColor={conversation.status === "connected" ? '#8B5CF6' : undefined}
                            onPress={toggleCall}
                        >
                            {["connected", "connecting"].includes(conversation.status) ? "End Call" : "Call"}
                        </Button>
                        {!isPro && <View style={styles.proBadgeMini}><Text style={styles.proBadgeMiniText}>PRO</Text></View>}
                    </View>
                )}
                {!isPro && (
                    <Button
                        variant="liquid"
                        size="sm"
                        startIcon={IconCrown}
                        startIconColor="#F59E0B"
                        onPress={() => setSubscriptionOpen(true)}
                    >
                        PRO
                    </Button>
                )}
            </View>


            {/* Chat FAB */}
            {!isChatOpen && (
                <View style={styles.chatFab}>
                    <Button
                        variant="liquid"
                        size="sm"
                        onPress={toggleChat}
                        startIcon={IconMessageCircle}
                    >
                        Chat
                    </Button>
                </View>
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
                            isSending ? (
                                <View style={[styles.messageBubble, styles.aiBubble]}>
                                    <Text style={styles.aiName}>{characterName}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingTop: 4 }}>
                                        {[dot1Anim, dot2Anim, dot3Anim].map((anim, i) => (
                                            <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 2, transform: [{ translateY: anim }] }} />
                                        ))}
                                    </View>
                                </View>
                            ) : null
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
                isPro={isPro}
                onOpenSubscription={() => setSubscriptionOpen(true)}
                userId={user?.id}
            />
            <CostumeSheet
                isOpened={costumeSheetOpen}
                onIsOpenedChange={setCostumeSheetOpen}
                characterId={characterId}
                currentCostumeUrl={characterModelUrl}
                onSelect={handleCostumeSelect}
                isPro={isPro}
                onOpenSubscription={() => setSubscriptionOpen(true)}
                userId={user?.id}
            />
            <BackgroundSheet
                isOpened={bgSheetOpen}
                onIsOpenedChange={setBgSheetOpen}
                currentBackgroundId={backgroundId}
                onSelect={handleBackgroundSelect}
                isPro={isPro}
                onOpenSubscription={() => setSubscriptionOpen(true)}
                userId={user?.id}
            />
            <SettingsSheet
                isOpened={settingsSheetOpen}
                onIsOpenedChange={setSettingsSheetOpen}
                userId={user?.id}
                userEmail={user?.email}
                onOpenSubscription={() => {
                    setSettingsSheetOpen(false);
                    setTimeout(() => setSubscriptionOpen(true), 400);
                }}
                onResetOnboarding={async () => {
                    if (!user?.id) return;
                    // Delete user_assets (checkOnboarding checks this table)
                    await supabase.from("user_assets").delete().eq("user_id", user.id);
                    await supabase.from("user_preferences").delete().eq("user_id", user.id);
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
    container: {
        flex: 1,
        backgroundColor: "#8B5CF6", // Background tím
    },
    vrmFull: {
        ...StyleSheet.absoluteFillObject,
    },
    pipCameraContainer: {
        position: 'absolute',
        top: 100,
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

    // 3D toggle PRO badge
    proBadgeMini: {
        position: "absolute", top: -4, right: -4,
        backgroundColor: "#F59E0B", borderRadius: 6,
        paddingHorizontal: 4, paddingVertical: 1,
    },
    proBadgeMiniText: {
        fontSize: 7, fontWeight: "900", color: "#fff",
    },


    // Chat FAB
    chatFab: {
        position: "absolute",
        bottom: Platform.OS === "ios" ? 44 : 28, right: 20,
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
