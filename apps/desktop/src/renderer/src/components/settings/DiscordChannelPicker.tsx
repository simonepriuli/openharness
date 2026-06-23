import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscordChannelSummary } from "../../../../preload/api";

type DiscordChannelPickerProps = {
  open: boolean;
  channels: DiscordChannelSummary[];
  channelId: string;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChannelChange: (channelId: string) => void;
};

export function DiscordChannelPicker({
  open,
  channels,
  channelId,
  loading,
  error,
  onClose,
  onChannelChange,
}: DiscordChannelPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose, open]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((channel) => channel.name.toLowerCase().includes(q));
  }, [channels, query]);

  const selectChannel = (id: string) => {
    onChannelChange(id);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="workflow-repo-picker workflow-branch-picker"
      role="dialog"
      aria-label="Select channel"
    >
      <div className="workflow-repo-picker-search-wrap">
        <input
          type="search"
          className="workflow-repo-picker-search"
          placeholder="Search channels…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="workflow-repo-picker-scroll">
        <section className="workflow-repo-picker-section">
          {loading ? (
            <p className="workflow-repo-picker-empty">Loading channels…</p>
          ) : error ? (
            <p className="workflow-repo-picker-empty workflow-repo-picker-error">{error}</p>
          ) : filteredChannels.length === 0 ? (
            <p className="workflow-repo-picker-empty">No channels found.</p>
          ) : (
            filteredChannels.map((channel) => {
              const selected = channel.id === channelId;
              return (
                <button
                  key={channel.id}
                  type="button"
                  className={`workflow-repo-picker-item${
                    selected ? " workflow-repo-picker-item-selected" : ""
                  }`}
                  onClick={() => selectChannel(channel.id)}
                >
                  <span>#{channel.name}</span>
                </button>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
