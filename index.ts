import {
  ClientSecretTokenProvider,
  LibrespotPlayerAdapter,
  SpotifyBackend,
  SpotifyWebApiClient,
} from "./src/backend/index.ts";
import { loadEnvFile } from "./src/config/load-env-file.ts";
import { SpotifyTuiApp } from "./src/tui/index.ts";

async function main(): Promise<void> {
  loadEnvFile();

  const tokenProvider = new ClientSecretTokenProvider();

  // Resolve auth before the TUI enters the alternate screen, so any refresh-token prompt is visible.
  await tokenProvider.getAccessToken();

  const spotifyApiClient = new SpotifyWebApiClient(tokenProvider);
  const playerAdapter = createPlayerAdapterFromEnv();
  const backend = new SpotifyBackend(spotifyApiClient, {
    playerAdapter,
    autoTransferToPlayer: parseBoolean(process.env.SPOTIFY_PLAYER_AUTO_TRANSFER, true),
  });
  const tui = new SpotifyTuiApp(backend);

  await tui.run();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start Spotify TUI: ${message}`);
  process.exit(1);
});

function createPlayerAdapterFromEnv(): LibrespotPlayerAdapter | undefined {
  const adapterType = (process.env.SPOTIFY_PLAYER_ADAPTER ?? "").trim().toLowerCase();
  if (!adapterType || adapterType === "none") {
    return undefined;
  }

  if (adapterType !== "librespot") {
    throw new Error(`Unsupported SPOTIFY_PLAYER_ADAPTER '${adapterType}'. Use 'librespot' or 'none'.`);
  }

  return new LibrespotPlayerAdapter();
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return defaultValue;
}
