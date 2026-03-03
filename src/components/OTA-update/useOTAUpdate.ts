import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UpdateInfo {
  isAvailable: boolean;
  isDownloading: boolean;
  isInstalling: boolean;
  downloadProgress: number;
  manifest?: Updates.Manifest;
  status?: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'done' | 'error';
}

export const useOTAUpdate = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    isAvailable: false,
    isDownloading: false,
    isInstalling: false,
    downloadProgress: 0,
    status: 'idle',
  });

  const [isChecking, setIsChecking] = useState(false);
  const previousStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isUpdatingRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for updates
  const checkForUpdates = async () => {
    if (__DEV__) {
      console.log('OTA updates are disabled in development mode');
      return;
    }

    try {
      setIsChecking(true);
      setUpdateInfo((prev) => ({ ...prev, status: 'checking' }));
      const update = await Updates.checkForUpdateAsync();

      setUpdateInfo((prev) => ({
        ...prev,
        isAvailable: update.isAvailable,
        manifest: update.manifest,
        status: update.isAvailable ? 'available' : 'idle',
      }));

      if (update.isAvailable) {
        console.log('Update available:', update.manifest?.id);
        // Do NOT auto download/apply — wait for explicit user action
      } else {
        console.log('No updates available');
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      setUpdateInfo((prev) => ({ ...prev, status: 'error' }));
    } finally {
      setIsChecking(false);
    }
  };

  // Download and install update
  const downloadAndInstallUpdate = async () => {
    await autoDownloadAndInstall();
  };

  // Internal helper to avoid duplicate update flows and to auto apply
  const autoDownloadAndInstall = async () => {
    if (isUpdatingRef.current) return;
    try {
      if (!updateInfo.isAvailable) {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (!isAvailable) return;
        setUpdateInfo((prev) => ({ ...prev, isAvailable }));
      }

      isUpdatingRef.current = true;
      setUpdateInfo((prev) => ({ ...prev, isDownloading: true, status: 'downloading' }));

      // Simulate determinate progress since expo-updates has no progress callbacks
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      progressIntervalRef.current = setInterval(() => {
        setUpdateInfo((prev) => {
          // Progress increases fast at start and slows near 90%
          const next = Math.min(
            0.9,
            prev.downloadProgress + Math.max(0.01, (0.2 - prev.downloadProgress) * 0.08),
          );
          return { ...prev, downloadProgress: next };
        });
      }, 100);

      const downloadResult = await Updates.fetchUpdateAsync();

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUpdateInfo((prev) => ({ ...prev, isDownloading: false, downloadProgress: 1 }));

      if (downloadResult.isNew) {
        setUpdateInfo((prev) => ({ ...prev, isInstalling: true, status: 'installing' }));
        await Updates.reloadAsync();
      } else {
        setUpdateInfo((prev) => ({ ...prev, isInstalling: false, status: 'done' }));
        isUpdatingRef.current = false;
      }
    } catch (error) {
      console.error('Error downloading/applying update:', error);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setUpdateInfo((prev) => ({
        ...prev,
        isDownloading: false,
        isInstalling: false,
        status: 'error',
      }));
      isUpdatingRef.current = false;
    }
  };

  // Auto-check for updates on app start
  useEffect(() => {
    checkForUpdates();
  }, []);

  // Check when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const wasInBackground = previousStateRef.current.match(/inactive|background/);
      previousStateRef.current = nextState;

      if (wasInBackground && nextState === 'active') {
        await checkForUpdates();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Note: Download progress tracking is not available in expo-updates
  // The update will be downloaded automatically when fetchUpdateAsync is called

  return {
    updateInfo,
    isChecking,
    checkForUpdates,
    downloadAndInstallUpdate,
  };
};
