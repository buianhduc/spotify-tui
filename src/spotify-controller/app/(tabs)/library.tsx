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

import { useSpotifyController } from "@/lib/spotify-controller-context";

export default function LibraryScreen() {
  const { clearError, error, loadingData, playlists, playPlaylistById, refreshAll } = useSpotifyController();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={loadingData} onRefresh={refreshAll} />}
    >
      <Text style={styles.title}>Library</Text>
      <Text style={styles.subtitle}>Imported playlists from your Spotify account</Text>

      {loadingData && playlists.length === 0 ? <ActivityIndicator /> : null}

      {playlists.length === 0 ? (
        <Text style={styles.emptyText}>No playlists found.</Text>
      ) : (
        <View style={styles.listContainer}>
          {playlists.map((playlist) => (
            <View key={playlist.id} style={styles.listItem}>
              {playlist.imageUrl ? (
                <Image source={{ uri: playlist.imageUrl }} style={styles.cover} />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Text style={styles.coverPlaceholderText}>No art</Text>
                </View>
              )}

              <View style={styles.listMeta}>
                <Text style={styles.playlistTitle}>{playlist.name}</Text>
                <Text style={styles.playlistMeta}>
                  {playlist.tracksTotal} tracks • {playlist.ownerName}
                </Text>
              </View>

              <Pressable style={styles.inlineButton} onPress={() => void playPlaylistById(playlist.id)}>
                <Text style={styles.inlineButtonText}>Play</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {error ? (
        <Pressable onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
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
    gap: 12,
    paddingBottom: 30,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    color: "#b2b2b2",
    fontSize: 14,
  },
  emptyText: {
    color: "#bcbcbc",
    fontSize: 13,
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    borderWidth: 1,
    borderColor: "#2d2d2d",
    borderRadius: 10,
    backgroundColor: "#1b1b1b",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 6,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2c2c2c",
  },
  coverPlaceholderText: {
    color: "#b2b2b2",
    fontSize: 10,
  },
  listMeta: {
    flex: 1,
    gap: 2,
  },
  playlistTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  playlistMeta: {
    color: "#b6b6b6",
    fontSize: 12,
  },
  inlineButton: {
    borderWidth: 1,
    borderColor: "#424242",
    borderRadius: 8,
    backgroundColor: "#2a2a2a",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  inlineButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  errorText: {
    color: "#ffc2c2",
    fontSize: 13,
  },
});
