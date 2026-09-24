import { useTranslation } from "react-i18next";
import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
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
    Pressable, ToastAndroid,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LiquidGlassView, isLiquidGlassSupported } from "@callstack/liquid-glass";

import { IconSend, IconMessageCircle, IconX, IconMusic, IconUser, IconHanger, IconPhoto, IconSettings, IconCrown, IconPhotoFilled, IconCube, IconPhoneCall, IconVideo, IconPhone, IconBadge3d } from "@tabler/icons-react-native";

import { CameraView } from "expo-camera";
import { Video, ResizeMode } from "expo-av";
import { useAuth } from "../hooks/useAuth";
import { useAppVoiceCall } from "../hooks/useAppVoiceCall";
import { VoiceLoadingOverlay } from "../components/common/VoiceLoadingOverlay";
import Button from "../components/common/Button";
import VRMViewer, { VRMViewerHandle } from "../components/VRMViewer";
import { chatService, ChatMessage, SuggestedAction } from "../services/chatService";
import { supabase } from "../config/supabase";
import { refreshRuby, setRuby as setRubyBalance, useRuby } from "../services/rubyStore";
import { claimProWeekly } from "../services/economyService";
import { track } from "../services/trackEvents";
import { getBondState, trackBond } from "../services/bondService";
import { getCheckinState } from "../services/checkinService";
import { loadQuality, subscribeQuality } from "../services/renderQuality";
import { useDance } from "./play/useDance";
import ActionsBubble from "../components/ActionsBubble";
import { useSubscription } from "../contexts/SubscriptionContext";
import { analyticsService } from "../services/AnalyticsService";
import { useAndroidBack } from "../hooks/useAndroidBack";
import { surfaceOn } from "../theme/surface";
import { styles } from "./play/styles";
import { MessageBubble } from "./play/MessageBubble";
import { SensitiveOverlay } from "./play/SensitiveOverlay";
import { PlaySheets } from "./play/PlaySheets";
import { executeSceneAction } from "./play/sceneActions";
import { SceneLayer } from "./play/SceneLayer";
import type { CachedCharacter } from "./play/cache";
import { loadCharacterForUser } from "./play/loadCharacter";
import { selectCharacter } from "./play/selectCharacter";
import { selectCostume } from "./play/selectCostume";
import { ChatOverlay } from "./play/ChatOverlay";
import { ACCENT, ACCENT_SOFT, ACCENT_GLOW, GOLD, GLASS_FILL, GLASS_BORDER, TEXT_BRIGHT } from "./play/theme";
import { CharacterSwitcher } from "../components/CharacterSwitcher";
import { ReportDialog } from "../components/sheets/ReportDialog";
import { isReported, loadMyReports } from "../services/reportService";
import { chatInlinePhotoEnabled, chatV2Enabled } from "../services/remoteConfig";
import { lockStateOf, useItemUnlock, type UnlockableItem } from "../hooks/useItemUnlock";
import { AdGateDialog } from "../components/AdGateDialog";
import { autoUnlock, consumeNoFillGrant, loadUnlocks, markUnlocked, requiresAd } from "../services/unlockService";
import { getCharacters } from "../cache/charactersCache";
import { AdBanner } from "../components/ads/AdBanner";
import { useInterstitialAd } from "../hooks/useInterstitialAd";
import { useRewardedAd } from "../hooks/useRewardedAd";
import { usePrefetchPaywallModel } from "../hooks/usePrefetchPaywallModel";
import { AdUnits } from "../config/ads";
import { AdsManager } from "../services/AdsManager";
import { get3dTrial, start3dTrial } from "../services/trial3d";
import { Trial3dDialog } from "../components/sheets/Trial3dDialog";
import { FREE_MESSAGE_LIMIT, REWARD_MESSAGE_BONUS } from "../config/limits";
import { Alert } from "react-native";

import * as SecureStore from "expo-secure-store";
import RubyIcon from "../components/icons/RubyIcon";
import LockIcon from "../components/icons/LockIcon";

const { width, height } = Dimensions.get("window");

const CACHE_KEY = "play_last_character";



export default function PlayScreen() {
    const { t } = useTranslation();
    const { user, setIsOnboarded } = useAuth();
    const vrmRef = useRef<VRMViewerHandle>(null);
    const flatListRef = useRef<FlatList>(null);

    // Sheet open states (sheets manage their own refs internally)
    const [charSheetOpen, setCharSheetOpen] = useState(false);
    const [costumeSheetOpen, setCostumeSheetOpen] = useState(false);
    const [bgSheetOpen, setBgSheetOpen] = useState(false);
    const isCacheRestored = useRef(false);
    const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
    const [subscriptionOpen, setSubscriptionOpen] = useState(false);
    const [mediaSheetOpen, setMediaSheetOpen] = useState(false);
    const [checkinOpen, setCheckinOpen] = useState(false);
    const [questOpen, setQuestOpen] = useState(false);
    const [bondOpen, setBondOpen] = useState(false);
    /**
     * Reporting what she said. Long-pressing a message opens the dialog;
     * once filed, the message is replaced by a notice for this user.
     */
    const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
    const [reportsLoadedAt, setReportsLoadedAt] = useState(0);
    /** Bumped when a photo is unlocked, so the bubbles redraw. */
    const [mediaUnlockedAt, setMediaUnlockedAt] = useState(0);
    /** Chat hidden = the scene with nothing over it. */
    const [chatVisible, setChatVisible] = useState(true);
    /** Check-in streak for the flame button; refreshed when the sheet closes. */
    const [streak, setStreak] = useState(0);
    const [needsCheckin, setNeedsCheckin] = useState(false);
    /** Bumped on every claim so the flame badge re-reads immediately. */
    const [checkinTick, setCheckinTick] = useState(0);
    /** Her level, for the pill in the top bar. Server-owned; this is a mirror. */
    const [bondLevel, setBondLevel] = useState<number | null>(null);
    /** 0..1 through the current level, for the bar on her card. */
    const [bondProgress, setBondProgress] = useState<number | null>(null);
    /** Her quests have something finished and waiting — a dot on her card. */
    const [bondClaimable, setBondClaimable] = useState(false);
    const ruby = useRuby() ?? 0;

    const { isPro, refreshStatus } = useSubscription();
    const { showInterstitial } = useInterstitialAd();
    const { show: showRewardedForMessages } = useRewardedAd(AdUnits.rewarded, "unlock_messages");
    const { showForGate: showSwitchAd } = useRewardedAd(AdUnits.rewarded, "switch_character");

    // Character state
    const [characterId, setCharacterId] = useState<string | null>(null);
    usePrefetchPaywallModel(characterId, isPro);
    const [characterName, setCharacterName] = useState(t("play.companion"));
    const [characterModelUrl, setCharacterModelUrl] = useState<string | null>(null);
    const [baseModelUrl, setBaseModelUrl] = useState<string | null>(null);
    const [characterThumbnail, setCharacterThumbnail] = useState<string | null>(null);
    const [characterThumbnailSmall, setCharacterThumbnailSmall] = useState<string | null>(null);
    const [characterAvatar, setCharacterAvatar] = useState<string | null>(null);
    /** The same art with the scenery cut out — only the 2D layer wants it. */
    const [characterAvatarNoBg, setCharacterAvatarNoBg] = useState<string | null>(null);

    /**
     * Three free minutes of 3D, once per account.
     *
     * The seconds come from the server on every read, so the countdown cannot
     * be extended by closing the app or moving the device clock; the ticker
     * below only spends what the server already granted.
     */
    const [trialRemaining, setTrialRemaining] = useState(0);
    const [trialMinutes, setTrialMinutes] = useState(3);
    const [trialOffer, setTrialOffer] = useState(false);
    const trialAskedRef = useRef(false);
    const [characterAvatarSmall, setCharacterAvatarSmall] = useState<string | null>(null);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [backgroundId, setBackgroundId] = useState<string | null>(null);
    const [backgroundName, setBackgroundName] = useState<string | null>(null);
    const [costumeName, setCostumeName] = useState<string | null>(null);
    const [isBackgroundDark, setIsBackgroundDark] = useState(true); // default dark
    const [vrmReady, setVrmReady] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false); // Only PRO can enable
    const dance = useDance({ vrmRef, is3DMode, setIs3DMode, characterId });
    const [agentElevenlabsId, setAgentElevenlabsId] = useState<string | null>(null);

    const [userProfile, setUserProfile] = useState<{ display_name?: string; country?: string } | null>(null);
    const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
    const [isNudeBlurred, setIsNudeBlurred] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState("");
    const [isSending, setIsSending] = useState(false);

    // Free-tier message quota (PRO is unlimited). `bonusMsgs` grows when a free
    // user watches a rewarded ad.
    const [freeMsgUsed, setFreeMsgUsed] = useState(0);
    const [bonusMsgs, setBonusMsgs] = useState(0);

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

    // Keep the ruby balance fresh (refetch when buy/check-in sheets toggle).
    useEffect(() => {
        if (user?.id) refreshRuby();
    }, [user?.id, checkinOpen, bgSheetOpen, costumeSheetOpen, charSheetOpen]);

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
        userName: userProfile?.display_name || user?.user_metadata?.full_name || undefined,
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

                    // Bond XP and the voice quests, by whole minutes talked.
                    // Without this the "call her for three minutes" quest could
                    // never complete, because nothing else reports voice time.
                    const wholeMinutes = Math.floor(durationSeconds / 60);
                    if (wholeMinutes > 0) {
                        void trackBond(characterId, isCameraMode ? "video_minute" : "voice_minute", wholeMinutes);
                    }

                    // Interstitial at the natural break after a real call ends.
                    // Skipped for PRO, frequency-capped, and skipped if not
                    // preloaded (the hook falls through without making the user wait).
                    if (!isPro && durationSeconds >= 15) {
                        showInterstitial();
                    }
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
        if (isVoiceMode && !is3DMode) enter3D();
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

    useEffect(() => {
        if (isNudeBlurred) {
            Keyboard.dismiss();
        }
        // Blur the 3D canvas from inside the page. A native blur view laid over
        // a WebView does not blur what the WebView draws — on Android it is a
        // separate surface — so the gate was translucent over live nudity.
        vrmRef.current?.setPreviewBlur(isNudeBlurred);
    }, [isNudeBlurred]);

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

    /** The device cache, read once; the DB loader awaits it (see loadCharacter). */
    const cacheRead = useRef<Promise<CachedCharacter | null> | null>(null);
    if (!cacheRead.current) {
        cacheRead.current = SecureStore.getItemAsync(CACHE_KEY)
            .then((raw) => (raw ? (JSON.parse(raw) as CachedCharacter) : null))
            .catch(() => null);
    }

    // Load cached character instantly on mount
    useEffect(() => {
        const loadCache = async () => {
            try {
                const cached = await cacheRead.current;
                if (cached) {
                    setCharacterId(cached.characterId);
                    setCharacterName(cached.characterName);
                    setCharacterModelUrl(cached.modelUrl);
                    setBackgroundUrl(cached.backgroundUrl);
                    setBackgroundId(cached.backgroundId);
                    if (cached.thumbnailUrl) setCharacterThumbnail(cached.thumbnailUrl);
                    if (cached.isBackgroundDark !== undefined) {
                        setIsBackgroundDark(cached.isBackgroundDark);
                    } else if (cached.backgroundId) {
                        // Cache written before this field existed. The restore
                        // path below skips the DB lookup whenever a cached
                        // background is present, so without this the flag would
                        // stay on its "dark" default forever — and most of the
                        // background library is light.
                        supabase
                            .from("backgrounds")
                            .select("is_dark")
                            .eq("id", cached.backgroundId)
                            .single()
                            .then(({ data }) => {
                                if (data) setIsBackgroundDark(data.is_dark ?? true);
                            });
                    }
                    if (cached.avatarUrl) setCharacterAvatar(cached.avatarUrl);
                    if (cached.agentElevenlabsId) setAgentElevenlabsId(cached.agentElevenlabsId);
                    isCacheRestored.current = true;
                }
            } catch { }
        };
        loadCache();
    }, []);

    // Load user's character from DB (refreshes cache) — see play/loadCharacter.
    useEffect(() => {
        loadCharacterForUser({
            userId: user?.id,
            isCacheRestored,
            saveCache,
            cached: cacheRead.current!,
            backgroundId,
            backgroundUrl,
            isBackgroundDark,
            setCharacterId,
            setCharacterName,
            setCharacterThumbnail,
            setCharacterAvatar,
            setCharacterAvatarNoBg,
            setCharacterModelUrl,
            setBaseModelUrl,
            setAgentElevenlabsId,
            setBackgroundId,
            setBackgroundUrl,
            setIsBackgroundDark,
        });
    }, [user?.id, saveCache]);

    // When VRM is ready AND we have model URL → load the model
    useEffect(() => {
        if (vrmReady && characterModelUrl) {
            vrmRef.current?.loadModelByURL(characterModelUrl, characterName);
        }
    }, [vrmReady, characterModelUrl, characterName]);

    /**
     * The one way into 3D.
     *
     * Every caller used to do `setVrmReady(false); setIs3DMode(true)`, meaning
     * "drop the model and load it again". It does not do that. The viewer is
     * mounted for the whole session — 2D only hides it at opacity 0 — so
     * `onReady` fires once, early, and nothing ever fires it again. Setting
     * `vrmReady` false was a latch: the effect above stopped running, the
     * model was never loaded, and 3D opened onto an empty scene until the app
     * was killed and relaunched. That is exactly what the free-3D trial did to
     * everyone who accepted it.
     *
     * `vrmReady` now means only what it says — the canvas exists — and is set
     * by `onReady` alone. Entering 3D asks for the model directly.
     */
    const enter3D = useCallback(() => {
        setIs3DMode(true);
        if (vrmReady && characterModelUrl) {
            vrmRef.current?.loadModelByURL(characterModelUrl, characterName);
        }
    }, [vrmReady, characterModelUrl, characterName]);

    // When VRM is ready AND we have background → set it
    // Apply the saved render quality as soon as the scene exists, and again
    // whenever it changes in Settings.
    useEffect(() => {
        if (!vrmReady) return;
        loadQuality().then((q) => vrmRef.current?.setRenderQuality(q));
        return subscribeQuality((q) => vrmRef.current?.setRenderQuality(q));
    }, [vrmReady]);

    /**
     * Free camera is the level-5 reward, and PRO on top of it — both gates, as
     * `bond_capabilities.free_camera` defines them. Below that the camera stays
     * where the scene puts it.
     */
    useEffect(() => {
        if (!vrmReady) return;
        vrmRef.current?.setControlsEnabled((bondLevel ?? 1) >= 5 && isPro);
    }, [vrmReady, bondLevel, isPro]);

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
                const defaultMsgText = pickGreeting();

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

    // Auto-scroll to end when messages change
    useEffect(() => {
        if (messages.length > 0) {
            // Small delay to ensure FlatList has calculated its new size
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

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
    /** Bridge from a model-suggested action to the scene — see play/sceneActions. */
    const executeAction = useCallback(
        (action: SuggestedAction) =>
            executeSceneAction(action, {
                vrmRef,
                isPro,
                is3DMode,
                characterId,
                characterModelUrl,
                userId: user?.id,
                setMessages,
                setCharSheetOpen,
                setCostumeSheetOpen,
                setBgSheetOpen,
                setMediaSheetOpen,
                setSubscriptionOpen,
                setIs3DMode,
                setVrmReady,
                enter3D,
                inlinePhotoOwnsMedia: chatV2Enabled() && chatInlinePhotoEnabled(),
                setIsNudeBlurred,
                setBaseModelUrl,
                setCharacterModelUrl,
            }),
        [isPro, characterId, user?.id, is3DMode, characterModelUrl, enter3D]
    );

    // ─── Send message ───
    // Free user hit the message quota: offer a rewarded ad (clearly labelled)
    // or the PRO upgrade. Bonus messages are only granted if the reward is earned.
    const requestMoreMessages = useCallback(() => {
        Alert.alert(
            "Hết lượt nhắn miễn phí",
            `Xem một quảng cáo để được thêm ${REWARD_MESSAGE_BONUS} tin nhắn, hoặc nâng cấp PRO để nhắn không giới hạn.`,
            [
                { text: "Để sau", style: "cancel" },
                { text: "Nâng cấp PRO", onPress: () => setSubscriptionOpen(true) },
                {
                    text: `Xem quảng cáo (+${REWARD_MESSAGE_BONUS})`,
                    onPress: async () => {
                        const earned = await showRewardedForMessages();
                        if (earned) setBonusMsgs((n) => n + REWARD_MESSAGE_BONUS);
                    },
                },
            ]
        );
    }, [showRewardedForMessages]);

    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text || isSending || !characterId || !user?.id) return;

        // Enforce the free-tier message quota.
        if (!isPro && freeMsgUsed >= FREE_MESSAGE_LIMIT + bonusMsgs) {
            requestMoreMessages();
            return;
        }

        setInputText("");
        track.homeChatSend();
        // Bond XP for talking to her. Fire-and-forget: the server caps it, and
        // a lost call costs a few XP rather than blocking the send.
        void trackBond(characterId, "chat_message", 1);
        const userMsg: ChatMessage = { id: `temp-${Date.now()}`, role: "user", text, createdAt: new Date() };
        setMessages((prev) => [...prev, userMsg]);
        if (!isPro) setFreeMsgUsed((n) => n + 1);
        setIsSending(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

        try {
            // Fire action detection in background. Her tag vocabulary goes with
            // the message so "gửi ảnh đi biển" can pick the beach photo instead
            // of any photo at all.
            chatService.getMediaTags(characterId)
                .then((tags) => chatService.suggestAction(text, tags))
                .then(action => {
                    executeAction(action);
                }).catch(() => { });

            const aiMsgBaseId = `ai-${Date.now()}`;

            // Call the edge function (returns pre-split messages)
            const registrationDate = userCreatedAt || user?.created_at;
            const daysUsed = registrationDate ? Math.floor((Date.now() - new Date(registrationDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;

            const result = await chatService.sendMessage(text, characterId, user.id, [...messages, userMsg], isPro, {
                userName: userProfile?.display_name,
                country: userProfile?.country,
                daysUsed,
                location: backgroundName || undefined,
                costume: costumeName || undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
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

            // A photo she chose to send with this reply. `gemini-chat-v2` has
            // already written it to `conversation`, so it survives a reload —
            // this only puts it on screen now, after her words, the way it
            // arrives in a real conversation.
            if (result.image?.url) {
                await new Promise((r) => setTimeout(r, 450));
                setMessages((prev) => [...prev, {
                    id: `ai-media-${result.image!.media_id}-${Date.now()}`,
                    role: "model" as const,
                    text: "",
                    createdAt: new Date(),
                    mediaUrl: result.image!.url,
                    mediaType: "image" as const,
                    mediaTier: result.image!.tier ?? undefined,
                    mediaId: result.image!.media_id,
                    mediaPriceRuby: result.image!.price_ruby ?? null,
                    mediaUnlockLevel: result.image!.unlock_relationship_level ?? null,
                    mediaUnlockType: result.image!.unlock_type ?? null,
                }]);
            }

            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (error) {
            console.error("[PlayScreen] Chat error:", error);
            const errMsg: ChatMessage = { id: `err-${Date.now()}`, role: "model", text: t("play.error_reply"), createdAt: new Date() };
            setMessages((prev) => [...prev, errMsg]);
            setIsSending(false);
        }
    }, [inputText, isSending, characterId, user?.id, messages, executeAction, isPro, freeMsgUsed, bonusMsgs, requestMoreMessages]);

    // ─── Sheet handlers ───
    const handleCharacterSelect = useCallback(
        (char: any) =>
            selectCharacter(char, {
                userId: user?.id,
                is3DMode,
                vrmRef,
                saveCache,
                backgroundUrl,
                backgroundId,
                agentElevenlabsId,
                isBackgroundDark,
                setCharacterId,
                setCharacterName,
                setCharacterThumbnail,
                setCharacterThumbnailSmall,
                setCharacterAvatar,
                setCharacterAvatarNoBg,
                setCharacterAvatarSmall,
                setCharacterModelUrl,
                setBaseModelUrl,
                setAgentElevenlabsId,
                setBackgroundId,
                setBackgroundUrl,
                setBackgroundName,
                setIsBackgroundDark,
                setIsNudeBlurred,
                setIs3DMode,
                setMessages,
            }),
        [user?.id, backgroundUrl, backgroundId, saveCache, is3DMode, agentElevenlabsId, isBackgroundDark]
    );

    /**
     * Back closes whatever is on top instead of leaving the app. With nothing
     * open we ask for a second press: this is the root screen, so the default
     * action really is "quit", and users kept losing the app to a stray swipe.
     */
    /** Palette for everything floating over the scene — see theme/surface. */
    // In 2D the costume illustration covers the whole screen, so the scene's
    // `is_dark` describes an image nobody can see. Those illustrations are
    // rich, mid-to-dark artwork: the dark glass is the one that reads on them.
    const surface = surfaceOn(!is3DMode && characterAvatar ? true : isBackgroundDark);

    /** Banner sits under the composer; PRO and the open keyboard both hide it. */
    /**
     * The banner gives its space back when the retries are spent; the chat
     * block reserves that space, so it has to hear about it too — otherwise a
     * no-fill leaves a 60pt hole above the composer for the rest of the
     * session.
     */
    const [bannerGaveUp, setBannerGaveUp] = useState(false);
    const showPlayBanner = !isPro && !isKeyboardVisible && !bannerGaveUp;

    // Offer the trial the first time a free user reaches the play screen, and
    // resume it if the app was closed mid-trial.
    useEffect(() => {
        if (isPro || !user?.id || trialAskedRef.current) return;
        trialAskedRef.current = true;
        (async () => {
            const t = await get3dTrial();
            if (!t) return;
            setTrialMinutes(t.minutes);
            if (!t.claimed) {
                setTrialOffer(true);
            } else if (t.remaining > 0) {
                setTrialRemaining(t.remaining);
                enter3D();
            }
        })();
    }, [isPro, user?.id]);

    // One tick a second while it runs; at zero the scene goes back to 2D and
    // the paywall gets the moment they have just seen what it sells.
    useEffect(() => {
        if (trialRemaining <= 0) return;
        const id = setInterval(() => {
            setTrialRemaining((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    setIs3DMode(false);
                    setTimeout(() => setSubscriptionOpen(true), 400);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [trialRemaining > 0]);

    /**
     * Stop rendering the scene while something is covering it.
     *
     * The viewer stays mounted at opacity 0 in 2D mode and behind every sheet,
     * and `requestAnimationFrame` does not care about either — so the phone was
     * drawing a VRM nobody could see, at full rate, right up to the instant a
     * dance FBX needed the main thread to retarget every track. That is where
     * the hitch when applying a dance came from.
     */
    const sceneCovered =
        charSheetOpen || costumeSheetOpen || bgSheetOpen || mediaSheetOpen ||
        settingsSheetOpen || questOpen || bondOpen || checkinOpen ||
        dance.danceSheetOpen || !is3DMode;

    useEffect(() => {
        if (!vrmReady) return;
        // The subscription sheet drives this itself — it has its own preview.
        if (subscriptionOpen) return;
        vrmRef.current?.setRenderPaused(sceneCovered);
    }, [sceneCovered, vrmReady, subscriptionOpen]);

    useEffect(() => {
        AdsManager.setRenderPauser((paused: boolean) => vrmRef.current?.setRenderPaused(paused));
        return () => AdsManager.setRenderPauser(null);
    }, []);

    /**
     * One of her opening lines. Two of the five used to be hardcoded English,
     * so a non-English user got English 40% of the time; all five are
     * translated now.
     */
    const pickGreeting = useCallback(() => {
        const all = [
            t("play.greeting1"),
            t("play.greeting2"),
            t("play.greeting3"),
            t("play.greeting4"),
            t("play.greeting5"),
        ];
        return all[Math.floor(Math.random() * all.length)];
    }, [t]);

    /**
     * Shown when the chat is genuinely empty — no signed-in user, or history
     * still loading. Rendered as one of her messages rather than an empty-state
     * card, so the screen opens mid-conversation instead of announcing that
     * nothing has happened. Held in a ref so it does not reshuffle on
     * every render.
     */
    const localGreetingRef = useRef<string | null>(null);
    if (localGreetingRef.current === null) localGreetingRef.current = pickGreeting();

    const displayMessages = useMemo<ChatMessage[]>(() => {
        if (messages.length > 0) return messages;
        return [{
            id: "local-greeting",
            role: "model",
            text: localGreetingRef.current ?? "",
            createdAt: new Date(),
        }];
    }, [messages]);

    /** Character awaiting the user's answer in the ad-gate dialog. */
    const [switchGateFor, setSwitchGateFor] = useState<any | null>(null);

    useEffect(() => { loadUnlocks(user?.id); }, [user?.id]);

    /**
     * Whatever the app picked for the user on boot is theirs already — a fresh
     * install must not open with its own starting character behind an ad.
     */
    useEffect(() => {
        if (characterId) autoUnlock("character", characterId, user?.id);
    }, [characterId, user?.id]);
    useEffect(() => {
        if (backgroundId) autoUnlock("background", backgroundId, user?.id);
    }, [backgroundId, user?.id]);

    /** Roster for the top quick-switch carousel. */
    const [switcherChars, setSwitcherChars] = useState<any[]>([]);
    useEffect(() => {
        let alive = true;
        getCharacters()
            .then((cs) => { if (alive) setSwitcherChars(cs.filter((c: any) => c.available !== false)); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    /**
     * Quick switch runs the same rewarded gate as the character sheet. Leaving
     * it ungated would make the sheet's gate pointless — this is simply the
     * faster route to the same change.
     */
    const handleQuickSwitch = useCallback(
        (c: any) => {
            // One ad per character, ever — the quick switch must not re-charge
            // for someone the user already unlocked.
            if (!requiresAd("character", c.id, !!isPro)) return handleCharacterSelect(c);
            setSwitchGateFor(c);
        },
        [isPro, handleCharacterSelect]
    );

    useEffect(() => {
        track.homeView();
    }, []);

    const lastBackAt = useRef(0);
    useAndroidBack(
        useCallback(() => {
            if (subscriptionOpen) { setSubscriptionOpen(false); return true; }
            if (checkinOpen) { setCheckinOpen(false); return true; }
            if (bondOpen) { setBondOpen(false); return true; }
            if (questOpen) { setQuestOpen(false); return true; }
            if (dance.danceSheetOpen) { dance.setDanceSheetOpen(false); return true; }
            if (mediaSheetOpen) { setMediaSheetOpen(false); return true; }
            if (settingsSheetOpen) { setSettingsSheetOpen(false); return true; }
            if (costumeSheetOpen) { setCostumeSheetOpen(false); return true; }
            if (bgSheetOpen) { setBgSheetOpen(false); return true; }
            if (charSheetOpen) { setCharSheetOpen(false); return true; }

            const now = Date.now();
            if (now - lastBackAt.current < 2000) return false; // second press → exit
            lastBackAt.current = now;
            ToastAndroid.show(t("play.back_again"), ToastAndroid.SHORT);
            return true;
        }, [
            subscriptionOpen, checkinOpen, questOpen, bondOpen, dance.danceSheetOpen, mediaSheetOpen, settingsSheetOpen,
            costumeSheetOpen, bgSheetOpen, charSheetOpen, t,
        ])
    );

    const handleCostumeSelect = useCallback(
        (costume: any) =>
            selectCostume(costume, {
                userId: user?.id, vrmRef, saveCache,
                characterId, characterName, characterThumbnail, characterAvatar, characterModelUrl,
                backgroundUrl, backgroundId, agentElevenlabsId, isBackgroundDark,
                setCharacterModelUrl, setCharacterThumbnail, setCharacterAvatar,
                setCharacterAvatarSmall, setCostumeName, setBackgroundId, setIsNudeBlurred,
            }),
        [user?.id, characterId, characterName, characterModelUrl, characterThumbnail, backgroundUrl, backgroundId, agentElevenlabsId, saveCache]
    );

    const handleBackgroundSelect = useCallback((bg: any) => {
        analyticsService.logBackgroundChange(bg.id);
        setBackgroundId(bg.id);
        setBackgroundName(bg.name || null);
        setIsBackgroundDark(bg.is_dark ?? true);
        // Use video_url if available, otherwise fall back to image
        const bgSource = bg.video_url || bg.image;
        setBackgroundUrl(bgSource);
        vrmRef.current?.setBackgroundImage(bgSource);

        if (user?.id) {
            // Cache ownership
            supabase.from("user_assets")
                .insert({ user_id: user.id, item_id: bg.id, item_type: "background" })
                .then(() => { }, () => { });

            // Update cache
            saveCache({
                characterId: characterId || "",
                characterName: characterName || "",
                modelUrl: characterModelUrl || "",
                backgroundUrl: bgSource,
                backgroundId: bg.id,
                thumbnailUrl: characterThumbnail,
                avatarUrl: characterAvatar,
                agentElevenlabsId,
                isBackgroundDark: bg.is_dark ?? true,
            });
        }
    }, [user?.id, characterId, characterName, characterModelUrl, characterThumbnail, characterAvatar, agentElevenlabsId, saveCache]);

    useEffect(() => {
        let alive = true;
        getCheckinState().then((c) => {
            if (!alive || !c) return;
            setStreak(c.currentDay ?? 0);
            setNeedsCheckin(!c.claimedToday);
        });
        return () => { alive = false; };
    }, [checkinOpen, checkinTick]);

    useEffect(() => {
        if (!characterId) { setBondLevel(null); return; }
        let alive = true;
        getBondState(characterId).then((b) => {
            if (!alive) return;
            setBondLevel(b?.level ?? 1);
            setBondProgress(
                b && b.xpForNext ? Math.min(1, b.xpIntoLevel / Math.max(1, b.xpForNext)) : null
            );
            setBondClaimable(
                (b?.quests ?? []).some((q) => !q.claimed && q.progress >= q.target)
            );
        });
        return () => { alive = false; };
    }, [characterId, bondOpen]);

    // This week's PRO ruby. Fire-and-forget on every arrival: the server pays
    // once per ISO week, so calling it again costs one cheap round trip and
    // never a double grant. Only the balance changes — see `claimProWeekly`.
    useEffect(() => {
        if (!isPro || !user?.id) return;
        let alive = true;
        claimProWeekly().then((res) => {
            if (alive && res.ok && res.granted) setRubyBalance(res.ruby);
        });
        return () => { alive = false; };
    }, [isPro, user?.id]);

    // What this account has already flagged. Read from the server, not the
    // device, so a reinstall doesn't bring reported messages back. Fetched
    // once; the bump is only there to redraw the list when it lands.
    useEffect(() => {
        let alive = true;
        loadMyReports().then(() => { if (alive) setReportsLoadedAt(Date.now()); });
        return () => { alive = false; };
    }, []);

    /**
     * A photo she sent is the same asset as a photo in her gallery, so it gets
     * the same gate: bond level, then PRO, then ruby, then an ad. Before this
     * the bubble only ever knew "pro or not" and its tap went straight to the
     * paywall, which was wrong for every priced or ad-unlockable photo.
     */
    const mediaUnlock = useItemUnlock({
        isPro,
        userId: user?.id,
        bondLevel: bondLevel ?? 1,
        bondProgress,
        characterName,
        onOpenBond: () => setBondOpen(true),
        placement: "chat_photo",
        adBody: t("ads.gate_body_media"),
        onOpenPaywall: () => setSubscriptionOpen(true),
        onOpenQuests: () => setQuestOpen(true),
        kind: "gallery",
    });

    const mediaItemOf = useCallback(
        (m: ChatMessage): UnlockableItem => ({
            type: "media",
            id: m.mediaId ?? m.id,
            unlock: m.mediaUnlockType as any,
            tier: m.mediaTier,
            unlockAtLevel: m.mediaUnlockLevel,
            price: m.mediaPriceRuby,
            name: t(m.mediaType === "video" ? "media.one_video" : "media.one_photo"),
            image: m.mediaUrl,
        }),
        [t]
    );

    const renderMessage = useCallback(
        ({ item }: { item: ChatMessage }) => (
            <MessageBubble
                item={item}
                isPro={isPro}
                characterName={characterName}
                surface={surface}
                reported={reportedIds.has(item.id) || isReported(item.id)}
                onReport={setReportTarget}
                lock={item.mediaUrl ? lockStateOf(mediaItemOf(item), isPro, bondLevel ?? 1) : undefined}
                onLockedPress={() => {
                    if (!item.mediaUrl) return;
                    // Literally the same call the gallery tile makes.
                    mediaUnlock.request(mediaItemOf(item), () => {
                        setMediaUnlockedAt(Date.now());
                    });
                }}
            />
        ),
        [characterName, isPro, surface, reportedIds, reportsLoadedAt,
         bondLevel, mediaItemOf, mediaUnlock.request, mediaUnlockedAt]
    );


    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <SceneLayer
                is3DMode={is3DMode}
                setIs3DMode={setIs3DMode}
                onEnter3D={enter3D}
                setVrmReady={setVrmReady}
                vrmRef={vrmRef}
                backgroundUrl={backgroundUrl}
                blurScene={isNudeBlurred}
                characterAvatar={characterAvatar}
                characterAvatarNoBg={characterAvatarNoBg}
                trialRemaining={trialRemaining}
                characterThumbnail={characterThumbnail}
                characterName={characterName}
                onOpenBond={() => setBondOpen(true)}
                onOpenGem={() => (isPro ? setQuestOpen(true) : setSubscriptionOpen(true))}
                onOpenCheckin={() => setCheckinOpen(true)}
                streak={streak}
                needsCheckin={needsCheckin}
                bondLevel={bondLevel}
                bondProgress={bondProgress}
                bondClaimable={bondClaimable}
                characterId={characterId}
                isPro={isPro}
                isCameraMode={isCameraMode}
                isKeyboardVisible={isKeyboardVisible}
                isBackgroundDark={isBackgroundDark}
                surface={surface}
                pulseAnim={pulseAnim}
                voiceStatus={voiceState.status}
                endCall={endCall}
                switcherChars={switcherChars}
                onQuickSwitch={handleQuickSwitch}
                ruby={ruby}
                onOpenQuests={() => {
                    track.homeHeartsSelect(ruby);
                    setQuestOpen(true);
                }}
                setSubscriptionOpen={setSubscriptionOpen}
            />

            {/* ─── Top right bubble actions ─── */}
            {!isKeyboardVisible && (
                <ActionsBubble
                    onToggleChat={() => setChatVisible((v) => !v)}
                    chatVisible={chatVisible}
                    conversationStatus={voiceState.isConnected ? "connected" : voiceState.status}
                    agentElevenlabsId={agentElevenlabsId}
                    isPro={isPro}
                    is3DMode={is3DMode}
                    isBackgroundDark={isBackgroundDark}
                    isDancing={dance.isDancing}
                    isCameraMode={isCameraMode}
                    onOpenCharacter={() => {
                        track.homeCharacterSwitchSelect();
                        setCharSheetOpen(true);
                    }}
                    onOpenCostume={() => {
                        track.homeOutfitSelect();
                        setCostumeSheetOpen(true);
                    }}
                    onOpenScene={() => {
                        track.homeSceneSelect();
                        setBgSheetOpen(true);
                    }}
                    onOpenGallery={() => {
                        track.homeGallerySelect();
                        setMediaSheetOpen(true);
                    }}
                    onOpenSettings={() => {
                        track.homeSettingsSelect();
                        setSettingsSheetOpen(true);
                    }}
                    onOpenCheckin={() => setCheckinOpen(true)}
                    onOpenQuests={() => {
                        track.homeHeartsSelect(ruby);
                        setQuestOpen(true);
                    }}
                    onToggleDance={() => {
                        track.homeDanceSelect();
                        dance.toggleDance();
                    }}
                    onToggle3D={() => { }} // Now handled independently on the left
                    onToggleCall={() => {
                        track.homeVideoCallSelect();
                        handleToggleVoiceMode();
                    }}
                    onToggleCamera={handleToggleCameraMode}
                    onOpenSubscription={() => {
                        track.homePremiumSelect();
                        setSubscriptionOpen(true);
                    }}
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

                {chatVisible && <ChatOverlay
                    displayMessages={displayMessages}
                    renderMessage={renderMessage}
                    flatListRef={flatListRef}
                    inputText={inputText}
                    setInputText={setInputText}
                    handleSend={handleSend}
                    characterName={characterName}
                    keyboardPadding={keyboardPadding}
                    isBackgroundDark={isBackgroundDark}
                    surface={surface}
                    showPlayBanner={showPlayBanner}
                    isSending={isSending}
                    dot1Anim={dot1Anim}
                    dot2Anim={dot2Anim}
                    dot3Anim={dot3Anim}
                    agentElevenlabsId={agentElevenlabsId}
                    isInCall={voiceState.isConnected || voiceState.status === "connected"}
                    onToggleCall={() => {
                        track.homeVideoCallSelect();
                        handleToggleVoiceMode();
                    }}
                />}

                <Trial3dDialog
                visible={trialOffer}
                minutes={trialMinutes}
                onClose={() => setTrialOffer(false)}
                onStart={async () => {
                    setTrialOffer(false);
                    const t = await start3dTrial();
                    if (!t || t.remaining <= 0) return;
                    void analyticsService.logEvent("trial_3d_start", { minutes: trialMinutes });
                    enter3D();
                    setTrialRemaining(t.remaining);
                }}
            />

            {/* Banner: pinned to the bottom of the screen rather than to the
                bottom of the chat block, because hiding the chat used to hide
                the ad with it. Still gone for PRO and while the keyboard is
                up (see showPlayBanner). */}
            {showPlayBanner && (
                <View style={styles.playBannerPinned}>
                    <AdBanner
                        placement="play_chat"
                        isBackgroundDark={isBackgroundDark}
                        onGaveUp={() => setBannerGaveUp(true)}
                    />
                </View>
            )}

            {/* Cùng lớp phủ (absolute inset-0, zIndex 20) mà khối chat dùng.
                    VoiceLoadingOverlay không phải Modal — bỏ wrapper này ra thì
                    nó tụt xuống dưới khối chat. Hai lớp là anh em nên lớp này
                    vẫn vẽ đè lên, đúng như thứ tự cũ khi còn lồng nhau. */}
                <View style={styles.chatOverlay} pointerEvents="box-none">
                <AdGateDialog
                    visible={switchGateFor !== null}
                    body={t("ads.gate_body_char", { name: switchGateFor?.name ?? "" })}
                    onWatch={async () => {
                        const c = switchGateFor;
                        setSwitchGateFor(null);
                        if (!c) return;
                        const outcome = await showSwitchAd();
                        if (outcome === "dismissed") return;
                        if (outcome === "unavailable" && !consumeNoFillGrant()) {
                            Alert.alert(t("common.error"), t("ads.no_fill"));
                            return;
                        }
                        await markUnlocked("character", c.id, user?.id);
                        handleCharacterSelect(c);
                    }}
                    onUpgrade={() => {
                        setSwitchGateFor(null);
                        setSubscriptionOpen(true);
                    }}
                    onCancel={() => setSwitchGateFor(null)}
                />


                <VoiceLoadingOverlay
                    visible={voiceState.isBooting || voiceState.status === "connecting"}
                    characterName={characterName}
                    characterAvatar={characterThumbnail ?? undefined}
                />
                </View>


            <PlaySheets
                user={user}
                trialRemaining={trialRemaining}
                charSheetOpen={charSheetOpen}
                setCharSheetOpen={setCharSheetOpen}
                costumeSheetOpen={costumeSheetOpen}
                setCostumeSheetOpen={setCostumeSheetOpen}
                bgSheetOpen={bgSheetOpen}
                setBgSheetOpen={setBgSheetOpen}
                settingsSheetOpen={settingsSheetOpen}
                setSettingsSheetOpen={setSettingsSheetOpen}
                subscriptionOpen={subscriptionOpen}
                setSubscriptionOpen={setSubscriptionOpen}
                mediaSheetOpen={mediaSheetOpen}
                setMediaSheetOpen={setMediaSheetOpen}
                checkinOpen={checkinOpen}
                setCheckinOpen={setCheckinOpen}
                questOpen={questOpen}
                bondOpen={bondOpen}
                bondLevel={bondLevel}
                bondProgress={bondProgress}
                setBondOpen={setBondOpen}
                characterName={characterName}
                setQuestOpen={setQuestOpen}
                dance={dance}
                sceneImage={characterAvatar ?? characterThumbnail}
                isPro={isPro}
                characterId={characterId}
                characterModelUrl={characterModelUrl}
                backgroundId={backgroundId}
                backgroundUrl={backgroundUrl}
                onCharacterSelect={handleCharacterSelect}
                onCostumeSelect={handleCostumeSelect}
                onBackgroundSelect={handleBackgroundSelect}
                onRubyClaimed={(bal) => { setRubyBalance(bal); setCheckinTick((n) => n + 1); }}
                onPurchaseSuccess={refreshStatus}
                onCharacterSheetClosed={showInterstitial}
                onResetOnboarding={async () => {
                    if (!user?.id) return;
                    // Delete user_assets (checkOnboarding checks this table)
                    await supabase.from("user_assets").delete().eq("user_id", user.id);
                    await supabase.from("user_preferences").delete().eq("user_id", user.id);
                    setIsOnboarded(false);
                }}
            />

            {mediaUnlock.dialogs}

            {/* Flagging offensive AI output, from a long-press on any of her
                messages. Google Play requires the way in to be in the app. */}
            <ReportDialog
                visible={!!reportTarget}
                kind="chat_message"
                targetId={reportTarget?.id}
                characterId={characterId}
                snapshot={reportTarget?.mediaUrl ?? reportTarget?.text}
                onClose={() => setReportTarget(null)}
                onReported={(id) => {
                    if (id) setReportedIds((prev) => new Set(prev).add(id));
                }}
            />

            {/* Sensitive content gate (become_nude). Last in the tree and at
                zIndex 500 so nothing floats over what it is meant to hide. */}
            <SensitiveOverlay
                visible={isNudeBlurred}
                surface={surface}
                onUpgrade={() => setSubscriptionOpen(true)}
                onDismiss={() => {
                    setIsNudeBlurred(false);
                    setIs3DMode(false);
                    // Revert to base model so they don't stay nude if they turn 3D back on
                    if (baseModelUrl) {
                        setCharacterModelUrl(baseModelUrl);
                        vrmRef.current?.loadModelByURL(baseModelUrl);
                    }
                }}
            />
        </View>
    );
}
