import { TypedEventEmitter } from "./events.ts";
import type { BackendState, Device, PlaybackState, PlaylistSummary, Track, UserProfile } from "./models.ts";
import type { MusicApiClient, PlayRequest, PlayerAdapter } from "./ports.ts";

export interface BackendEvents {
  stateChanged: BackendState;
  error: Error;
}

export interface SpotifyBackendOptions {
  playerAdapter?: PlayerAdapter;
  autoTransferToPlayer?: boolean;
  playerDiscoveryTimeoutMs?: number;
}

const INITIAL_STATE: BackendState = {
  user: null,
  playback: null,
  devices: [],
  playlists: [],
  lastUpdatedAt: null,
};

export class SpotifyBackend extends TypedEventEmitter<BackendEvents> {
  private state: BackendState = { ...INITIAL_STATE };
  private readonly playerAdapter?: PlayerAdapter;
  private readonly autoTransferToPlayer: boolean;
  private readonly playerDiscoveryTimeoutMs: number;

  constructor(
    private readonly apiClient: MusicApiClient,
    options: SpotifyBackendOptions = {},
  ) {
    super();
    this.playerAdapter = options.playerAdapter;
    this.autoTransferToPlayer = options.autoTransferToPlayer ?? true;
    this.playerDiscoveryTimeoutMs = options.playerDiscoveryTimeoutMs ?? 15_000;
  }

  async initialize(): Promise<void> {
    if (this.playerAdapter) {
      await this.playerAdapter.start();
    }

    await this.refresh();

    if (this.playerAdapter && this.autoTransferToPlayer) {
      await this.autoTransferToPlayerDevice();
      await this.refreshPlayback();
    }
  }

  getState(): BackendState {
    return {
      ...this.state,
      devices: [...this.state.devices],
      playlists: [...this.state.playlists],
    };
  }

  async refresh(): Promise<BackendState> {
    try {
      const [user, playback, devices, playlists] = await Promise.all([
        this.apiClient.getCurrentUser(),
        this.apiClient.getPlaybackState(),
        this.apiClient.getAvailableDevices(),
        this.apiClient.getPlaylists(),
      ]);

      this.updateState({ user, playback, devices, playlists });
      return this.getState();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async refreshPlayback(): Promise<PlaybackState | null> {
    try {
      const playback = await this.apiClient.getPlaybackState();
      this.updateState({ playback });
      return playback;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async play(request?: PlayRequest): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.play(request));
  }

  async pause(): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.pause());
  }

  async nextTrack(): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.next());
  }

  async previousTrack(): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.previous());
  }

  async transferPlayback(deviceId: string, play = false): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.transferPlayback(deviceId, play));
  }

  async startPlayer(): Promise<boolean> {
    if (!this.playerAdapter) {
      return false;
    }

    await this.playerAdapter.start();
    await this.autoTransferToPlayerDevice();
    await this.refresh();
    return true;
  }

  async stopPlayer(): Promise<boolean> {
    if (!this.playerAdapter) {
      return false;
    }

    await this.playerAdapter.stop();
    await this.refresh();
    return true;
  }

  async setVolume(volumePercent: number): Promise<void> {
    await this.withControlUpdate(() => this.apiClient.setVolume(volumePercent));
  }

  async searchTracks(query: string, limit = 10): Promise<Track[]> {
    try {
      return await this.apiClient.searchTracks(query, limit);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getDevices(): Promise<Device[]> {
    try {
      const devices = await this.apiClient.getAvailableDevices();
      this.updateState({ devices });
      return devices;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getPlaylists(limit = 20): Promise<PlaylistSummary[]> {
    try {
      const playlists = await this.apiClient.getPlaylists(limit);
      this.updateState({ playlists });
      return playlists;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUser(): Promise<UserProfile> {
    try {
      const user = await this.apiClient.getCurrentUser();
      this.updateState({ user });
      return user;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async withControlUpdate(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      await this.refreshPlayback();
      const devices = await this.apiClient.getAvailableDevices();
      this.updateState({ devices });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async autoTransferToPlayerDevice(): Promise<void> {
    const preferredName = this.playerAdapter?.getPreferredDeviceName();
    if (!preferredName) {
      return;
    }

    const device = await this.waitForDeviceByName(preferredName, this.playerDiscoveryTimeoutMs);
    if (!device?.id) {
      this.emit("error", new Error(`Player device '${preferredName}' was not discovered in Spotify.`));
      return;
    }

    await this.apiClient.transferPlayback(device.id, false);
  }

  private async waitForDeviceByName(deviceName: string, timeoutMs: number): Promise<Device | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const devices = await this.apiClient.getAvailableDevices();
      this.updateState({ devices });

      const match = devices.find((device) => device.name.toLowerCase() === deviceName.toLowerCase());
      if (match) {
        return match;
      }

      await sleep(500);
    }

    return null;
  }

  private updateState(next: Partial<Omit<BackendState, "lastUpdatedAt">>): void {
    this.state = {
      ...this.state,
      ...next,
      lastUpdatedAt: Date.now(),
    };

    this.emit("stateChanged", this.getState());
  }

  private handleError(error: unknown): Error {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.emit("error", normalized);
    return normalized;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
