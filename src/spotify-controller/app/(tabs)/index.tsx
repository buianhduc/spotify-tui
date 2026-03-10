import { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useSpotifyController } from "@/lib/spotify-controller-context";

const QUICK_PLAYLISTS_LIMIT = 8;

export default function HomeScreen() {
  const router = useRouter();
  const {
    authenticating,
    error,
    initializing,
    loadingData,
    login,
    playback,
    playlists,
    refreshAll,
    playPlaylistById,
    refreshToken,
    clearError,
  } = useSpotifyController();

  const quickPlaylists = useMemo(() => playlists.slice(0, QUICK_PLAYLISTS_LIMIT), [playlists]);

  if (initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.bodyText}>Loading Spotify session...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={loadingData} onRefresh={refreshAll} />}
    >
      <Text style={styles.title}>Spotify Controller</Text>
      <Text style={styles.subtitle}>Quick controls and playlists</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.bodyText}>
          {refreshToken ? "Connected with saved refresh token." : "Connect your Spotify account to start."}
        </Text>
        <Pressable style={styles.primaryButton} disabled={authenticating} onPress={() => void login()}>
          <Text style={styles.primaryButtonText}>{authenticating ? "Opening Spotify..." : "Log in with Spotify"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Now Playing</Text>
        {playback ? (
          <Pressable style={styles.nowPlayingRow} onPress={() => router.push("/player")}>
            {playback.albumImageUrl ? (
              <Image source={{ uri: playback.albumImageUrl }} style={styles.nowPlayingArtwork} />
            ) : (
              <View style={[styles.nowPlayingArtwork, styles.artworkPlaceholder]}>
                <Text style={styles.artworkPlaceholderText}>No art</Text>
              </View>
            )}
            <View style={styles.nowPlayingMeta}>
              <Text style={styles.trackName}>{playback.trackName}</Text>
              <Text style={styles.bodyText}>{playback.artistNames}</Text>
              <Text style={styles.helpText}>{playback.isPlaying ? "Playing" : "Paused"}</Text>
            </View>
            <Text style={styles.openPlayerText}>Open</Text>
          </Pressable>
        ) : (
          <Text style={styles.bodyText}>Nothing is currently playing. Open the player modal after starting playback.</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Quick Playlists</Text>
          <Pressable onPress={() => router.push("/library")}>
            <Text style={styles.linkText}>Open Library</Text>
          </Pressable>
        </View>

        {quickPlaylists.length === 0 ? (
          <Text style={styles.bodyText}>No playlists loaded yet.</Text>
        ) : (
          <View style={styles.listContainer}>
            {quickPlaylists.map((playlist) => (
              <View key={playlist.id} style={styles.listItem}>
                <View style={styles.listMeta}>
                  <Text style={styles.listTitle}>{playlist.name}</Text>
                  <Text style={styles.helpText}>{playlist.tracksTotal} tracks</Text>
                </View>
                <Pressable style={styles.inlineButton} onPress={() => void playPlaylistById(playlist.id)}>
                  <Text style={styles.inlineButtonText}>Play</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {error ? (
        <Pressable style={styles.errorCard} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.helpText}>Tap to dismiss</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f0f0f",
    gap: 10,
  },
  title: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: "#b2b2b2",
    fontSize: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2b2b2b",
    backgroundColor: "#1a1a1a",
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
  },
  bodyText: {
    color: "#d4d4d4",
    fontSize: 14,
  },
  helpText: {
    color: "#9c9c9c",
    fontSize: 12,
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: "#1db954",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: "#0b1a10",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 14,
  },
  nowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#313131",
    padding: 10,
    backgroundColor: "#242424",
  },
  nowPlayingArtwork: {
    width: 56,
    height: 56,
    borderRadius: 6,
  },
  artworkPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2d2d2d",
  },
  artworkPlaceholderText: {
    color: "#b3b3b3",
    fontSize: 10,
  },
  nowPlayingMeta: {
    flex: 1,
    gap: 2,
  },
  trackName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  openPlayerText: {
    color: "#1db954",
    fontSize: 13,
    fontWeight: "600",
  },
  linkText: {
    color: "#1db954",
    fontSize: 13,
    fontWeight: "600",
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2f2f2f",
    backgroundColor: "#242424",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listMeta: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  inlineButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#454545",
    backgroundColor: "#2d2d2d",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#5e2a2a",
    backgroundColor: "#301616",
    padding: 12,
    gap: 4,
  },
  errorText: {
    color: "#ffd5d5",
    fontSize: 13,
  },
});
