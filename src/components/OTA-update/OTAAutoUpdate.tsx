import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useOTAUpdate } from './useOTAUpdate';

interface OTAAutoUpdateProps {
  onDismiss?: () => void;
}

export const OTAAutoUpdate: React.FC<OTAAutoUpdateProps> = () => {
  const { updateInfo, downloadAndInstallUpdate } = useOTAUpdate();
  const shimmerTranslate = useRef(new Animated.Value(-200)).current;
  const isUpdating = updateInfo.isDownloading || updateInfo.isInstalling;
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (updateInfo?.isAvailable && !hasStartedRef.current) {
      hasStartedRef.current = true;
      downloadAndInstallUpdate();
    }
  }, [updateInfo?.isAvailable, downloadAndInstallUpdate]);

  useEffect(() => {
    if (isUpdating) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerTranslate, {
            toValue: 200,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(shimmerTranslate, {
            toValue: -200,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      shimmerTranslate.stopAnimation();
      shimmerTranslate.setValue(-200);
    }
  }, [isUpdating, shimmerTranslate]);

  if (!isUpdating) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={styles.text}>
          {updateInfo.isInstalling ? 'Installing update... ' : 'Downloading update...'}
        </Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          {updateInfo.downloadProgress > 0 ? (
            <View style={[styles.progressBarFill, { width: `${Math.min(updateInfo.downloadProgress, 1) * 100}%` }]}>
              <LinearGradient
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                colors={['#ec4899', '#db2777']}
                style={styles.progressBarFillGradient}
              />
            </View>
          ) : (
            <Animated.View
              style={[
                styles.progressBarShimmerWrapper,
                { transform: [{ translateX: shimmerTranslate }] },
              ]}
            >
              <LinearGradient
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                colors={['#ffffff10', '#ffffff40', '#ffffff10']}
                style={styles.progressBarShimmer}
              />
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1f293787', // gray-800 with opacity
    borderRadius: 12,
    padding: 16,
    zIndex: 9999,
    flexDirection: 'column',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarContainer: {
    width: '100%',
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  progressBarShimmerWrapper: {
    width: '50%',
    height: '100%',
  },
  progressBarShimmer: {
    width: '100%',
    height: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFillGradient: {
    width: '100%',
    height: '100%',
  },
});
