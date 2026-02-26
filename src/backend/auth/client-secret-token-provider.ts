import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

import type { TokenProvider } from "../ports.ts";

const DEFAULT_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

interface SpotifyTokenSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface SpotifyTokenErrorResponse {
  error?: string;
  error_description?: string;
}

interface ClientSecretTokenProviderOptions {
  clientIdEnvVarName?: string;
  clientSecretEnvVarName?: string;
  refreshTokenEnvVarName?: string;
  redirectUriEnvVarName?: string;
  scopesEnvVarName?: string;
  accountsBaseUrl?: string;
}

export class ClientSecretTokenProvider implements TokenProvider {
  private cachedAccessToken: string | null = null;
  private expiresAtMs = 0;
  private inFlightTokenRequest: Promise<string> | null = null;
  private refreshToken: string | null = null;

  private readonly clientIdEnvVarName: string;
  private readonly clientSecretEnvVarName: string;
  private readonly refreshTokenEnvVarName: string;
  private readonly redirectUriEnvVarName: string;
  private readonly scopesEnvVarName: string;
  private readonly accountsBaseUrl: string;

  constructor(options: ClientSecretTokenProviderOptions = {}) {
    this.clientIdEnvVarName = options.clientIdEnvVarName ?? "SPOTIFY_CLIENT_ID";
    this.clientSecretEnvVarName = options.clientSecretEnvVarName ?? "SPOTIFY_CLIENT_SECRET";
    this.refreshTokenEnvVarName = options.refreshTokenEnvVarName ?? "SPOTIFY_REFRESH_TOKEN";
    this.redirectUriEnvVarName = options.redirectUriEnvVarName ?? "SPOTIFY_REDIRECT_URI";
    this.scopesEnvVarName = options.scopesEnvVarName ?? "SPOTIFY_AUTH_SCOPES";
    this.accountsBaseUrl = options.accountsBaseUrl ?? "https://accounts.spotify.com";
    this.refreshToken = process.env[this.refreshTokenEnvVarName] ?? null;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && now < this.expiresAtMs - 30_000) {
      return this.cachedAccessToken;
    }

    if (!this.inFlightTokenRequest) {
      this.inFlightTokenRequest = this.issueAccessToken();
    }

    try {
      return await this.inFlightTokenRequest;
    } finally {
      this.inFlightTokenRequest = null;
    }
  }

  private async issueAccessToken(): Promise<string> {
    const credentials = this.getClientCredentials();

    const tokenResponse = this.refreshToken
      ? await this.fetchRefreshedAccessToken(credentials.clientId, credentials.clientSecret)
      : await this.bootstrapFromAuthorizationCode(credentials.clientId, credentials.clientSecret);

    this.cachedAccessToken = tokenResponse.access_token;
    this.expiresAtMs = Date.now() + tokenResponse.expires_in * 1000;

    if (tokenResponse.refresh_token) {
      this.refreshToken = tokenResponse.refresh_token;
    }

    return tokenResponse.access_token;
  }

  private getClientCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env[this.clientIdEnvVarName];
    const clientSecret = process.env[this.clientSecretEnvVarName];

    if (!clientId) {
      throw new Error(`Missing ${this.clientIdEnvVarName}.`);
    }

    if (!clientSecret) {
      throw new Error(`Missing ${this.clientSecretEnvVarName}.`);
    }

    return { clientId, clientSecret };
  }

  private async fetchRefreshedAccessToken(
    clientId: string,
    clientSecret: string,
  ): Promise<SpotifyTokenSuccessResponse> {
    if (!this.refreshToken) {
      throw new Error("Refresh token was unexpectedly empty.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
    });

    return this.requestToken(clientId, clientSecret, body);
  }

  private async bootstrapFromAuthorizationCode(
    clientId: string,
    clientSecret: string,
  ): Promise<SpotifyTokenSuccessResponse> {
    const redirectUri = process.env[this.redirectUriEnvVarName] ?? "http://127.0.0.1:8888/callback";
    const scopes = process.env[this.scopesEnvVarName] ?? DEFAULT_SCOPES;
    const state = randomBytes(12).toString("hex");

    const authUrl = new URL(`${this.accountsBaseUrl}/authorize`);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("show_dialog", "true");

    console.log("No Spotify refresh token found, starting one-time authorization flow.");
    console.log(`Open this URL in your browser and approve access:\n${authUrl.toString()}\n`);
    console.log(`Make sure '${redirectUri}' is listed as a redirect URI in your Spotify app settings.`);

    const rawInput = await promptForInput("Paste the full redirected URL (or just the code): ");
    const parsed = parseAuthorizationInput(rawInput);

    if (!parsed.code) {
      throw new Error("Authorization code missing from input.");
    }

    if (parsed.state && parsed.state !== state) {
      throw new Error("Authorization state mismatch. Retry login to avoid CSRF issues.");
    }

    const tokenResponse = await this.requestToken(
      clientId,
      clientSecret,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: parsed.code,
        redirect_uri: redirectUri,
      }),
    );

    if (!tokenResponse.refresh_token) {
      throw new Error("Spotify did not return a refresh token.");
    }

    this.refreshToken = tokenResponse.refresh_token;
    console.log("Refresh token obtained and saved in memory for this session.");
    return tokenResponse;
  }

  private async requestToken(
    clientId: string,
    clientSecret: string,
    body: URLSearchParams,
  ): Promise<SpotifyTokenSuccessResponse> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch(`${this.accountsBaseUrl}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const details = await parseTokenError(response);
      throw new Error(`Failed to get Spotify access token (${response.status}): ${details}`);
    }

    const json = (await response.json()) as SpotifyTokenSuccessResponse;
    if (!json.access_token || !json.expires_in) {
      throw new Error("Spotify token endpoint returned an invalid response.");
    }

    return json;
  }
}

function parseAuthorizationInput(input: string): { code: string | null; state: string | null } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { code: null, state: null };
  }

  try {
    const url = new URL(trimmed);
    return {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    };
  } catch {
    return {
      code: trimmed,
      state: null,
    };
  }
}

async function promptForInput(question: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

async function parseTokenError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as SpotifyTokenErrorResponse;
    return body.error_description ?? body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
