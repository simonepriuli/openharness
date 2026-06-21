export function extractWorkflowFailure(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string; content?: unknown };
    if (message.role !== "assistant") continue;

    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .map((part) => {
                if (!part || typeof part !== "object") return "";
                const block = part as { type?: string; text?: string };
                return block.type === "text" && typeof block.text === "string" ? block.text : "";
              })
              .join("\n")
          : "";

    if (text.startsWith("Workflow failed:")) {
      return text.replace(/^Workflow failed:\s*/, "").trim();
    }
  }

  return null;
}
