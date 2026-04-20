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
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";

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
    IconBadge3d,
    IconLock,
} from "@tabler/icons-react-native";

const diamondIcon = require("../../assets/diamond-upgrade.png");
import { CameraView } from "expo-camera";
import { Video, ResizeMode } from "expo-av";
import { useAuth } from "../hooks/useAuth";
import { useAppVoiceCall } from "../hooks/useAppVoiceCall";
import { VoiceLoadingOverlay } from "../components/common/VoiceLoadingOverlay";
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
import ActionsBubble from "../components/ActionsBubble";
import { useSubscription } from "../contexts/SubscriptionContext";
import { analyticsService } from "../services/AnalyticsService";

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
    avatarUrl?: string | null;
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

    const { isPro, refreshStatus } = useSubscription();

    // Character state
    const [characterId, setCharacterId] = useState<string | null>(null);
    const [characterName, setCharacterName] = useState("Companion");
    const [characterModelUrl, setCharacterModelUrl] = useState<string | null>(null);
    const [baseModelUrl, setBaseModelUrl] = useState<string | null>(null);
    const [characterThumbnail, setCharacterThumbnail] = useState<string | null>(null);
    const [characterAvatar, setCharacterAvatar] = useState<string | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [backgroundId, setBackgroundId] = useState<string | null>(null);
    const [vrmReady, setVrmReady] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false); // Only PRO can enable
    const [agentElevenlabsId, setAgentElevenlabsId] = useState<string | null>(null);
    const [isDancing, setIsDancing] = useState(false);

    const [userProfile, setUserProfile] = useState<{ display_name?: string; country?: string } | null>(null);
    const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
    const [isNudeBlurred, setIsNudeBlurred] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Call duration tracking
    const callStartTimeRef = useRef<number | null>(null);

    const formatTime = (totalSecs: number) => {
        const m = Math.floor(Math.max(0, totalSecs) / 60);
        const s = Math.floor(Math.max(0, totalSecs)) % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Parallel fetch for profile and stats to optimize Telegram notifications
    useEffect(() => {
        if (!user?.id) return;
        Promise.all([
            supabase.from("profiles").select("display_name, country").eq("id", user.id).maybeSingle(),
            supabase.from("user_stats").select("created_at").eq("user_id", user.id).maybeSingle()
        ]).then(([profileRes, statsRes]) => {
            if (profileRes.data) setUserProfile(profileRes.data);
            if (statsRes.data?.created_at) setUserCreatedAt(statsRes.data.created_at);
        });
    }, [user?.id, subscriptionOpen]);

    const {
        voiceState,
        isVoiceMode,
        isCameraMode,
        handleToggleCameraMode,
        handleToggleVoiceMode,
        endCall,
        remainingQuotaSeconds,
    } = useAppVoiceCall({
        activeCharacterId: characterId || undefined,
        userId: user?.id,
        webBridgeRef: vrmRef,
        isPro,
        onQuotaExhausted: () => setSubscriptionOpen(true),
        voiceCallbacks: {
            onConnect: () => {
                console.log("ElevenLabs Connected");
                callStartTimeRef.current = Date.now();
            },
            onDisconnect: () => {
                console.log("ElevenLabs Disconnected");
                vrmRef.current?.setMouthOpen(0);
                vrmRef.current?.setCallMode(false);

                // Free users: turn off 3D mode after call ends
                if (!isPro) {
                    setIs3DMode(false);
                }

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

                    callStartTimeRef.current = null;
                }
            },
            onError: (err: any) => console.error("ElevenLabs Error:", err),
            onModeChange: ({ mode }: any) => {
                // Disabled mouth movement per user request
                vrmRef.current?.setMouthOpen(0);
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
        }
    });

    // Animations
    // Auto-enable 3D mode during voice/video calls (for all users, including free)
    useEffect(() => {
        if (isVoiceMode && !is3DMode) {
            setVrmReady(false);
            setIs3DMode(true);
        }
    }, [isVoiceMode]);

    const dot1Anim = useRef(new Animated.Value(0)).current;
    const dot2Anim = useRef(new Animated.Value(0)).current;
    const dot3Anim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0)).current;

    // Track keyboard state for dismissal layer and snap padding
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [keyboardPadding, setKeyboardPadding] = useState(0);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (e) => {
            setKeyboardPadding(e.endCoordinates.height);
            setKeyboardVisible(true);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardPadding(0);
            setKeyboardVisible(false);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Pulsing effect for "Calling..." state
    useEffect(() => {
        if (voiceState.status === "connecting") {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
                ])
            );
            loop.start();
            return () => loop.stop();
        }
    }, [voiceState.status, pulseAnim]);

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
                    if (cached.avatarUrl) setCharacterAvatar(cached.avatarUrl);
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
                        const { data: firstPublic } = await supabase.from("characters").select("id").eq("is_public", true).eq("available", true).limit(1).maybeSingle();
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

                let { data: char } = await supabase
                    .from("characters")
                    .select("name, base_model_url, background_default_id, thumbnail_url, avatar, agent_elevenlabs_id")
                    .eq("id", charId)
                    .maybeSingle();

                if (!char) {
                    console.log("[PlayScreen] Character not found in DB! Attempting to fallback to public character...");
                    const { data: firstPublic } = await supabase.from("characters").select("id, name, base_model_url, background_default_id, thumbnail_url, avatar, agent_elevenlabs_id").eq("is_public", true).eq("available", true).limit(1).maybeSingle();
                    if (firstPublic) {
                        charId = firstPublic.id;
                        char = firstPublic;
                        supabase.from("user_preferences").update({ current_character_id: charId, updated_at: new Date().toISOString() }).eq("user_id", user.id).then();
                        setCharacterId(charId);
                    } else {
                        return;
                    }
                }

                console.log("Character found:", char);

                let finalModelUrl = char ? (char.base_model_url ?? "") : "";
                let finalThumbnailUrl = char ? (char.thumbnail_url ?? null) : null;
                let finalAvatarUrl = char ? (char.avatar ?? null) : null;

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
                            .select("model_url, thumbnail, url")
                            .eq("id", userChar.current_costume_id)
                            .maybeSingle();
                        if (costume) {
                            if (costume.model_url) finalModelUrl = costume.model_url;
                            if (costume.thumbnail) finalThumbnailUrl = costume.thumbnail;
                            if (costume.url) finalAvatarUrl = costume.url;
                        }
                    }

                    setCharacterName(char.name);
                    setCharacterThumbnail(finalThumbnailUrl);
                    setCharacterAvatar(finalAvatarUrl);
                    if (finalModelUrl.endsWith(".vrm")) {
                        setCharacterModelUrl(finalModelUrl);
                        setBaseModelUrl(char.base_model_url); // Store the default base model
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
                        avatarUrl: finalAvatarUrl,
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

            if (history.length === 0) {
                // If chat is entirely empty, inject a random flirty default message
                const flirtyGreetings = [
                    "Hey there... I've been waiting for you to come play. Don't keep me waiting too long, okay? 😉💕",
                    "I was just thinking about you... and hoping you'd show up. Ready to have some fun? ✨",
                    "You finally made it! I wore this just for you... do you like it? 💖",
                    "There you are. Come closer, I've got a secret to tell you... 💋",
                    "I've been so bored without you. Thrilled you're finally here to entertain me. 😘"
                ];
                const defaultMsgText = flirtyGreetings[Math.floor(Math.random() * flirtyGreetings.length)];

                const starterMsg: ChatMessage = {
                    id: `greeting-${characterId}`,
                    role: "model",
                    text: defaultMsgText,
                    createdAt: new Date(),
                };
                setMessages([starterMsg]);

                // Save it to the DB so it permanently becomes the start of the chat history
                chatService.saveCallMessage(defaultMsgText, characterId, user.id, true);
            } else {
                setMessages(history);
            }

            chatService.markAsSeen(characterId, user.id);
        };
        loadHistory();
    }, [characterId, user?.id]);

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
            case "send_video":
            case "send_nude_media":
                (async () => {
                    const type = action.action === "send_video" ? "video" : (action.action === "send_nude_media" ? "nude" : "image");

                    const media = await chatService.fetchRandomMedia(characterId || "", type, isPro);
                    if (media) {
                        const mediaMsg: ChatMessage = {
                            id: `ai-media-${Date.now()}`,
                            role: "model",
                            text: "", // Independent media message without text
                            mediaUrl: media.url,
                            mediaType: media.type,
                            mediaTier: media.tier,
                            createdAt: new Date(),
                        };
                        setMessages((prev) => [...prev, mediaMsg]);

                    // Persist to DB with media_id link
                        chatService.saveMediaMessage(characterId || "", user?.id || "", media.id);
                    } else {
                        // Fallback: open media sheet if no specific media found
                        setMediaSheetOpen(true);
                    }
                })();
                break;

            case "become_nude":
                (async () => {
                    // 1. Force 3D Mode
                    if (!is3DMode) {
                        setIs3DMode(true);
                        setVrmReady(false);
                    }

                    // 2. Find nude costume
                    const { data: costumes } = await supabase
                        .from("character_costumes")
                        .select("*")
                        .eq("character_id", characterId)
                        .ilike("costume_name", "%nude%")
                        .limit(1);

                    if (costumes && costumes.length > 0) {
                        const nude = costumes[0];
                        console.log(`[PlayScreen] Action become_nude: Applying costume ${nude.costume_name}`);
                        
                        if (characterModelUrl) {
                            setBaseModelUrl(characterModelUrl);
                        }
                        setCharacterModelUrl(nude.model_url);
                        if (vrmRef.current) {
                            vrmRef.current.loadModelByURL(nude.model_url);
                        }

                        // 3. Set blur if not pro
                        if (!isPro) {
                            setIsNudeBlurred(true);
                        }
                    } else {
                        console.log("[PlayScreen] Action become_nude: No nude costume found for this character");
                        // Fallback: show costume sheet so user can see available options
                        setCostumeSheetOpen(true);
                    }
                })();
                break;

            case "start_voice_call":
            case "start_video_call":
                vrmRef.current?.setCallMode(true);
                break;

            case "open_subscription":
                setSubscriptionOpen(true);
                break;

            default:
                break;
        }
    }, [isPro, characterId, user?.id, is3DMode, characterModelUrl]);

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
            const daysUsed = userCreatedAt ? Math.floor((Date.now() - new Date(userCreatedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
            const result = await chatService.sendMessage(text, characterId, user.id, [...messages, userMsg], isPro, {
                userName: userProfile?.display_name,
                country: userProfile?.country,
                daysUsed
            });

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
        setIsNudeBlurred(false);
        if (char.thumbnail_url) setCharacterThumbnail(char.thumbnail_url);

        // Fetch full detail for the character (including avatar/vrm/background)
        const { data: fullChar } = await supabase
            .from("characters")
            .select("base_model_url, background_default_id, thumbnail_url, avatar")
            .eq("id", char.id)
            .single();

        if (fullChar) {
            if (fullChar.thumbnail_url) setCharacterThumbnail(fullChar.thumbnail_url);
            if (fullChar.avatar) setCharacterAvatar(fullChar.avatar);

            // Handle VRM if applicable
            if (fullChar.base_model_url?.toLowerCase().endsWith(".vrm")) {
                setCharacterModelUrl(fullChar.base_model_url);
                setBaseModelUrl(fullChar.base_model_url);
                vrmRef.current?.loadModelByURL(fullChar.base_model_url, char.name);
            } else {
                setCharacterModelUrl(null);
                setBaseModelUrl(null);
                setIs3DMode(false); // Drop back to 2D mode for non-VRM characters
            }

            // Handle Background
            let charBgUrl = backgroundUrl;
            let charBgId = fullChar.background_default_id || backgroundId;

            if (fullChar.background_default_id) {
                const { data: bgData } = await supabase
                    .from("backgrounds")
                    .select("image")
                    .eq("id", fullChar.background_default_id)
                    .single();
                if (bgData?.image) {
                    charBgUrl = bgData.image;
                    setBackgroundUrl(charBgUrl);
                    setBackgroundId(fullChar.background_default_id ?? null);
                    if (is3DMode) vrmRef.current?.setBackgroundImage(charBgUrl!);
                }
            }

            // Log Analytics
            analyticsService.logCharacterSelect(char.id, char.name);

            // Update Cache
            saveCache({
                characterId: char.id,
                characterName: char.name,
                modelUrl: fullChar.base_model_url || "",
                backgroundUrl: charBgUrl,
                backgroundId: charBgId,
                thumbnailUrl: fullChar.thumbnail_url || char.thumbnail_url || null,
                avatarUrl: fullChar.avatar || null,
                agentElevenlabsId
            });
        }

        // Update user preference + cache ownership
        if (user?.id) {
            const { data: prefData } = await supabase.from("user_preferences").update({ current_character_id: char.id, updated_at: new Date().toISOString() }).eq("user_id", user.id).select();
            if (prefData && prefData.length === 0) {
                await supabase.from("user_preferences").insert({ user_id: user.id, current_character_id: char.id, updated_at: new Date().toISOString() });
            }
            supabase.from("user_assets")
                .insert({ user_id: user.id, item_id: char.id, item_type: "character" })
                .then(() => { }, () => { });
        }

        // Reload chat
        const uId = user?.id;
        const cId = char.id;
        if (uId && cId) {
            const history = await chatService.loadHistory(cId, uId);
            setMessages(history);
        }
    }, [user?.id, backgroundUrl, backgroundId, saveCache, is3DMode, agentElevenlabsId]);

    const handleCostumeSelect = useCallback((costume: any) => {
        if (costume.model_url) {
            setCharacterModelUrl(costume.model_url);
            setIsNudeBlurred(false);
            vrmRef.current?.loadModelByURL(costume.model_url, costume.costume_name);
        }
        if (costume.thumbnail) {
            setCharacterThumbnail(costume.thumbnail);
        }
        if (costume.url) {
            setCharacterAvatar(costume.url);
        }

        // Cập nhật lại cache offline cho mượt
        if (characterId) {
            saveCache({
                characterId,
                characterName,
                modelUrl: costume.model_url || characterModelUrl || "",
                backgroundUrl,
                backgroundId,
                thumbnailUrl: costume.thumbnail || characterThumbnail || null,
                avatarUrl: costume.url || characterAvatar || null,
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

    const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
        const isAI = item.role === "model";
        const isUser = item.role === "user";
        const hasText = item.text.trim().length > 0;
        const isLocked = item.mediaTier === "pro" && !isPro;

        return (
            <View style={{ marginBottom: 12, maxWidth: "85%", alignSelf: isUser ? "flex-end" : "flex-start" }}>
                {item.mediaUrl && (
                    <Pressable
                        onPress={() => isLocked && setSubscriptionOpen(true)}
                        style={[styles.mediaContainer, { marginBottom: hasText ? 6 : 0 }]}
                    >
                        {item.mediaType === "video" ? (
                            <Video
                                source={{ uri: item.mediaUrl }}
                                style={styles.messageMedia}
                                resizeMode={ResizeMode.COVER}
                                isMuted
                                shouldPlay={!isLocked}
                                isLooping
                            />
                        ) : (
                            <Image
                                source={{ uri: item.mediaUrl }}
                                style={styles.messageMedia}
                                contentFit="cover"
                            />
                        )}

                        {isLocked && (
                            <View style={styles.lockedMediaOverlay}>
                                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                                <View style={styles.lockBadge}>
                                    <IconLock size={24} color="#fff" />
                                </View>
                                <Text style={styles.lockText}>PRO ONLY</Text>
                            </View>
                        )}
                    </Pressable>
                )}
                {hasText && (
                    isLiquidGlassSupported ? (
                        <LiquidGlassView
                            style={[
                                styles.messageBubble,
                                isUser ? styles.userBubbleLiquid : styles.aiBubbleLiquid,
                                { marginBottom: 0 }
                            ]}
                            effect="regular"
                            tintColor={isUser ? 'rgba(155, 89, 255, 0.5)' : 'rgba(15, 5, 30, 0.4)'}
                        >
                            {isAI && <Text style={styles.aiName}>{characterName}</Text>}
                            <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>{item.text}</Text>
                        </LiquidGlassView>
                    ) : (
                        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble, { marginBottom: 0 }]}>
                            {isAI && <Text style={styles.aiName}>{characterName}</Text>}
                            <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>{item.text}</Text>
                        </View>
                    )
                )}
            </View>
        );
    }, [characterName, isPro]);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* VRM Viewer (PRO) or Static Image (non-PRO) */}
            {is3DMode ? (
                <View style={styles.vrmFull}>
                    <VRMViewer
                        ref={vrmRef}
                        onReady={() => {
                            setVrmReady(true);
                            vrmRef.current?.setControlsEnabled(true);
                            if (isCameraMode || isVoiceMode) {
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
                    {characterAvatar && (
                        <Image
                            source={{ uri: characterAvatar }}
                            style={styles.staticCharacter}
                            contentFit="contain"
                            contentPosition="bottom center"
                        />
                    )}
                </View>
            )}

            {/* Blurred Overlay for Sensitive Content (become_nude action) */}
            {isNudeBlurred && (
                <BlurView intensity={100} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
                    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
                        <View style={{ backgroundColor: 'rgba(139, 92, 246, 0.2)', padding: 20, borderRadius: 100, marginBottom: 20 }}>
                            <IconLock size={40} color="#8b5cf6" />
                        </View>
                        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 12 }}>
                            Sensitive Activity
                        </Text>
                        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, textAlign: "center", lineHeight: 22, marginBottom: 30 }}>
                            You reached a special interaction! Become a PRO user to unlock exclusive 3D content and see this character's true self.
                        </Text>
                        <Pressable 
                            style={{ backgroundColor: "#8b5cf6", paddingHorizontal: 30, paddingVertical: 14, borderRadius: 30 }}
                            onPress={() => setSubscriptionOpen(true)}
                        >
                            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Unlock with PRO</Text>
                        </Pressable>
                        <Pressable 
                            style={{ marginTop: 20, padding: 10 }}
                            onPress={() => {
                                setIsNudeBlurred(false);
                                setIs3DMode(false);
                                // Revert to base model so they don't stay nude if they turn 3D back on
                                if (baseModelUrl) {
                                    setCharacterModelUrl(baseModelUrl);
                                    vrmRef.current?.loadModelByURL(baseModelUrl);
                                }
                            }}
                        >
                            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Dismiss</Text>
                        </Pressable>
                    </View>
                </BlurView>
            )}

            {/* User Front Camera floating pip for Video Call */}
            {isCameraMode && (
                <View style={styles.pipCameraContainer}>
                    <CameraView style={styles.pipCamera} facing="front" />
                </View>
            )}

            {/* Visual Overlay when connecting (Setup Call Screen) */}
            {voiceState.status === "connecting" && (
                <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 999, justifyContent: 'center', alignItems: 'center' }]}>
                    {/* Avatar + pulsing rings container */}
                    <View style={{ alignItems: 'center', justifyContent: 'center', width: 220, height: 220 }}>
                        {/* Pulsing rings – centered behind avatar */}
                        <Animated.View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255, 255, 255, 0.05)', transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.9, 1.4] }) }], opacity: pulseAnim }} />
                        <Animated.View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255, 255, 255, 0.1)', transform: [{ scale: pulseAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.2] }) }], opacity: pulseAnim }} />

                        {characterThumbnail && (
                            <Image source={{ uri: characterThumbnail }} style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: '#fff' }} contentFit="cover" />
                        )}
                    </View>

                    <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 30 }}>{characterName}</Text>
                    <Animated.Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', opacity: pulseAnim, marginTop: 10 }}>Calling...</Animated.Text>

                    {/* End Call Button */}
                    <Pressable
                        style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 100, elevation: 5, shadowColor: '#EF4444', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } }}
                        onPress={endCall}
                    >
                        <IconPhone size={32} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
                    </Pressable>
                </BlurView>
            )}

            {/* Top bar */}
            <View style={styles.topBar}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {!isPro && (
                        <Pressable
                            style={styles.upgradeProInner}
                            onPress={() => setSubscriptionOpen(true)}
                            hitSlop={8}
                        >
                            <Image source={diamondIcon} style={styles.upgradeProIcon} contentFit="contain" />
                        </Pressable>
                    )}
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
                            ● Online {remainingQuotaSeconds > 0 ? `| 📞 ${formatTime(remainingQuotaSeconds)}` : ''}
                        </Text>
                    </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {/* The setting button has been moved to ActionsBubble */}
                </View>
            </View>

            <View style={styles.leftFloatingContainer}>
                <Button
                    variant="liquid"
                    tintColor={is3DMode && isPro ? '#8B5CF6' : 'rgba(255, 255, 255, 0.2)'}
                    textColor="#FFFFFF"
                    onPress={() => {
                        if (!isPro) {
                            setSubscriptionOpen(true);
                        } else {
                            setVrmReady(false);
                            setIs3DMode(prev => !prev);
                        }
                    }}
                    style={styles.impressive3DBtn}
                >
                    3D MODE
                </Button>
                {!isPro && (
                    <View style={styles.proBadgeLeft}>
                        <Text style={styles.proBadgeLeftText}>PRO</Text>
                    </View>
                )}
            </View>

            {/* ─── Top right bubble actions ─── */}
            {!isKeyboardVisible && (
                <ActionsBubble
                    conversationStatus={voiceState.isConnected ? "connected" : voiceState.status}
                    agentElevenlabsId={agentElevenlabsId}
                    isPro={isPro}
                    is3DMode={is3DMode}
                    isDancing={isDancing}
                    isCameraMode={isCameraMode}
                    onOpenCharacter={() => setCharSheetOpen(true)}
                    onOpenCostume={() => setCostumeSheetOpen(true)}
                    onOpenScene={() => setBgSheetOpen(true)}
                    onOpenGallery={() => setMediaSheetOpen(true)}
                    onOpenSettings={() => setSettingsSheetOpen(true)}
                    onToggleDance={() => {
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
                    onToggle3D={() => {}} // Now handled independently on the left
                    onToggleCall={handleToggleVoiceMode}
                    onToggleCamera={handleToggleCameraMode}
                    onOpenSubscription={() => setSubscriptionOpen(true)}
                />
            )}


            {/* ─── Keyboard Dismiss Overlay ─── */}
            {isKeyboardVisible && (
                <Pressable
                    style={[StyleSheet.absoluteFill, { zIndex: 15 }]}
                    onPress={Keyboard.dismiss}
                    accessible={false}
                />
            )}

            {/* ─── Chat overlay ─── */}
            <View
                style={styles.chatOverlay}
                pointerEvents="box-none"
            >
                <View style={[styles.chatContainer, { paddingBottom: keyboardPadding }]} pointerEvents="box-none">

                    <View style={styles.chatMessagesWrapper} pointerEvents="box-none">
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={renderMessage}
                            keyExtractor={(item) => item.id}
                            style={styles.messageList}
                            contentContainerStyle={styles.messageListContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                            ListEmptyComponent={
                                <View style={styles.emptyChat}><Text style={styles.emptyChatEmoji}>💬</Text><Text style={styles.emptyChatText}>Say hello to {characterName}!</Text></View>
                            }
                            ListFooterComponent={
                                isSending ? (
                                    isLiquidGlassSupported ? (
                                        <LiquidGlassView
                                            style={[styles.messageBubble, styles.aiBubbleLiquid]}
                                            effect="regular"
                                            tintColor="rgba(15, 5, 30, 0.4)"
                                        >
                                            <Text style={styles.aiName}>{characterName}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingTop: 4 }}>
                                                {[dot1Anim, dot2Anim, dot3Anim].map((anim, i) => (
                                                    <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 2, transform: [{ translateY: anim }] }} />
                                                ))}
                                            </View>
                                        </LiquidGlassView>
                                    ) : (
                                        <View style={[styles.messageBubble, styles.aiBubble]}>
                                            <Text style={styles.aiName}>{characterName}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingTop: 4 }}>
                                                {[dot1Anim, dot2Anim, dot3Anim].map((anim, i) => (
                                                    <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 2, transform: [{ translateY: anim }] }} />
                                                ))}
                                            </View>
                                        </View>
                                    )
                                ) : null
                            }
                        />
                    </View>

                    <View style={styles.inputBar}>
                        {isLiquidGlassSupported ? (
                            <LiquidGlassView 
                                style={styles.liquidInputWrapper} 
                                effect="regular" 
                                interactive
                                tintColor="rgba(255, 255, 255, 0.1)"
                            >
                                <TextInput
                                    style={styles.textInputLiquid}
                                    placeholder={`Message ${characterName}...`}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={inputText}
                                    onChangeText={setInputText}
                                    multiline
                                    maxLength={500}
                                    returnKeyType="default"
                                    blurOnSubmit={false}
                                />
                            </LiquidGlassView>
                        ) : (
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
                        )}
                        <Button
                            variant="liquid"
                            isIconOnly
                            startIcon={IconSend}
                            startIconSize={20}
                            startIconColor="#FFFFFF"
                            tintColor="rgba(155, 89, 255, 0.8)"
                            onPress={handleSend}
                            disabled={!inputText.trim() || isSending}
                            style={styles.sendBtnLiquid}
                        />
                    </View>
                </View>

                <VoiceLoadingOverlay
                    visible={voiceState.isBooting || voiceState.status === "connecting"}
                    characterName={characterName}
                    characterAvatar={characterThumbnail ?? undefined}
                />
            </View>

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
                    refreshStatus();
                }}
                currentModelUrl={characterModelUrl}
                currentBackgroundUrl={backgroundUrl}
                currentCharacterId={characterId}
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
        left: 20,
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
    upgradeProInner: {
        width: 38,
        height: 38,
        justifyContent: "center",
        alignItems: "center",
    },
    upgradeProIcon: {
        width: 34,
        height: 34,
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
    proBadgeLeft: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#F59E0B',
        borderRadius: 6,
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    proBadgeLeftText: {
        fontSize: 7,
        fontWeight: "900",
        color: "#fff",
    },

    // 3D toggle PRO badge (legacy)
    proBadgeMini: {
        position: "absolute", top: -4, right: -4,
        backgroundColor: "#F59E0B", borderRadius: 6,
        paddingHorizontal: 4, paddingVertical: 1,
    },
    proBadgeMiniText: {
        fontSize: 7, fontWeight: "900", color: "#fff",
    },


    // Chat overlay
    chatOverlay: {
        position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 20,
    },
    chatContainer: {
        flex: 1, backgroundColor: "transparent",
        overflow: "hidden",
        justifyContent: "flex-end", // Push everything to bottom
    },
    chatMessagesWrapper: {
        width: "70%",
        maxHeight: height * 0.3,
        alignSelf: "flex-start", // align left
    },


    // Messages
    messageList: { flexGrow: 1 },
    messageListContent: { padding: 16, paddingBottom: 8 },
    messageBubble: { maxWidth: "80%", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, marginBottom: 8 },
    userBubble: { alignSelf: "flex-end", backgroundColor: "#9B59FF", borderBottomRightRadius: 6 },
    aiBubble: { alignSelf: "flex-start", backgroundColor: "rgba(15, 5, 30, 0.75)", borderWidth: 1, borderColor: "rgba(155, 89, 255, 0.2)", borderBottomLeftRadius: 6 },
    userBubbleLiquid: {
        alignSelf: "flex-end",
        borderBottomRightRadius: 6,
        backgroundColor: Platform.OS === 'android' ? 'rgba(155, 89, 255, 0.2)' : 'transparent',
    },
    aiBubbleLiquid: {
        alignSelf: "flex-start",
        borderBottomLeftRadius: 6,
        backgroundColor: Platform.OS === 'android' ? 'rgba(15, 5, 30, 0.3)' : 'transparent',
    },
    aiName: { fontSize: 11, fontWeight: "600", color: "rgba(155, 89, 255, 0.8)", marginBottom: 3 },
    messageText: {
        fontSize: 16, lineHeight: 22,
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
        backgroundColor: "rgba(139, 92, 246, 0.6)",
        alignItems: "center", justifyContent: "center",
        marginBottom: 8,
    },
    lockText: {
        fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1,
    },
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
    liquidInputWrapper: {
        flex: 1,
        borderRadius: 22,
        overflow: 'hidden',
        minHeight: 44,
        maxHeight: 120,
        backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        justifyContent: 'center',
    },
    textInputLiquid: {
        flex: 1,
        paddingHorizontal: 18,
        paddingVertical: Platform.OS === 'ios' ? 12 : 10,
        fontSize: 15,
        color: "#FFFFFF",
        textAlignVertical: 'center',
    },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#9B59FF", justifyContent: "center", alignItems: "center" },
    sendBtnLiquid: { width: 44, height: 44, borderRadius: 22 },
    sendBtnDisabled: { backgroundColor: "rgba(155, 89, 255, 0.3)" },
});
