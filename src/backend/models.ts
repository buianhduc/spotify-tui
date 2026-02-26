export interface Artist {
  id: string;
  name: string;
}

export interface Album {
  id: string;
  name: string;
  releaseDate?: string;
  coverUrl?: string;
}

export interface Track {
  id: string;
  name: string;
  uri: string;
  durationMs: number;
  artists: Artist[];
  album?: Album;
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  isActive: boolean;
  volumePercent: number | null;
}

export interface PlaybackState {
  isPlaying: boolean;
  progressMs: number;
  item: Track | null;
  device: Device | null;
  repeatState: string;
  shuffleState: boolean;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  tracksTotal: number;
  ownerName: string;
}

export interface UserProfile {
  id: string;
  displayName: string;
  country?: string;
  product?: string;
  email?: string;
}

export interface BackendState {
  user: UserProfile | null;
  playback: PlaybackState | null;
  devices: Device[];
  playlists: PlaylistSummary[];
  lastUpdatedAt: number | null;
}
