interface HeaderPanelProps {
  headerText: string;
}

// Keep the top summary isolated so app state changes do not clutter layout code.
export function HeaderPanel({ headerText }: HeaderPanelProps): React.ReactNode {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor="#3f3f46"
      title="Spotify TUI"
      height={4}
      paddingX={1}
      paddingY={0}
    >
      <text fg="#fafafa">{headerText}</text>
    </box>
  );
}
