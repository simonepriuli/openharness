interface ImageAttachmentChipProps {
  previewUrl: string;
  mimeType: string;
  onRemove: () => void;
}

export function ImageAttachmentChip({ previewUrl, mimeType, onRemove }: ImageAttachmentChipProps) {
  return (
    <span className="composer-image-chip" contentEditable={false}>
      <img className="composer-image-chip-thumb" src={previewUrl} alt="" />
      <span className="composer-image-chip-type" aria-hidden>
        {mimeType.replace("image/", "").toUpperCase()}
      </span>
      <button
        type="button"
        className="composer-image-chip-remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        aria-label="Remove image"
      >
        ×
      </button>
    </span>
  );
}
