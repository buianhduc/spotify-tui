import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { SpotifySearchSummary, searchCatalog } from "@/lib/spotify-api";
import { useSpotifyController } from "@/lib/spotify-controller-context";

export default function SearchScreen() {
  const router = useRouter();
  const {
    clearError,
    error,
    playAlbumById,
    playPlaylistById,
    playTrackByUri,
    refreshToken,
  } = useSpotifyController();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }

    if (!refreshToken) {
      setLocalError("Please log in on Home before searching.");
      return;
    }

    setSearching(true);
    setLocalError(null);

    try {
      const nextResults = await searchCatalog(refreshToken, trimmed, 10);
      setResults(nextResults);
    } catch (err) {
      setLocalError(toErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Search</Text>
      <Text style={styles.subtitle}>Tracks, albums, artists, and playlists</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search Spotify"
          placeholderTextColor="#7a7a7a"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => {
            void runSearch();
          }}
        />
        <Pressable style={styles.searchButton} onPress={() => void runSearch()}>
          <Text style={styles.searchButtonText}>Go</Text>
        </Pressable>
      </View>

      {searching ? <ActivityIndicator /> : null}

      {results ? (
        <View style={styles.resultsContainer}>
          <Section title="Tracks">
            {results.tracks.length === 0 ? (
              <Text style={styles.emptyText}>No tracks found.</Text>
            ) : (
              results.tracks.map((track) => (
                <View key={track.id} style={styles.listItem}>
                  <View style={styles.listMeta}>
                    <Text style={styles.primaryText}>{track.name}</Text>
                    <Text style={styles.secondaryText}>{track.artistNames}</Text>
                  </View>
                  <Pressable style={styles.inlineButton} onPress={() => void playTrackByUri(track.uri)}>
                    <Text style={styles.inlineButtonText}>Play</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Albums">
            {results.albums.length === 0 ? (
              <Text style={styles.emptyText}>No albums found.</Text>
            ) : (
              results.albums.map((album) => (
                <View key={album.id} style={styles.listItem}>
                  <View style={styles.listMeta}>
                    <Text style={styles.primaryText}>{album.name}</Text>
                    <Text style={styles.secondaryText}>{album.artistNames}</Text>
                  </View>
                  <Pressable style={styles.inlineButton} onPress={() => void playAlbumById(album.id)}>
                    <Text style={styles.inlineButtonText}>Play</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Playlists">
            {results.playlists.length === 0 ? (
              <Text style={styles.emptyText}>No playlists found.</Text>
            ) : (
              results.playlists.map((playlist) => (
                <View key={playlist.id} style={styles.listItem}>
                  <View style={styles.listMeta}>
                    <Text style={styles.primaryText}>{playlist.name}</Text>
                    <Text style={styles.secondaryText}>by {playlist.ownerName}</Text>
                  </View>
                  <Pressable style={styles.inlineButton} onPress={() => void playPlaylistById(playlist.id)}>
                    <Text style={styles.inlineButtonText}>Play</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Section>

          <Section title="Artists">
            {results.artists.length === 0 ? (
              <Text style={styles.emptyText}>No artists found.</Text>
            ) : (
              results.artists.map((artist) => (
                <View key={artist.id} style={styles.listItem}>
                  <View style={styles.listMeta}>
                    <Text style={styles.primaryText}>{artist.name}</Text>
                    <Text style={styles.secondaryText}>{artist.genres || "No genres available"}</Text>
                  </View>
                </View>
              ))
            )}
          </Section>

          <Pressable style={styles.openPlayerButton} onPress={() => router.push("/player")}>
            <Text style={styles.openPlayerText}>Open Full Player</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.emptyText}>Start a search to see results.</Text>
      )}

      {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
      {error ? (
        <Pressable onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Search failed";
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
  searchRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#3d3d3d",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: "#fff",
    backgroundColor: "#1f1f1f",
  },
  searchButton: {
    borderRadius: 8,
    backgroundColor: "#1db954",
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  searchButtonText: {
    color: "#0b1a10",
    fontWeight: "700",
    fontSize: 13,
  },
  resultsContainer: {
    gap: 12,
  },
  section: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    padding: 10,
    gap: 8,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionContent: {
    gap: 8,
  },
  listItem: {
    borderWidth: 1,
    borderColor: "#323232",
    borderRadius: 8,
    backgroundColor: "#242424",
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listMeta: {
    flex: 1,
    gap: 2,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryText: {
    color: "#bbbbbb",
    fontSize: 12,
  },
  inlineButton: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "#2c2c2c",
  },
  inlineButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyText: {
    color: "#b2b2b2",
    fontSize: 13,
  },
  errorText: {
    color: "#ffbdbd",
    fontSize: 13,
  },
  openPlayerButton: {
    borderWidth: 1,
    borderColor: "#2f6d47",
    borderRadius: 10,
    backgroundColor: "#173324",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  openPlayerText: {
    color: "#b9ffd2",
    textAlign: "center",
    fontWeight: "600",
  },
});
