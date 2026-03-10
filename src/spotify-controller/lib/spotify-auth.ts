import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

const DEFAULT_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

WebBrowser.maybeCompleteAuthSession();

interface SpotifyTokenSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  accountsBaseUrl: string;
}

export interface SpotifyAuthResult {
  refreshToken: string;
  accessToken: string;
  expiresInSeconds: number;
}

// Open Spotify authorization in the system browser, then exchange the callback code for tokens.
export async function authenticateWithSpotify(): Promise<SpotifyAuthResult> {
  const config = getAuthConfig();
  const state = createState();

  const authUrl = new URL("/authorize", config.accountsBaseUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", config.scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("show_dialog", "true");

  const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), config.redirectUri);

  if (result.type !== "success" || !result.url) {
    throw new Error("Authentication was cancelled before completion.");
  }

  const callbackUrl = new URL(result.url);
  const callbackError = callbackUrl.searchParams.get("error");
  if (callbackError) {
    const description = callbackUrl.searchParams.get("error_description");
    throw new Error(description ?? callbackError);
  }

  const returnedState = callbackUrl.searchParams.get("state");
  if (!returnedState || returnedState !== state) {
    throw new Error("Authorization state mismatch. Please try again.");
  }

  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    throw new Error("Authorization code was not returned by Spotify.");
  }

  const tokens = await exchangeAuthorizationCode(config, code);
  if (!tokens.refresh_token) {
    throw new Error("Spotify did not return a refresh token.");
  }

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresInSeconds: tokens.expires_in,
  };
}

export function getAuthConfig(): AuthConfig {
  const clientId = readEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = readEnv("SPOTIFY_CLIENT_SECRET");
  const redirectUri = readEnv("SPOTIFY_REDIRECT_URI") ?? Linking.createURL("spotify-auth-callback");
  const scopes = readEnv("SPOTIFY_AUTH_SCOPES") ?? DEFAULT_SCOPES;
  const accountsBaseUrl = readEnv("SPOTIFY_ACCOUNTS_BASE_URL") ?? "https://accounts.spotify.com";

  if (!clientId) {
    throw new Error("Missing SPOTIFY_CLIENT_ID (or EXPO_PUBLIC_SPOTIFY_CLIENT_ID).");
  }

  if (!clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_SECRET (or EXPO_PUBLIC_SPOTIFY_CLIENT_SECRET).");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    accountsBaseUrl,
  };
}

function readEnv(name: string): string | undefined {
  const publicName = `EXPO_PUBLIC_${name}`;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

  const value =
    process.env[publicName] ??
    process.env[name] ??
    (typeof extra[publicName] === "string" ? extra[publicName] : undefined) ??
    (typeof extra[name] === "string" ? extra[name] : undefined);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function exchangeAuthorizationCode(
  config: AuthConfig,
  code: string,
): Promise<SpotifyTokenSuccessResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
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
    throw new Error(`Token exchange failed (${response.status}): ${await parseTokenError(response)}`);
  }

  const json = (await response.json()) as SpotifyTokenSuccessResponse;
  if (!json.access_token || !json.expires_in) {
    throw new Error("Spotify token endpoint returned an invalid response.");
  }

  return json;
}

function createState(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function parseTokenError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; error_description?: string };
    return body.error_description ?? body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
