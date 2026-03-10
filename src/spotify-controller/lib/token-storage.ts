import { File, Paths } from "expo-file-system";

const TOKEN_FILE = new File(Paths.document, "spotify-refresh-token.json");

interface StoredTokenPayload {
  refreshToken: string;
  savedAt: string;
}

// Persist the refresh token inside the app document directory so it survives restarts.
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const payload: StoredTokenPayload = {
    refreshToken,
    savedAt: new Date().toISOString(),
  };

  TOKEN_FILE.create({ intermediates: true, overwrite: true });
  TOKEN_FILE.write(JSON.stringify(payload), { append: false });
}

export async function loadRefreshToken(): Promise<string | null> {
  if (!TOKEN_FILE.exists) {
    return null;
  }

  const raw = await TOKEN_FILE.text();
  if (!raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokenPayload>;
    return typeof parsed.refreshToken === "string" && parsed.refreshToken.length > 0
      ? parsed.refreshToken
      : null;
  } catch {
    return null;
  }
}
