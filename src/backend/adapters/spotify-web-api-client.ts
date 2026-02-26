import type { Device, PlaybackState, PlaylistSummary, Track, UserProfile } from "../models.ts";
import type { MusicApiClient, PlayRequest, TokenProvider } from "../ports.ts";

interface SpotifyErrorResponse {
  error?: {
    message?: string;
    status?: number;
  };
}

interface SpotifyUserResponse {
  id: string;
  display_name: string | null;
  country?: string;
  product?: string;
  email?: string;
}

interface SpotifyArtistResponse {
  id: string;
  name: string;
}

interface SpotifyAlbumResponse {
  id: string;
  name: string;
  release_date?: string;
  images?: Array<{
    url: string;
    width: number | null;
    height: number | null;
  }>;
}

interface SpotifyTrackResponse {
  id: string | null;
  name: string;
  uri: string;
  duration_ms: number;
  artists: SpotifyArtistResponse[];
  album?: SpotifyAlbumResponse;
}

interface SpotifyDeviceResponse {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

interface SpotifyPlaybackResponse {
  is_playing: boolean;
  progress_ms: number | null;
  item: SpotifyTrackResponse | null;
  device: SpotifyDeviceResponse | null;
  repeat_state: string;
  shuffle_state: boolean;
}

interface SpotifyDevicesResponse {
  devices: SpotifyDeviceResponse[];
}

interface SpotifyPlaylistsResponse {
  items: Array<{
    id: string;
    name: string;
    owner: { display_name: string | null };
    tracks: { total: number };
  }>;
}

interface SpotifySearchTracksResponse {
  tracks: {
    items: SpotifyTrackResponse[];
  };
}

export class SpotifyWebApiClient implements MusicApiClient {
  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly baseUrl = "https://api.spotify.com/v1",
  ) {}

  async getCurrentUser(): Promise<UserProfile> {
    const user = await this.requestJson<SpotifyUserResponse>("/me");
    if (!user) {
      throw new Error("Spotify user response was empty.");
    }

    return {
      id: user.id,
      displayName: user.display_name ?? user.id,
      country: user.country,
      product: user.product,
      email: user.email,
    };
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    const playback = await this.requestJson<SpotifyPlaybackResponse>(
      "/me/player",
      undefined,
      true,
      true,
    );

    if (!playback) {
      return null;
    }

    return {
      isPlaying: playback.is_playing,
      progressMs: playback.progress_ms ?? 0,
      item: playback.item ? mapTrack(playback.item) : null,
      device: playback.device ? mapDevice(playback.device) : null,
      repeatState: playback.repeat_state,
      shuffleState: playback.shuffle_state,
    };
  }

  async getAvailableDevices(): Promise<Device[]> {
    const devices = await this.requestJson<SpotifyDevicesResponse>("/me/player/devices");
    if (!devices) {
      return [];
    }

    return devices.devices.map(mapDevice);
  }

  async getPlaylists(limit = 20): Promise<PlaylistSummary[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    const playlists = await this.requestJson<SpotifyPlaylistsResponse>(`/me/playlists?${query}`);
    if (!playlists) {
      return [];
    }

    return playlists.items.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      tracksTotal: playlist.tracks.total,
      ownerName: playlist.owner.display_name ?? "Unknown",
    }));
  }

  async play(request?: PlayRequest): Promise<void> {
    const path = request?.deviceId
      ? `/me/player/play?${new URLSearchParams({ device_id: request.deviceId })}`
      : "/me/player/play";

    await this.requestVoid(path, {
      method: "PUT",
      body: request ? JSON.stringify(mapPlayRequest(request)) : undefined,
    });
  }

  async pause(): Promise<void> {
    await this.requestVoid("/me/player/pause", { method: "PUT" });
  }

  async next(): Promise<void> {
    await this.requestVoid("/me/player/next", { method: "POST" });
  }

  async previous(): Promise<void> {
    await this.requestVoid("/me/player/previous", { method: "POST" });
  }

  async transferPlayback(deviceId: string, play = false): Promise<void> {
    await this.requestVoid("/me/player", {
      method: "PUT",
      body: JSON.stringify({
        device_ids: [deviceId],
        play,
      }),
    });
  }

  async setVolume(volumePercent: number): Promise<void> {
    const normalized = Math.max(0, Math.min(100, Math.round(volumePercent)));
    const query = new URLSearchParams({ volume_percent: String(normalized) });
    await this.requestVoid(`/me/player/volume?${query}`, { method: "PUT" });
  }

  async searchTracks(query: string, limit = 10): Promise<Track[]> {
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit),
    });

    const result = await this.requestJson<SpotifySearchTracksResponse>(`/search?${params}`);
    if (!result) {
      return [];
    }

    return result.tracks.items.map(mapTrack);
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
    allowNoContent = false,
    allowNotFound = false,
  ): Promise<T | null> {
    const response = await this.request(path, init, allowNotFound);

    if (response.status === 204) {
      if (allowNoContent) {
        return null;
      }

      throw new Error(`Spotify response for ${path} was empty.`);
    }

    if (response.status === 404 && allowNotFound) {
      return null;
    }

    return (await response.json()) as T;
  }

  private async requestVoid(path: string, init?: RequestInit): Promise<void> {
    const response = await this.request(path, init);
    if (response.status !== 204 && response.status !== 202 && response.status !== 200) {
      throw new Error(`Unexpected Spotify response for ${path}: ${response.status}`);
    }
  }

  private async request(
    path: string,
    init?: RequestInit,
    allowNotFound = false,
  ): Promise<Response> {
    const token = await this.tokenProvider.getAccessToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok && !(allowNotFound && response.status === 404)) {
      const message = await parseSpotifyError(response);
      throw new Error(`Spotify API request failed (${response.status}): ${message}`);
    }

    return response;
  }
}

function mapTrack(track: SpotifyTrackResponse): Track {
  return {
    id: track.id ?? track.uri,
    name: track.name,
    uri: track.uri,
    durationMs: track.duration_ms,
    artists: track.artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
    })),
    album: track.album
      ? {
          id: track.album.id,
          name: track.album.name,
          releaseDate: track.album.release_date,
          coverUrl: selectAlbumCover(track.album),
        }
      : undefined,
  };
}

function selectAlbumCover(album: SpotifyAlbumResponse): string | undefined {
  const images = album.images;
  if (!images || images.length === 0) {
    return undefined;
  }

  const ordered = [...images].sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    return areaB - areaA;
  });

  return ordered[Math.floor(ordered.length / 2)]?.url ?? ordered[0]?.url;
}

function mapDevice(device: SpotifyDeviceResponse): Device {
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    isActive: device.is_active,
    volumePercent: device.volume_percent,
  };
}

function mapPlayRequest(request: PlayRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (request.contextUri) {
    payload.context_uri = request.contextUri;
  }

  if (request.uris && request.uris.length > 0) {
    payload.uris = request.uris;
  }

  if (request.offsetPosition !== undefined) {
    payload.offset = { position: request.offsetPosition };
  }

  if (request.positionMs !== undefined) {
    payload.position_ms = request.positionMs;
  }

  return payload;
}

async function parseSpotifyError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as SpotifyErrorResponse;
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
