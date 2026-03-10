import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useSpotifyController } from "@/lib/spotify-controller-context";

const PROGRESS_TICK_MS = 1_000;

export default function PlayerModalScreen() {
  const router = useRouter();
  const {
    devices,
    next,
    pause,
    playback,
    previous,
    refreshPlayback,
    resume,
    selectedDeviceId,
    setSelectedDeviceId,
  } = useSpotifyController();

  const [displayProgressMs, setDisplayProgressMs] = useState(0);

  useEffect(() => {
    setDisplayProgressMs(playback?.progressMs ?? 0);
  }, [playback?.progressMs, playback?.trackUri]);

  useEffect(() => {
    if (!playback?.isPlaying) {
      return;
    }

    const timer = setInterval(() => {
      setDisplayProgressMs((current) => {
        const nextProgress = current + PROGRESS_TICK_MS;
        if (playback.durationMs <= 0) {
          return nextProgress;
        }

        return Math.min(nextProgress, playback.durationMs);
      });
    }, PROGRESS_TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [playback?.durationMs, playback?.isPlaying]);

  const progressRatio = useMemo(() => {
    if (!playback || playback.durationMs <= 0) {
      return 0;
    }

    return Math.min(1, displayProgressMs / playback.durationMs);
  }, [displayProgressMs, playback]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {playback?.albumImageUrl ? (
          <Image source={{ uri: playback.albumImageUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]}>
            <Text style={styles.artworkPlaceholderText}>No cover</Text>
          </View>
        )}

        <Text style={styles.trackTitle}>{playback?.trackName ?? "Nothing playing"}</Text>
        <Text style={styles.artistName}>{playback?.artistNames ?? "Open Spotify and start playback"}</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>{formatDuration(displayProgressMs)}</Text>
          <Text style={styles.progressText}>{formatDuration(playback?.durationMs ?? 0)}</Text>
        </View>

        <View style={styles.controlRow}>
          <ControlButton label="Prev" onPress={() => void previous()} />
          {playback?.isPlaying ? (
            <ControlButton label="Pause" onPress={() => void pause()} />
          ) : (
            <ControlButton label="Play" onPress={() => void resume()} />
          )}
          <ControlButton label="Next" onPress={() => void next()} />
        </View>

        <Pressable style={styles.refreshButton} onPress={() => void refreshPlayback()}>
          <Text style={styles.refreshButtonText}>Refresh Playback</Text>
        </Pressable>

        <View style={styles.devicesSection}>
          <Text style={styles.sectionTitle}>Playback Device</Text>
          {devices.length === 0 ? (
            <Text style={styles.emptyText}>No devices available.</Text>
          ) : (
            devices.map((device) => {
              const selected = device.id === selectedDeviceId;
              return (
                <Pressable
                  key={device.id}
                  style={[styles.deviceItem, selected ? styles.deviceSelected : null]}
                  onPress={() => setSelectedDeviceId(device.id)}
                >
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.deviceMeta}>
                    {device.type}
                    {device.isActive ? " • Active" : ""}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ControlButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.controlButton} onPress={onPress}>
      <Text style={styles.controlButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0c0c",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeText: {
    color: "#1db954",
    fontSize: 14,
    fontWeight: "600",
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingBottom: 30,
    gap: 14,
  },
  artwork: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: "#1e1e1e",
  },
  artworkPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  artworkPlaceholderText: {
    color: "#a0a0a0",
    fontSize: 12,
  },
  trackTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  artistName: {
    color: "#c0c0c0",
    fontSize: 15,
  },
  progressTrack: {
    marginTop: 2,
    width: "100%",
    height: 6,
    borderRadius: 6,
    backgroundColor: "#2b2b2b",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1db954",
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressText: {
    color: "#9a9a9a",
    fontSize: 12,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  controlButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#3b3b3b",
    borderRadius: 10,
    backgroundColor: "#202020",
    paddingVertical: 12,
    alignItems: "center",
  },
  controlButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: "#2c5f40",
    borderRadius: 10,
    backgroundColor: "#163125",
    paddingVertical: 10,
    alignItems: "center",
  },
  refreshButtonText: {
    color: "#c3ffd8",
    fontWeight: "600",
    fontSize: 13,
  },
  devicesSection: {
    marginTop: 4,
    gap: 8,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyText: {
    color: "#a8a8a8",
    fontSize: 13,
  },
  deviceItem: {
    borderWidth: 1,
    borderColor: "#2f2f2f",
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    padding: 10,
    gap: 2,
  },
  deviceSelected: {
    borderColor: "#1db954",
  },
  deviceName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  deviceMeta: {
    color: "#b2b2b2",
    fontSize: 12,
  },
});
