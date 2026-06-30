import type { ReactElement } from "react";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { formatFileMention } from "../../lib/file-mention";
import { FileMentionChip } from "../FileMentionChip";

export type SerializedMentionNode = Spread<
  {
    type: "mention";
    version: 1;
    segmentId: string;
    relativePath: string;
    absolutePath?: string;
    rootLabel?: string;
  },
  SerializedLexicalNode
>;

export type MentionNodePayload = {
  segmentId: string;
  relativePath: string;
  absolutePath?: string;
  rootLabel?: string;
};

export class MentionNode extends DecoratorNode<ReactElement> {
  __segmentId: string;
  __relativePath: string;
  __absolutePath?: string;
  __rootLabel?: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      {
        segmentId: node.__segmentId,
        relativePath: node.__relativePath,
        absolutePath: node.__absolutePath,
        rootLabel: node.__rootLabel,
      },
      node.__key,
    );
  }

  constructor(payload: MentionNodePayload, key?: NodeKey) {
    super(key);
    this.__segmentId = payload.segmentId;
    this.__relativePath = payload.relativePath;
    this.__absolutePath = payload.absolutePath;
    this.__rootLabel = payload.rootLabel;
  }

  getSegmentId(): string {
    return this.__segmentId;
  }

  getRelativePath(): string {
    return this.__relativePath;
  }

  getAbsolutePath(): string | undefined {
    return this.__absolutePath;
  }

  getRootLabel(): string | undefined {
    return this.__rootLabel;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = "lexical-mention-node";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getTextContent(): string {
    return `${formatFileMention(this.__relativePath)} `;
  }

  decorate(): ReactElement {
    return <FileMentionChip relativePath={this.__relativePath} />;
  }

  exportJSON(): SerializedMentionNode {
    return {
      type: "mention",
      version: 1,
      segmentId: this.__segmentId,
      relativePath: this.__relativePath,
      ...(this.__absolutePath ? { absolutePath: this.__absolutePath } : {}),
      ...(this.__rootLabel ? { rootLabel: this.__rootLabel } : {}),
    };
  }

  static importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode({
      segmentId: serialized.segmentId,
      relativePath: serialized.relativePath,
      absolutePath: serialized.absolutePath,
      rootLabel: serialized.rootLabel,
    });
  }
}

export function $createMentionNode(payload: MentionNodePayload): MentionNode {
  return $applyNodeReplacement(new MentionNode(payload));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
