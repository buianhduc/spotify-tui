import { useKeyboard } from "@opentui/react";

import type { TuiKeyEvent } from "../types.ts";

// Hide the OpenTUI renderer type mismatch behind a stable structural keyboard event.
export function useGlobalKeyboard(handler: (key: TuiKeyEvent) => void): void {
  useKeyboard((key) => {
    handler(key as unknown as TuiKeyEvent);
  });
}
