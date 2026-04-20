import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceCallService } from '../services/VoiceCallService';
import { callQuotaService, CallQuotaService } from '../services/CallQuotaService';
import { QuestProgressTracker } from '../utils/QuestProgressTracker';
import { userStatsService } from '../services/UserStatsService';
import { relationshipLevelService } from '../services/RelationshipLevelService';

const QUOTA_SYNC_INTERVAL = 5000; // 5 seconds

type UseVoiceCallOptions = {
  characterId: string | null;
  agentId: string | null;
  isPro: boolean;
  getRemainingQuota: () => number;
  onQuotaChange: (newQuota: number) => void;
  onOutOfQuota: () => void;
  onQuestUpdate?: (questType: string, seconds: number, minutes: number) => Promise<void>;
  questTypeResolver?: () => 'voice_call' | 'video_call';
};

export const useVoiceCall = (options: UseVoiceCallOptions) => {
  const {
    characterId,
    agentId,
    isPro,
    getRemainingQuota,
    onQuotaChange,
    onOutOfQuota,
    onQuestUpdate,
    questTypeResolver,
  } = options;

  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);

  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callStartedAtRef = useRef<number | null>(null);
  const lastQuotaSyncDateRef = useRef<number | null>(null);
  const quotaSyncTaskRef = useRef<Promise<void> | null>(null);
  const pendingQuotaRef = useRef<number | null>(null);
  const totalSecondsUsedRef = useRef<number>(0);

  // MARK: - Call Metering

  const startCallMetering = useCallback(async () => {
    if (!characterId || !agentId) {
      return;
    }

    // Check quota before starting
    const currentQuota = getRemainingQuota();
    if (currentQuota <= 0) {
      onOutOfQuota();
      return;
    }

    // Clear any existing timer
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }

    callStartedAtRef.current = Date.now();
    totalSecondsUsedRef.current = 0;
    setCallElapsedSeconds(0);
    setIsCallActive(true);

    // Create call row in database
    try {
      const callId = await voiceCallService.createCallRow(characterId, agentId);
      if (callId) {
        setCurrentCallId(callId);
      }
    } catch (error) {
      console.error('[useVoiceCall] Failed to create call row:', error);
    }

    // Start timer to deduct quota every second
    const timerId = setInterval(() => {
      const currentQuota = getRemainingQuota();

      if (currentQuota <= 0) {
        // Out of quota: end call
        clearInterval(timerId);
        callTimerRef.current = null;
        setIsCallActive(false);
        onOutOfQuota();
        return;
      }

      const newQuota = Math.max(0, currentQuota - 1);
      onQuotaChange(newQuota);
      totalSecondsUsedRef.current += 1;
      setCallElapsedSeconds((prev) => prev + 1);

      // Queue quota sync to database
      queueQuotaSync(newQuota);
    }, 1000);

    callTimerRef.current = timerId;
  }, [characterId, agentId, getRemainingQuota, onQuotaChange, onOutOfQuota]);

  const stopCallMetering = useCallback(
    async (finalize: boolean) => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setIsCallActive(false);
      finalizeQuotaSync();

      if (finalize && totalSecondsUsedRef.current > 0 && characterId) {
        const callSeconds = callElapsedSeconds;
        const callMinutes = Math.floor(callSeconds / 60);

        if (callSeconds > 0) {
          // Track voice/video quest progress
          const questType = questTypeResolver ? questTypeResolver() : 'voice_call';
          if (onQuestUpdate) {
            await onQuestUpdate(questType, callSeconds, callMinutes);
          } else {
            await QuestProgressTracker.track(questType);
          }
        }

        // Finalize call row (no longer tracking vcoin, just duration)
        if (currentCallId) {
          try {
            await voiceCallService.finalizeCallRow(
              currentCallId,
              callElapsedSeconds,
              0 // No vcoin spent anymore
            );
            setCurrentCallId(null);
          } catch (error) {
            console.error('[useVoiceCall] Failed to finalize call row:', error);
          }
        }
      }

      // Reset state
      setCallElapsedSeconds(0);
      totalSecondsUsedRef.current = 0;
      callStartedAtRef.current = null;
    },
    [
      callElapsedSeconds,
      characterId,
      currentCallId,
      onQuestUpdate,
      questTypeResolver,
    ]
  );

  const reset = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallElapsedSeconds(0);
    totalSecondsUsedRef.current = 0;
    callStartedAtRef.current = null;
    setCurrentCallId(null);
    setIsCallActive(false);
    quotaSyncTaskRef.current = null;
    pendingQuotaRef.current = null;
    lastQuotaSyncDateRef.current = null;
  }, []);

  // MARK: - Quota Sync

  const queueQuotaSync = useCallback((quota: number) => {
    pendingQuotaRef.current = quota;

    if (quotaSyncTaskRef.current) {
      return;
    }

    const now = Date.now();
    const lastSync = lastQuotaSyncDateRef.current ?? 0;
    const elapsed = now - lastSync;

    if (elapsed >= QUOTA_SYNC_INTERVAL) {
      startQuotaSyncTask();
    } else {
      const delay = Math.max(0, QUOTA_SYNC_INTERVAL - elapsed);
      quotaSyncTaskRef.current = (async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await startQuotaSyncTask();
      })();
    }
  }, []);

  const startQuotaSyncTask = useCallback(async () => {
    quotaSyncTaskRef.current = null;
    const quota = pendingQuotaRef.current;
    if (quota === null) {
      return;
    }

    pendingQuotaRef.current = null;
    lastQuotaSyncDateRef.current = Date.now();

    try {
      // Use the current remaining seconds from state
      await callQuotaService.deductQuota(0); // This will update to current quota
    } catch (error) {
      console.error('[useVoiceCall] Failed to sync quota:', error);
    }
  }, []);

  const finalizeQuotaSync = useCallback(async () => {
    quotaSyncTaskRef.current = null;
    const seconds = totalSecondsUsedRef.current;
    if (seconds > 0) {
      try {
        await callQuotaService.deductQuota(seconds);
      } catch (error) {
        console.error('[useVoiceCall] Failed to finalize quota sync:', error);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, []);

  return {
    callElapsedSeconds,
    currentCallId,
    isCallActive,
    startCallMetering,
    stopCallMetering,
    reset,
    formatRemainingTime: CallQuotaService.formatRemainingTime,
  };
};
