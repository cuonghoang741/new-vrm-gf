import { useCallback, useState } from 'react';
import { useConversation } from '@elevenlabs/react-native';

type VoiceCallbacks = {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (err: any) => void;
    onModeChange?: (data: { mode: string }) => void;
    onMessage?: (props: { message: string; source: string }) => void;
};

type VoiceState = {
    status: string;
    isConnected: boolean;
    isBooting: boolean;
};

type StartCallOptions = {
    agentId: string;
    userId?: string;
};

/**
 * Thin wrapper around ElevenLabs `useConversation` that normalises the
 * interface for the rest of the app.
 *
 * `callbacks` are passed through to `useConversation` and forwarded into
 * `useAppVoiceCall`.
 */
export const useVoiceConversation = (callbacks: VoiceCallbacks) => {
    const [isBooting, setIsBooting] = useState(false);

    const conversation = useConversation({
        onConnect: () => {
            setIsBooting(false);
            callbacks.onConnect?.();
        },
        onDisconnect: () => {
            setIsBooting(false);
            callbacks.onDisconnect?.();
        },
        onError: (err: any) => {
            setIsBooting(false);
            callbacks.onError?.(err);
        },
        onModeChange: (data: { mode: string }) => {
            callbacks.onModeChange?.(data);
        },
        onMessage: (props: { message: string; source: string }) => {
            callbacks.onMessage?.(props);
        },
    });

    const state: VoiceState = {
        status: conversation.status,
        isConnected: conversation.status === 'connected',
        isBooting,
    };

    const startCall = useCallback(
        async (options: StartCallOptions) => {
            setIsBooting(true);
            try {
                await conversation.startSession({
                    agentId: options.agentId,
                });
            } catch (error) {
                setIsBooting(false);
                throw error;
            }
        },
        [conversation]
    );

    const endCall = useCallback(async () => {
        setIsBooting(false);
        await conversation.endSession();
    }, [conversation]);

    const sendText = useCallback(
        (text: string) => {
            // ElevenLabs doesn't have a direct sendText – this is a placeholder
            // for future use when the SDK adds input injection.
            console.log('[useVoiceConversation] sendText not yet supported:', text);
        },
        []
    );

    return {
        state,
        startCall,
        endCall,
        sendText,
    };
};
