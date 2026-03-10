import { getAuthConfig } from "./spotify-auth";

interface SpotifyTokenSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyPlaylistResponse {
  items?: Array<{
    id?: string;
    name?: string;
    tracks?: {
      total?: number;
    };
    owner?: {
      display_name?: string;
      id?: string;
    };
    images?: Array<{
      url?: string;
    }>;
  }>;
}

interface SpotifySearchResponse {
  tracks?: {
    items?: Array<{
      id?: string;
      name?: string;
      uri?: string;
      album?: {
        name?: string;
        images?: Array<{
          url?: string;
        }>;
      };
      artists?: Array<{
        name?: string;
      }>;
    }>;
  };
  albums?: {
    items?: Array<{
      id?: string;
      name?: string;
      uri?: string;
      total_tracks?: number;
      images?: Array<{
        url?: string;
      }>;
      artists?: Array<{
        name?: string;
      }>;
    }>;
  };
  artists?: {
    items?: Array<{
      id?: string;
      name?: string;
      genres?: string[];
      images?: Array<{
        url?: string;
      }>;
    }>;
  };
  playlists?: {
    items?: Array<{
      id?: string;
      name?: string;
      uri?: string;
      owner?: {
        display_name?: string;
        id?: string;
      };
      tracks?: {
        total?: number;
      };
      images?: Array<{
        url?: string;
      }>;
    }>;
  };
}

interface SpotifyDevicesResponse {
  devices?: Array<{
    id?: string | null;
    is_active?: boolean;
    name?: string;
    type?: string;
    volume_percent?: number | null;
  }>;
}

interface SpotifyPlaybackResponse {
  is_playing?: boolean;
  progress_ms?: number;
  device?: {
    id?: string | null;
    name?: string;
  };
  item?: {
    id?: string;
    name?: string;
    uri?: string;
    duration_ms?: number;
    artists?: Array<{
      name?: string;
    }>;
    album?: {
      name?: string;
      images?: Array<{
        url?: string;
      }>;
    };
  } | null;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  tracksTotal: number;
  ownerName: string;
  imageUrl: string | null;
}

export interface SpotifyTrackSummary {
  id: string;
  name: string;
  uri: string;
  albumName: string;
  artistNames: string;
  imageUrl: string | null;
}

export interface SpotifyAlbumSummary {
  id: string;
  name: string;
  uri: string;
  artistNames: string;
  totalTracks: number;
  imageUrl: string | null;
}

export interface SpotifyArtistSummary {
  id: string;
  name: string;
  genres: string;
  imageUrl: string | null;
}

export interface SpotifyDeviceSummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  volumePercent: number | null;
}

export interface SpotifyPlaybackSummary {
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  deviceName: string;
  trackName: string;
  trackUri: string | null;
  artistNames: string;
  albumName: string;
  albumImageUrl: string | null;
}

export interface SpotifySearchSummary {
  tracks: SpotifyTrackSummary[];
  albums: SpotifyAlbumSummary[];
  artists: SpotifyArtistSummary[];
  playlists: SpotifyPlaylistSummary[];
}

// Use a stored refresh token to call Spotify Web API for browse views.
export async function fetchUserPlaylists(refreshToken: string): Promise<SpotifyPlaylistSummary[]> {
  const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
  const response = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch playlists (${response.status}): ${await parseError(response)}`);
  }

  const json = (await response.json()) as SpotifyPlaylistResponse;
  const items = json.items ?? [];
  return items
    .map((playlist) => {
      const id = playlist.id ?? "";
      if (!id) {
        return null;
      }

      return {
        id,
        name: playlist.name ?? "Untitled playlist",
        tracksTotal: playlist.tracks?.total ?? 0,
        ownerName: playlist.owner?.display_name ?? playlist.owner?.id ?? "Unknown",
        imageUrl: firstImage(playlist.images),
      } satisfies SpotifyPlaylistSummary;
    })
    .filter((playlist): playlist is SpotifyPlaylistSummary => playlist !== null);
}

export async function searchTracks(
  refreshToken: string,
  query: string,
  limit = 20,
): Promise<SpotifyTrackSummary[]> {
  const results = await searchCatalog(refreshToken, query, limit);
  return results.tracks;
}

export async function searchCatalog(
  refreshToken: string,
  query: string,
  limit = 12,
): Promise<SpotifySearchSummary> {
  const trimmedQuery = query.trim();
  
  if (!trimmedQuery) {
    return {
      tracks: [],
      albums: [],
      artists: [],
      playlists: [],
    };
  }

  const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.searchParams.set("q", trimmedQuery);
  searchUrl.searchParams.set("type", "track,album,artist,playlist");
  searchUrl.searchParams.set("limit", String(limit));

  const response = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to search Spotify (${response.status}): ${await parseError(response)}`);
  }

  const json = (await response.json()) as SpotifySearchResponse;

  const tracks = (json.tracks?.items ?? [])
    .map((track) => {
      const id = track.id ?? "";
      const uri = track.uri ?? "";
      if (!id || !uri) {
        return null;
      }

      return {
        id,
        name: track.name ?? "Untitled track",
        uri,
        albumName: track.album?.name ?? "Unknown album",
        artistNames: toArtistNames(track.artists),
        imageUrl: firstImage(track.album?.images),
      } satisfies SpotifyTrackSummary;
    })
    .filter((track): track is SpotifyTrackSummary => track !== null);
  console.debug("Spotify search - tracks", tracks);

  const albums = (json.albums?.items ?? [])
    .map((album) => {
      const id = album.id ?? "";
      const uri = album.uri ?? "";
      if (!id || !uri) {
        return null;
      }

      return {
        id,
        name: album.name ?? "Untitled album",
        uri,
        artistNames: toArtistNames(album.artists),
        totalTracks: album.total_tracks ?? 0,
        imageUrl: firstImage(album.images),
      } satisfies SpotifyAlbumSummary;
    })
    .filter((album): album is SpotifyAlbumSummary => album !== null);

  const artists = (json.artists?.items ?? [])
    .map((artist) => {
      const id = artist.id ?? "";
      if (!id) {
        return null;
      }

      return {
        id,
        name: artist.name ?? "Unknown artist",
        genres: (artist.genres ?? []).join(", "),
        imageUrl: firstImage(artist.images),
      } satisfies SpotifyArtistSummary;
    })
    .filter((artist): artist is SpotifyArtistSummary => artist !== null);

  const playlists = (json.playlists?.items ?? [])
    .map((playlist) => {
      const id = playlist.id ?? "";
      if (!id) {
        return null;
      }

      return {
        id,
        name: playlist.name ?? "Untitled playlist",
        tracksTotal: playlist.tracks?.total ?? 0,
        ownerName: playlist.owner?.display_name ?? playlist.owner?.id ?? "Unknown",
        imageUrl: firstImage(playlist.images),
      } satisfies SpotifyPlaylistSummary;
    })
    .filter((playlist): playlist is SpotifyPlaylistSummary => playlist !== null);

  return {
    tracks,
    albums,
    artists,
    playlists,
  };
}

export async function fetchAvailableDevices(refreshToken: string): Promise<SpotifyDeviceSummary[]> {
  const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
  const response = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch devices (${response.status}): ${await parseError(response)}`);
  }

  const json = (await response.json()) as SpotifyDevicesResponse;
  const devices = json.devices ?? [];
  return devices
    .map((device) => {
      const id = device.id ?? "";
      if (!id) {
        return null;
      }

      return {
        id,
        name: device.name ?? "Unknown device",
        type: device.type ?? "Unknown",
        isActive: Boolean(device.is_active),
        volumePercent: typeof device.volume_percent === "number" ? device.volume_percent : null,
      } satisfies SpotifyDeviceSummary;
    })
    .filter((device): device is SpotifyDeviceSummary => device !== null);
}

export async function fetchPlaybackState(refreshToken: string): Promise<SpotifyPlaybackSummary | null> {
  const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
  const response = await fetch("https://api.spotify.com/v1/me/player", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch playback (${response.status}): ${await parseError(response)}`);
  }

  const json = (await response.json()) as SpotifyPlaybackResponse;
  if (!json.item?.uri) {
    return null;
  }

  return {
    isPlaying: Boolean(json.is_playing),
    progressMs: json.progress_ms ?? 0,
    durationMs: json.item.duration_ms ?? 0,
    deviceName: json.device?.name ?? "Unknown device",
    trackName: json.item.name ?? "Unknown track",
    trackUri: json.item.uri ?? null,
    artistNames: toArtistNames(json.item.artists),
    albumName: json.item.album?.name ?? "Unknown album",
    albumImageUrl: firstImage(json.item.album?.images),
  };
}

export async function transferPlayback(
  refreshToken: string,
  deviceId: string,
  play = false,
): Promise<void> {
  await playerCommand(refreshToken, "PUT", "https://api.spotify.com/v1/me/player", {
    device_ids: [deviceId],
    play,
  });
}

export async function playPlaylist(refreshToken: string, playlistId: string, deviceId?: string): Promise<void> {
  await playContextUri(refreshToken, `spotify:playlist:${playlistId}`, deviceId);
}

export async function playAlbum(refreshToken: string, albumId: string, deviceId?: string): Promise<void> {
  await playContextUri(refreshToken, `spotify:album:${albumId}`, deviceId);
}

export async function playTrack(refreshToken: string, trackUri: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/play", deviceId);
  await playerCommand(refreshToken, "PUT", endpoint, {
    uris: [trackUri],
  });
}

export async function resumePlayback(refreshToken: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/play", deviceId);
  await playerCommand(refreshToken, "PUT", endpoint);
}

export async function pausePlayback(refreshToken: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/pause", deviceId);
  await playerCommand(refreshToken, "PUT", endpoint);
}

export async function skipToNextTrack(refreshToken: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/next", deviceId);
  await playerCommand(refreshToken, "POST", endpoint);
}

export async function skipToPreviousTrack(refreshToken: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/previous", deviceId);
  await playerCommand(refreshToken, "POST", endpoint);
}

async function playContextUri(refreshToken: string, contextUri: string, deviceId?: string): Promise<void> {
  const endpoint = withOptionalDevice("https://api.spotify.com/v1/me/player/play", deviceId);
  await playerCommand(refreshToken, "PUT", endpoint, {
    context_uri: contextUri,
  });
}

async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
  const config = getAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(new URL("/api/token", config.accountsBaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh access token (${response.status}): ${await parseError(response)}`);
  }

  const json = (await response.json()) as SpotifyTokenSuccessResponse;
  if (!json.access_token) {
    throw new Error("Spotify token endpoint returned an invalid response.");
  }

  return json.access_token;
}

async function playerCommand(
  refreshToken: string,
  method: "PUT" | "POST",
  endpoint: string,
  body?: object,
): Promise<void> {
  const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
  const response = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Spotify player command failed (${response.status}): ${await parseError(response)}`);
  }
}

function withOptionalDevice(endpoint: string, deviceId?: string): string {
  if (!deviceId) {
    return endpoint;
  }

  const url = new URL(endpoint);
  url.searchParams.set("device_id", deviceId);
  return url.toString();
}

function firstImage(images: Array<{ url?: string }> | undefined): string | null {
  const first = images?.find((image) => typeof image.url === "string" && image.url.length > 0)?.url;
  return first ?? null;
}

function toArtistNames(artists: Array<{ name?: string }> | undefined): string {
  const names = (artists ?? []).map((artist) => artist.name ?? "Unknown artist").filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Unknown artist";
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      error_description?: string;
      message?: string;
    };

    if (typeof body.error_description === "string") {
      return body.error_description;
    }

    if (typeof body.error === "string") {
      return body.error;
    }

    if (typeof body.error === "object" && typeof body.error?.message === "string") {
      return body.error.message;
    }

    if (typeof body.message === "string") {
      return body.message;
    }

    return response.statusText;
  } catch {
    return response.statusText;
  }
}
