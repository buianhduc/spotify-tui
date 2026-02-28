import { DEFAULT_HINTS } from "./layout.ts";
import type { SearchInputHandle } from "../types.ts";

interface ControlsPanelProps {
  searchInputRef: React.MutableRefObject<SearchInputHandle | null>;
  focusTarget: "browse" | "search";
  statusMessage: string;
  onSearchSubmit: () => void;
}

// Footer actions stay presentational so the controller owns the command flow.
export function ControlsPanel({
  searchInputRef,
  focusTarget,
  statusMessage,
  onSearchSubmit,
}: ControlsPanelProps): React.ReactNode {
  return (
    <box
      border
      borderStyle="single"
      borderColor="#3f3f46"
      title="Controls"
      flexDirection="column"
      height={6}
      paddingX={1}
      paddingY={0}
    >
      <text fg="#a1a1aa">{DEFAULT_HINTS}</text>
      <input
        ref={(instance) => {
          searchInputRef.current = instance as unknown as SearchInputHandle | null;
        }}
        focused={focusTarget === "search"}
        placeholder="Search track, press Enter"
        width="100%"
        onSubmit={onSearchSubmit}
      />
      <text fg="#d4d4d8">{`Status: ${statusMessage}`}</text>
    </box>
  );
}
