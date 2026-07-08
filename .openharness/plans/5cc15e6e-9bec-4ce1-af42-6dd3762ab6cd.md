# Plan: Inline AI response actions with Copy and Fork

## Goal

Add always-visible inline action buttons under every completed assistant response:

- **Copy** copies the assistant response as raw markdown.
- **Fork** instantly creates a new conversation branch that includes history through that exact assistant response, switches the active chat to the fork, and keeps the original conversation available in the sidebar.

## Confirmed product decisions

- Buttons appear under completed AI responses only; they are hidden while a response is streaming.
- Buttons are always visible and subtle, matching the reference style.
- Copy uses raw markdown from the assistant message.
- Fork means “continue after this AI response,” not “retry the previous prompt.”
- Fork switches immediately to the new forked conversation.
- The forked conversation reuses the original conversation title.
- No confirmation dialog; show a brief success/failure status.
- If a response cannot provide a stable Pi entry ID, show Copy only and hide/disable Fork quietly.

## Key technical findings

- Timeline rendering is centralized in `apps/desktop/src/renderer/src/components/timeline/TimelineRows.tsx`.
- Assistant timeline items currently contain only `{ kind, id, content, streaming }` in `apps/desktop/src/renderer/src/events.ts`.
- Restored messages are converted by `apps/desktop/src/renderer/src/lib/messages-to-timeline.ts`, but current `get_messages` returns Pi messages without stable session entry IDs.
- Pi already has internal support for `runtimeHost.fork(entryId, { position: "at" })`, used by clone/current-leaf behavior, but RPC only exposes:
  - `fork(entryId)` with default `position: "before"`, intended for user-message retry.
  - `clone`, limited to the current leaf.
  - `get_fork_messages`, limited to user messages.
- To fork from every historical assistant response, OpenHarness needs a small Pi RPC extension that exposes assistant message entry IDs and forks at a selected entry.

## Implementation steps

### 1. Extend Pi RPC protocol for assistant-entry forking

Files:

- `vendor/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts`
- `vendor/pi/packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- `packages/pi-rpc/src/types.ts`

Add RPC support for:

```ts
{ type: "fork_at_entry"; entryId: string }
```

Response:

```ts
{ command: "fork_at_entry"; success: true; data: { cancelled: boolean } }
```

Implementation behavior:

- Call `runtimeHost.fork(entryId, { position: "at" })`.
- On success, rebind the RPC session just like existing `fork` and `clone` handlers.
- Return an error for invalid entry IDs or active streaming state.

Also add a way to get stable entry IDs for displayable messages. Preferred approach:

```ts
{ type: "get_messages_with_entry_ids" }
```

Response data:

```ts
{
  messages: Array<AgentMessage & { entryId?: string }>;
}
```

Notes:

- Preserve existing `get_messages` for backward compatibility.
- For message session entries, attach `entryId: entry.id`.
- Non-message/custom/summary messages can omit `entryId` unless already represented by a stable entry.
- The UI only requires `entryId` on assistant messages for Fork.

### 2. Expose fork APIs through OpenHarness main/preload

Files:

- `apps/desktop/src/main/pi-service.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/api.ts`

Add main service methods:

```ts
getMessagesWithEntryIds(sessionKey: string): Promise<unknown[] | null>
forkAtEntry(sessionKey: string, entryId: string): Promise<{
  success: boolean;
  data?: {
    cancelled: boolean;
    sessionFile?: string;
    sessionKey?: string;
    messages?: unknown[] | null;
  };
  error?: string;
}>
```

Behavior:

- `getMessagesWithEntryIds` should try `get_messages_with_entry_ids`, falling back to current `get_messages` if unsupported.
- `forkAtEntry` should enqueue against the session runtime, call `fork_at_entry`, then fetch state/messages after rebind.
- Reuse existing `getState` rekey behavior so returned `sessionKey` reflects the new forked session file.
- Reject or return a clear failure if the session is streaming.

Expose renderer API methods:

```ts
window.harness.getMessagesWithEntryIds({ sessionKey })
window.harness.forkAtEntry({ sessionKey, entryId })
```

### 3. Carry Pi entry IDs into timeline items

Files:

- `apps/desktop/src/renderer/src/events.ts`
- `apps/desktop/src/renderer/src/lib/messages-to-timeline.ts`

Update types:

```ts
interface AssistantItem {
  kind: "assistant";
  id: string;
  content: string;
  streaming?: boolean;
  entryId?: string;
}
```

In `messages-to-timeline.ts`:

- Read optional `entryId` from restored Pi messages.
- Attach it to assistant timeline items.
- Keep current behavior when absent.

For live streaming responses:

- The assistant item will not initially have an entry ID.
- After completion, the normal post-run sync should refresh messages/state and rebuild or update the timeline with entry IDs.
- If not already reliable, add an explicit post-response refresh using `getMessagesWithEntryIds` after `agent_end` / prompt completion.

### 4. Add inline assistant action component

Files:

- New component, e.g. `apps/desktop/src/renderer/src/components/timeline/AssistantMessageActions.tsx`
- `apps/desktop/src/renderer/src/components/timeline/TimelineRows.tsx`
- Relevant renderer CSS file(s)

Component responsibilities:

- Render two small icon buttons under completed assistant messages:
  - Copy: use `navigator.clipboard.writeText(item.content)`.
  - Fork: call parent `onForkAssistantMessage(item.entryId)`.
- Hide the whole action row while `item.streaming` is true.
- Show Copy even when `entryId` is missing.
- Show Fork only when `entryId` exists and the current runtime is connected/not streaming.
- Use accessible labels/titles: `Copy response`, `Fork from here`.
- Use Hugeicons where available, likely `Copy01Icon` and a branch/fork icon from `@hugeicons/core-free-icons`.
- Provide local copied/forking visual state for ~2 seconds.

`TimelineRows.tsx` currently renders rows through a pure `renderTimelineRows(items, isStreaming)` function. Update it to accept optional callbacks/config:

```ts
renderTimelineRows(items, isStreaming, {
  onForkAssistantMessage,
  forkDisabled,
})
```

Then render actions directly below assistant markdown content.

### 5. Wire fork behavior in `App.tsx`

File:

- `apps/desktop/src/renderer/src/App.tsx`

Add handler:

```ts
async function handleForkAssistantMessage(entryId: string): Promise<void>
```

Flow:

1. Get active runtime; bail if missing, disconnected, or streaming.
2. Persist/snapshot the original conversation before forking so it remains in the sidebar.
3. Call `window.harness.forkAtEntry({ sessionKey: runtime.sessionKey, entryId })`.
4. If cancelled, show non-disruptive status and do nothing else.
5. Create a new `conversationId` with `crypto.randomUUID()`.
6. Build a new fork runtime using returned `sessionFile`, `sessionKey`, and messages:
   - `title`: original runtime title.
   - `timeline`: `messagesToTimeline(returnedMessages)`.
   - `status`: `connected`.
   - preserve `cwd`, `context`, `attachedRoots`, and relevant mode flags where safe.
7. Mark the original runtime disconnected/stale, or remove it from the open runtime map after persisting it. Reopening it should start from the original `sessionFile`.
8. Insert the fork runtime into `runtimesRef.current` under the new conversation ID.
9. Set active conversation to the fork.
10. Persist the forked conversation row with the new conversation ID and new session file.
11. Refresh sidebar project/conversation lists.
12. Show a brief success status such as `Forked conversation`.

Important invariant:

- Do not overwrite the original conversation row with the new fork session file.
- The original conversation and the fork must have distinct local conversation IDs and distinct Pi session files.

### 6. Prefer entry-ID-aware message loading everywhere relevant

Files:

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/lib/chat-storage.ts` only if type adjustments are needed

Replace active-session restore/sync calls that feed `messagesToTimeline` with `getMessagesWithEntryIds` where possible:

- Opening existing conversations.
- Post-prompt persistence/sync.
- Fork creation response.

Fallback to current stored messages when the new RPC command is unavailable.

### 7. Styling

Add CSS for a subtle action row similar to the reference:

- Horizontal row aligned under assistant content.
- Small gray icon buttons, no heavy border.
- Hover/focus states with stronger foreground/background.
- Disabled/forking state.
- Does not affect markdown layout or code block copy buttons.
- Keyboard focus visible.

Potential classes:

```css
.assistant-message-actions
.assistant-message-action-button
.assistant-message-action-button-active
```

### 8. Tests

Add/update tests where practical:

1. `messages-to-timeline` unit test:
   - assistant message with `entryId` becomes `AssistantItem.entryId`.
   - assistant message without `entryId` still renders normally.

2. Main/Pi service behavior test if existing harness allows mocking `PiRpcClient.send`:
   - `forkAtEntry` sends `fork_at_entry` with the expected `entryId`.
   - returned state causes session rekey and includes new `sessionFile`.

3. Renderer component test if test infra exists:
   - completed assistant response shows Copy and Fork when `entryId` is present.
   - streaming assistant response shows no actions.
   - missing `entryId` shows Copy only.

4. Manual QA:
   - Start a multi-turn chat.
   - Verify each completed assistant response shows Copy/Fork.
   - Copy produces raw markdown.
   - Fork an older assistant response.
   - Verify the new active conversation includes history only through that response.
   - Verify original conversation remains in sidebar and can be reopened.
   - Send a new message in the fork and verify original is unchanged.
   - Try with an older/stored conversation missing entry IDs; Fork should be hidden while Copy remains.

Commands:

```bash
pnpm --filter desktop test
pnpm --filter desktop typecheck
pnpm typecheck
```

Run focused tests first, then broader typecheck.

## Failure modes and mitigations

- **Fork mutates the original runtime:** snapshot and persist the original before fork, then create a new renderer runtime/conversation ID for the fork.
- **Entry IDs missing for old sessions:** hide Fork and keep Copy available.
- **Fork during streaming:** hide actions while streaming and reject in main as defense-in-depth.
- **RPC command unavailable during dev/vendor mismatch:** fallback for message loading; Fork unavailable if `fork_at_entry` fails with unknown command.
- **Stale session key after fork:** fetch state immediately after fork and use existing rekey logic.
- **Original/fork sidebar collision:** persist fork under a new local conversation ID and new session file; do not update original row with fork data.

## Documentation / project memory updates after implementation

If implemented, update `.openharness/features.md` to mention:

- Assistant response actions under timeline rendering.
- Forking uses Pi RPC `fork_at_entry` and entry-ID-aware message loading.

Update `.openharness/architecture.md` if the new RPC command becomes a durable protocol boundary.

No `.openharness` files should be edited during planning; update them only when implementation lands.