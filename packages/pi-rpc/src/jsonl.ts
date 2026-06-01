/**
 * Split a buffer into JSONL records using LF only (Pi RPC protocol).
 * Strips trailing CR from each line. Does not use readline.
 */
export function splitJsonlLines(buffer: string): { lines: string[]; remainder: string } {
  const lines: string[] = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === "\n") {
      let line = buffer.slice(start, i);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      if (line.length > 0) {
        lines.push(line);
      }
      start = i + 1;
    }
  }

  return { lines, remainder: buffer.slice(start) };
}
