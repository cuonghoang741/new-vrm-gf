import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { mediaDevices, MediaStream } from '@livekit/react-native-webrtc';
// @ts-ignore
import { CharacterRepository } from '../repositories/CharacterRepository';
import { analyticsService } from '../services/AnalyticsService';
import { useVoiceConversation } from './useVoiceConversation';
import { callQuotaService, CallQuotaService } from '../services/CallQuotaService';

type UseAppVoiceCallOptions = {
    activeCharacterId: string | undefined;
    userId: string | null | undefined;
    voiceCallbacks: any;
    webBridgeRef: React.MutableRefObject<any>;
    isPro: boolean;
    onQuotaExhausted?: () => void;
};

export const useAppVoiceCall = ({
    activeCharacterId,
    userId,
    voiceCallbacks,
    webBridgeRef,
    isPro,
    onQuotaExhausted
}: UseAppVoiceCallOptions) => {
    // Separate states for voice mode vs camera mode
    const [isVoiceMode, setIsVoiceMode] = useState(false);  // Voice-only call (no zoom)
    const [isCameraMode, setIsCameraMode] = useState(false); // Video call (zoom to face + camera)
    const [isProcessing, setIsProcessing] = useState(false);
    const [remainingQuotaSeconds, setRemainingQuotaSeconds] = useState<number>(CallQuotaService.getDefaultQuota(isPro));

    const isSwitchingModeRef = useRef(false);
    const agentIdCacheRef = useRef<Map<string, string>>(new Map());
    const remainingQuotaRef = useRef(remainingQuotaSeconds);
    const isProRef = useRef(isPro);

    // Keep isProRef in sync with isPro prop
    useEffect(() => {
        isProRef.current = isPro;
    }, [isPro]);

    // Initialize voice conversation
    const {
        state: voiceState,
        startCall: startVoiceConversation,
        endCall: endVoiceConversation,
        sendText: sendVoiceText,
    } = useVoiceConversation(voiceCallbacks);

    const resolveAgentId = useCallback(async (): Promise<string | null> => {
        if (!activeCharacterId) return null;

        // Check cache first
        if (agentIdCacheRef.current.has(activeCharacterId)) {
            return agentIdCacheRef.current.get(activeCharacterId)!;
        }

        try {
            const repo = new CharacterRepository();
            const character = await repo.fetchCharacter(activeCharacterId);
            if (character?.agent_elevenlabs_id) {
                agentIdCacheRef.current.set(activeCharacterId, character.agent_elevenlabs_id);
                return character.agent_elevenlabs_id;
            }
        } catch (error) {
            console.warn('[useAppVoiceCall] Failed to fetch character agent ID:', error);
        }
        return null;
    }, [activeCharacterId]);

    // Refresh quota function - uses ref to always get latest isPro value
    const refreshQuota = useCallback(async () => {
        const currentIsPro = isProRef.current;
        const quota = await callQuotaService.fetchQuota(currentIsPro);
        setRemainingQuotaSeconds(quota);
        remainingQuotaRef.current = quota;
    }, []); // No dependencies - uses ref

    // Fetch initial quota and refetch when isPro changes
    useEffect(() => {
        let mounted = true;
        const fetchQuota = async () => {
            const quota = await callQuotaService.fetchQuota(isPro);
            if (mounted) {
                setRemainingQuotaSeconds(quota);
                remainingQuotaRef.current = quota;
            }
        };
        fetchQuota();
        return () => { mounted = false; };
    }, [isPro]);


    const ensureCameraPermission = useCallback(async () => {
        if (Platform.OS === 'android') {
            try {
                const currentStatus = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.CAMERA
                );
                if (currentStatus) return true;

                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    {
                        title: 'Camera permission',
                        message: 'Camera access is required to start a video call.',
                        buttonPositive: 'OK',
                    }
                );

                if (result === PermissionsAndroid.RESULTS.GRANTED) {
                    return true;
                }

                if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN || result === PermissionsAndroid.RESULTS.DENIED) {
                    Alert.alert(
                        'Camera Permission Required',
                        'Please enable camera access in Settings to use video calls.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Open Settings', onPress: () => Linking.openSettings() },
                        ]
                    );
                }
                return false;
            } catch (error) {
                console.warn('[useAppVoiceCall] Camera permission request failed:', error);
                return false;
            }
        }
        return true;
    }, []);

    const ensureMicrophonePermission = useCallback(async () => {
        if (Platform.OS === 'android') {
            try {
                const currentStatus = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                );
                if (currentStatus) return true;

                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: 'Microphone Permission',
                        message: 'Microphone access is required for voice chat.',
                        buttonPositive: 'OK',
                    }
                );

                if (result === PermissionsAndroid.RESULTS.GRANTED) {
                    return true;
                }

                if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
                    Alert.alert(
                        'Microphone Permission Required',
                        'Please enable microphone access in Settings to use voice chat.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Open Settings', onPress: () => Linking.openSettings() },
                        ]
                    );
                }
                return false;
            } catch (error) {
                console.warn('[useAppVoiceCall] Microphone permission request failed:', error);
                return false;
            }
        }
        return true;
    }, []);

    // End entire call (both voice & camera)
    const endCall = useCallback(async () => {
        try {
            setIsProcessing(true);
            await endVoiceConversation();
            if (webBridgeRef.current) {
                webBridgeRef.current.setMouthOpen(0);
                webBridgeRef.current.setCallMode(false);
            }
            setIsVoiceMode(false);
            setIsCameraMode(false);
        } catch (error) {
            console.warn('[useAppVoiceCall] Error ending call:', error);
        } finally {
            setIsProcessing(false);
        }
    }, [endVoiceConversation, webBridgeRef]);

    // Metering Logic - countdown and sync to DB
    useEffect(() => {
        if (!voiceState.isConnected || isProcessing) {
            return;
        }

        // Check if already exhausted when call starts
        if (remainingQuotaSeconds <= 0) {
            console.log('[useAppVoiceCall] Quota already exhausted, ending call');
            endCall();
            onQuotaExhausted?.();
            return;
        }

        const timer = setInterval(() => {
            setRemainingQuotaSeconds(prev => {
                const next = prev - 1;
                remainingQuotaRef.current = next; // Keep ref in sync

                console.log('[useAppVoiceCall] Countdown:', next);

                if (next <= 0) {
                    // Quota exhausted
                    clearInterval(timer);
                    // Update DB with 0
                    callQuotaService.updateQuota(0).catch(console.error);
                    // End call and notify
                    endCall();
                    onQuotaExhausted?.();
                    return 0;
                }

                // Sync to DB every 5 seconds
                if (next % 5 === 0) {
                    callQuotaService.updateQuota(next).catch(console.error);
                }

                return next;
            });
        }, 1000);

        return () => {
            clearInterval(timer);
            // Save remaining quota to DB when call ends/unmounts (use ref for latest value)
            if (remainingQuotaRef.current > 0) {
                console.log('[useAppVoiceCall] Saving quota on cleanup:', remainingQuotaRef.current);
                callQuotaService.updateQuota(remainingQuotaRef.current).catch(console.error);
            }
        };
    }, [voiceState.isConnected, isProcessing, endCall, onQuotaExhausted]);

    // Start ElevenLabs conversation if not already connected
    const ensureVoiceConnected = useCallback(async (): Promise<boolean> => {
        if (voiceState.isConnected) return true;

        if (!activeCharacterId) {
            Alert.alert('Voice unavailable', 'Please select a character before starting a call.');
            return false;
        }

        const hasMicPermission = await ensureMicrophonePermission();
        if (!hasMicPermission) return false;

        const agentId = await resolveAgentId();
        if (!agentId) {
            Alert.alert('Voice unavailable', 'This character does not have a voice agent available yet.');
            return false;
        }

        try {
            await startVoiceConversation({
                agentId,
                userId: userId ?? undefined,
            });
            return true;
        } catch (error) {
            console.warn('[useAppVoiceCall] Failed to start voice conversation:', error);
            Alert.alert('Voice call', 'Unable to start a call right now. Please try again in a moment.');
            return false;
        }
    }, [
        voiceState.isConnected,
        activeCharacterId,
        ensureMicrophonePermission,
        resolveAgentId,
        startVoiceConversation,
        userId
    ]);

    // Toggle Voice Mode (no zoom, no camera) -> NOW ZOOM IN (User Preference)
    const handleToggleVoiceMode = useCallback(async () => {
        if (isSwitchingModeRef.current) return;
        if (voiceState.isBooting || voiceState.status === 'connecting') return;

        // Check quota before starting (if not already in call)
        if (!isPro && remainingQuotaSeconds <= 0 && !isCameraMode && !isVoiceMode) {
            onQuotaExhausted?.();
            return;
        }

        isSwitchingModeRef.current = true;
        setIsProcessing(true);

        // Immediate Zoom In for feedback
        if (webBridgeRef.current) {
            webBridgeRef.current.setCallMode(true);
        }

        try {
            // If already in any call mode, end it
            if (voiceState.isConnected) {
                await endCall();
                return;
            }

            // Start voice call
            const connected = await ensureVoiceConnected();
            if (connected) {
                setIsVoiceMode(true);
                setIsCameraMode(false);
                // Keep Call Mode (Zoom In) active
                if (activeCharacterId) {
                    analyticsService.logVoiceCallStart(activeCharacterId);
                }
            } else {
                // Formatting revert if failed
                if (webBridgeRef.current) {
                    webBridgeRef.current.setCallMode(false);
                }
            }
        } finally {
            isSwitchingModeRef.current = false;
            setIsProcessing(false);
        }
    }, [
        voiceState.isBooting,
        voiceState.status,
        voiceState.isConnected,
        isCameraMode,
        isVoiceMode,
        endCall,
        ensureVoiceConnected,
        webBridgeRef,
        activeCharacterId,
        remainingQuotaSeconds,
        isPro,
        onQuotaExhausted
    ]);

    // Toggle Camera Mode (zoom to face + camera preview in UI)
    const handleToggleCameraMode = useCallback(async () => {
        if (isSwitchingModeRef.current) return;
        if (voiceState.isBooting || voiceState.status === 'connecting') return;

        // Check quota before starting (if not already in call)
        if (!isPro && remainingQuotaSeconds <= 0 && !isCameraMode && !isVoiceMode) {
            onQuotaExhausted?.();
            return;
        }

        isSwitchingModeRef.current = true;
        setIsProcessing(true);

        try {
            // CASE 1: Already in camera mode -> turn OFF camera mode
            if (isCameraMode) {
                setIsCameraMode(false);

                // If voice was active before camera, keep voice running
                if (isVoiceMode || voiceState.isConnected) {
                    setIsVoiceMode(true);
                    if (webBridgeRef.current) {
                        webBridgeRef.current.setCallMode(true);
                    }
                } else {
                    if (webBridgeRef.current) {
                        webBridgeRef.current.setCallMode(false);
                    }
                    await endCall();
                }
                return;
            }

            // CASE 2: Already in voice mode -> upgrade (just toggle state)
            if (isVoiceMode && voiceState.isConnected) {
                const hasPermission = await ensureCameraPermission();
                if (!hasPermission) return;

                setIsCameraMode(true);
                setIsVoiceMode(false);

                if (webBridgeRef.current) {
                    webBridgeRef.current.setCallMode(true);
                }
                return;
            }

            // CASE 3: Not in any call -> start fresh video call
            if (!activeCharacterId) {
                Alert.alert('Voice unavailable', 'Please select a character before starting a video call.');
                return;
            }

            const hasPermission = await ensureCameraPermission();
            if (!hasPermission) return;

            // Start voice connection
            const connected = await ensureVoiceConnected();
            if (connected) {
                setIsCameraMode(true);
                setIsVoiceMode(false);

                if (webBridgeRef.current) {
                    webBridgeRef.current.setCallMode(true);
                }

                if (activeCharacterId) {
                    analyticsService.logVideoCallStart(activeCharacterId);
                }
            }

        } finally {
            isSwitchingModeRef.current = false;
            setIsProcessing(false);
        }
    }, [
        voiceState.isBooting,
        voiceState.status,
        voiceState.isConnected,
        isCameraMode,
        isVoiceMode,
        webBridgeRef,
        endCall,
        activeCharacterId,
        ensureCameraPermission,
        ensureVoiceConnected,
        remainingQuotaSeconds,
        isPro,
        onQuotaExhausted
    ]);

    return {
        voiceState,
        isVoiceMode,
        isCameraMode,
        handleToggleCameraMode,
        handleToggleVoiceMode,
        handleToggleMic: handleToggleVoiceMode,
        sendVoiceText,
        endCall,
        agentIdCacheRef,
        ensureCameraPermission,
        ensureMicrophonePermission,

        isProcessing,
        remainingQuotaSeconds,
        refreshQuota,
    };
};
