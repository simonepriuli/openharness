import type { ReactElement } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $applyNodeReplacement,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { ToolSection } from "../../../../shared/thread-tools";
import { formatToolToken } from "../../../../shared/thread-tools";
import type { ToolSegment } from "../../lib/composer-draft";
import { ToolChip } from "../ToolChip";
import { useComposerChipActions } from "./ComposerChipActionsContext";

export type SerializedToolNode = Spread<
  {
    type: "tool";
    version: 1;
    segmentId: string;
    toolId: string;
    label: string;
    section: ToolSection;
    filePath?: string;
    baseDir?: string;
  },
  SerializedLexicalNode
>;

export type ToolNodePayload = {
  segmentId: string;
  toolId: string;
  label: string;
  section: ToolSection;
  filePath?: string;
  baseDir?: string;
};

function ToolChipDecorator({ node }: { node: ToolNode }) {
  const [editor] = useLexicalComposerContext();
  const { onRemoveTool } = useComposerChipActions();

  const handleRemove = () => {
    const segment: ToolSegment = {
      type: "tool",
      id: node.getSegmentId(),
      toolId: node.getToolId(),
      label: node.getLabel(),
      section: node.getSection(),
      ...(node.getFilePath() ? { filePath: node.getFilePath() } : {}),
      ...(node.getBaseDir() ? { baseDir: node.getBaseDir() } : {}),
    };

    editor.update(() => {
      node.remove();
    });
    onRemoveTool?.(segment);
  };

  return (
    <ToolChip
      label={node.getLabel()}
      section={node.getSection()}
      toolId={node.getToolId()}
      onRemove={onRemoveTool ? handleRemove : undefined}
    />
  );
}

export class ToolNode extends DecoratorNode<ReactElement> {
  __segmentId: string;
  __toolId: string;
  __label: string;
  __section: ToolSection;
  __filePath?: string;
  __baseDir?: string;

  static getType(): string {
    return "tool";
  }

  static clone(node: ToolNode): ToolNode {
    return new ToolNode(
      {
        segmentId: node.__segmentId,
        toolId: node.__toolId,
        label: node.__label,
        section: node.__section,
        filePath: node.__filePath,
        baseDir: node.__baseDir,
      },
      node.__key,
    );
  }

  constructor(payload: ToolNodePayload, key?: NodeKey) {
    super(key);
    this.__segmentId = payload.segmentId;
    this.__toolId = payload.toolId;
    this.__label = payload.label;
    this.__section = payload.section;
    this.__filePath = payload.filePath;
    this.__baseDir = payload.baseDir;
  }

  getSegmentId(): string {
    return this.__segmentId;
  }

  getToolId(): string {
    return this.__toolId;
  }

  getLabel(): string {
    return this.__label;
  }

  getSection(): ToolSection {
    return this.__section;
  }

  getFilePath(): string | undefined {
    return this.__filePath;
  }

  getBaseDir(): string | undefined {
    return this.__baseDir;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className = "lexical-tool-node";
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
    return `${formatToolToken(this.__toolId)} `;
  }

  decorate(): ReactElement {
    return <ToolChipDecorator node={this} />;
  }

  exportJSON(): SerializedToolNode {
    return {
      type: "tool",
      version: 1,
      segmentId: this.__segmentId,
      toolId: this.__toolId,
      label: this.__label,
      section: this.__section,
      ...(this.__filePath ? { filePath: this.__filePath } : {}),
      ...(this.__baseDir ? { baseDir: this.__baseDir } : {}),
    };
  }

  static importJSON(serialized: SerializedToolNode): ToolNode {
    return $createToolNode({
      segmentId: serialized.segmentId,
      toolId: serialized.toolId,
      label: serialized.label,
      section: serialized.section,
      filePath: serialized.filePath,
      baseDir: serialized.baseDir,
    });
  }
}

export function $createToolNode(payload: ToolNodePayload): ToolNode {
  return $applyNodeReplacement(new ToolNode(payload));
}

export function $isToolNode(node: LexicalNode | null | undefined): node is ToolNode {
  return node instanceof ToolNode;
}
