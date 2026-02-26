# spotify-tui

Spotify terminal client with a modular architecture:
- `backend` is a reusable library for auth, Spotify API access, playback control, and user data.
- `tui` is a separate interface component that depends on backend APIs only.

## Architecture

```text
index.ts                         # app composition root
src/backend/
  index.ts                       # backend public exports
  models.ts                      # shared domain models
  ports.ts                       # backend interfaces and contracts
  events.ts                      # typed event emitter utility
  spotify-backend.ts             # orchestration service (library core)
  auth/
    client-secret-token-provider.ts   # refreshes access token via client id/secret
  player/
    librespot-player-adapter.ts  # local Spotify Connect player process adapter
  adapters/
    spotify-web-api-client.ts    # Spotify Web API adapter
src/tui/
  app.ts                         # OpenTUI full-screen frontend
  index.ts                       # TUI exports
```

## Why this split

- Backend can later power multiple interfaces (TUI, web, daemon, tests) with the same logic.
- TUI stays thin: it translates UI interactions to backend API calls and renders state.
- Adapters isolate external concerns (Spotify Web API, auth flow, future playback engines).

## Setup

1. Install dependencies:

```bash
bun install
```

2. Put Spotify OAuth credentials in `.env`:

```dotenv
SPOTIFY_CLIENT_ID="<spotify-client-id>"
SPOTIFY_CLIENT_SECRET="<spotify-client-secret>"
SPOTIFY_REFRESH_TOKEN="<spotify-refresh-token>"
SPOTIFY_PLAYER_ADAPTER="librespot"
```

Optional:
- `SPOTIFY_REDIRECT_URI`: defaults to `http://127.0.0.1:8888/callback` and must match your Spotify app settings.
- `SPOTIFY_AUTH_SCOPES`: override default scopes used for the initial auth flow (include `user-library-read` if you want `Liked Songs` in playlists).
- `SPOTIFY_PLAYER_AUTO_TRANSFER`: `true` by default; auto-transfer playback to the player device during startup.
- `SPOTIFY_PLAYER_DEVICE_NAME`: defaults to `spotify-tui`.
- `SPOTIFY_PLAYER_COMMAND`: defaults to `librespot`.
- `SPOTIFY_PLAYER_ARGS`: extra args passed to the player command.
- `SPOTIFY_PLAYER_USERNAME` / `SPOTIFY_PLAYER_PASSWORD`: optional player login args for librespot.

`index.ts` auto-loads `.env` on startup. If `SPOTIFY_REFRESH_TOKEN` is missing, the app prints an authorization URL, asks you to paste back the redirected URL/code, then keeps the fetched refresh token in memory for the current run.
If `SPOTIFY_PLAYER_ADAPTER=librespot`, ensure `librespot` is installed and available on `PATH`.

3. Start the TUI:

```bash
bun run start
```

## OpenTUI controls

- `Ctrl+Q`: quit
- `Ctrl+P`: play/pause
- `Ctrl+N`: next track
- `Ctrl+B`: previous track
- `Ctrl+R`: refresh state
- `1` / `2` / `3` / `4`: switch tabs (Now, Playlists, Devices, Search)
- `/`: focus search input
- `Tab`: toggle focus between search and browse list
- `Enter` on list item: run action (play playlist, transfer device, play track, etc.)

## Playlists tab

- Includes your playlists and a synthetic `Liked Songs` entry (from your saved tracks), which plays via `spotify:collection:tracks`.

## Details pane

- Right side is split into `Current Album Cover` (uses kitty graphics when supported, otherwise `ghostty-opentui` ANSI rendering) and `Now Playing` (track/album/device metadata + progress + library snapshot).

## Next implementation milestones

- Persist refresh token securely between runs instead of in-memory only.
- Add queue, seek, shuffle/repeat controls, and richer browsing.
- Expand the full-screen TUI with richer panels and interactive queue/library views.
- Add test doubles for `MusicApiClient` and unit tests for backend orchestration.
