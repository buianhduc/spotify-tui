import type { SelectOption } from "@opentui/core";

import { TABS } from "./browse.ts";
import type { BrowseSelectHandle, TabSelectHandle } from "../types.ts";

interface BrowsePanelProps {
  tabSelectRef: React.MutableRefObject<TabSelectHandle | null>;
  browseSelectRef: React.MutableRefObject<BrowseSelectHandle | null>;
  browseOptions: SelectOption[];
  browseSelectedIndex: number;
  focusTarget: "browse" | "search";
  onTabChange: () => void;
  onBrowseChange: () => void;
  onBrowseSelect: () => void;
}

// Render the navigation controls separately from the behavior that drives them.
export function BrowsePanel({
  tabSelectRef,
  browseSelectRef,
  browseOptions,
  browseSelectedIndex,
  focusTarget,
  onTabChange,
  onBrowseChange,
  onBrowseSelect,
}: BrowsePanelProps): React.ReactNode {
  return (
    <box
      width="40%"
      border
      borderStyle="single"
      borderColor="#3f3f46"
      title="Browse"
      flexDirection="column"
      padding={1}
      gap={1}
    >
      <tab-select
        ref={(instance) => {
          tabSelectRef.current = instance as unknown as TabSelectHandle | null;
        }}
        options={TABS}
        showDescription={false}
        showUnderline
        wrapSelection
        selectedBackgroundColor="#14532d"
        selectedTextColor="#ecfccb"
        focusedBackgroundColor="#0f172a"
        focusedTextColor="#e2e8f0"
        onChange={onTabChange}
      />

      <select
        ref={(instance) => {
          browseSelectRef.current = instance as unknown as BrowseSelectHandle | null;
        }}
        focused={focusTarget === "browse"}
        flexGrow={1}
        options={browseOptions}
        selectedIndex={browseSelectedIndex}
        wrapSelection
        showDescription
        selectedBackgroundColor="#1e293b"
        selectedTextColor="#f8fafc"
        focusedBackgroundColor="#0f172a"
        focusedTextColor="#cbd5e1"
        onChange={onBrowseChange}
        onSelect={onBrowseSelect}
      />
    </box>
  );
}
