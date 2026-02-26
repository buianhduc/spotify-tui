import type {
  Device,
  PlaybackState,
  PlaylistSummary,
  Track,
  UserProfile,
} from "./models.ts";

export interface PlayRequest {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offsetPosition?: number;
  positionMs?: number;
}

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface PlayerAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getPreferredDeviceName(): string | null;
}

export interface MusicApiClient {
  getCurrentUser(): Promise<UserProfile>;
  getPlaybackState(): Promise<PlaybackState | null>;
  getAvailableDevices(): Promise<Device[]>;
  getPlaylists(limit?: number): Promise<PlaylistSummary[]>;

  play(request?: PlayRequest): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  transferPlayback(deviceId: string, play?: boolean): Promise<void>;
  setVolume(volumePercent: number): Promise<void>;

  searchTracks(query: string, limit?: number): Promise<Track[]>;
}
