import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EnvLoadResult {
  path: string;
  loadedKeys: string[];
}

export function loadEnvFile(filePath = ".env"): EnvLoadResult {
  const resolvedPath = resolve(process.cwd(), filePath);
  if (!existsSync(resolvedPath)) {
    return { path: resolvedPath, loadedKeys: [] };
  }

  const content = readFileSync(resolvedPath, "utf8");
  const loadedKeys: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = stripQuotes(rawValue);
    process.env[key] = value;
    loadedKeys.push(key);
  }

  return { path: resolvedPath, loadedKeys };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
