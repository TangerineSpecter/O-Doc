export interface ImageUploadLimitConfig {
  maxLongEdge: number;
  maxFileSizeMb: number;
}

export interface ImageSizeInfo {
  width: number;
  height: number;
  fileSize: number;
}

export type ResizeMode = 'long-edge' | '3:2' | '16:9';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeQueueState<T> {
  items: T[];
  total: number;
}

const IMAGE_FILE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|heic|heif|tif{1,2})$/i;

export interface FileTransferLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile: () => File | null }> | null;
}

export const isImageUploadFile = (file: File) => (
  file.type.startsWith('image/') || IMAGE_FILE_EXTENSION.test(file.name)
);

export const getProcessedImageOutput = (file: File) => {
  const namedPng = /\.png$/i.test(file.name);
  const keepPng = file.type === 'image/png' || (!file.type && namedPng);
  return keepPng
    ? { type: 'image/png' as const, extension: 'png' as const }
    : { type: 'image/jpeg' as const, extension: 'jpg' as const };
};

export const resolvePhotoDropAction = (
  draggedIndex: number | null,
  droppedFiles: File[],
): { type: 'reorder' } | { type: 'add'; files: File[] } | { type: 'none' } => {
  if (draggedIndex !== null) return { type: 'reorder' };
  if (droppedFiles.length) return { type: 'add', files: droppedFiles };
  return { type: 'none' };
};

export const collectDroppedFiles = (transfer: FileTransferLike) => {
  const fromItems: File[] = [];
  if (transfer.items) {
    for (const item of Array.from(transfer.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) fromItems.push(file);
    }
  }
  const fromFiles = transfer.files ? Array.from(transfer.files) : [];
  const source = fromItems.length >= fromFiles.length ? fromItems : fromFiles;
  const seen = new Set<string>();
  return source.filter(file => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const imageExceedsUploadLimit = (
  image: ImageSizeInfo,
  config: ImageUploadLimitConfig,
) => {
  const exceedsLongEdge = Math.max(image.width, image.height) > config.maxLongEdge;
  const exceedsSize = image.fileSize > config.maxFileSizeMb * 1024 * 1024;
  return exceedsLongEdge || exceedsSize;
};

export const classifyImageUploads = <T extends ImageSizeInfo>(
  items: T[],
  config: ImageUploadLimitConfig,
) => {
  const ready: T[] = [];
  const needsResize: T[] = [];
  for (const item of items) {
    if (imageExceedsUploadLimit(item, config)) needsResize.push(item);
    else ready.push(item);
  }
  return { ready, needsResize };
};

export const getResizeDrawSource = (
  mode: ResizeMode,
  cropRect: CropRect,
  naturalWidth: number,
  naturalHeight: number,
) => {
  if (mode === 'long-edge') {
    return { sx: 0, sy: 0, sw: naturalWidth, sh: naturalHeight };
  }
  return {
    sx: naturalWidth * cropRect.x / 100,
    sy: naturalHeight * cropRect.y / 100,
    sw: naturalWidth * cropRect.width / 100,
    sh: naturalHeight * cropRect.height / 100,
  };
};

export const emptyResizeQueue = <T,>(): ResizeQueueState<T> => ({ items: [], total: 0 });

export const enqueueResizeItems = <T,>(
  current: ResizeQueueState<T>,
  additions: T[],
): ResizeQueueState<T> => {
  if (!additions.length) return current;
  return {
    items: [...current.items, ...additions],
    total: current.items.length === 0 ? additions.length : current.total + additions.length,
  };
};

export const advanceResizeQueue = <T,>(current: ResizeQueueState<T>): ResizeQueueState<T> => {
  const items = current.items.slice(1);
  return { items, total: items.length === 0 ? 0 : current.total };
};

export const resizeQueueProgress = (current: ResizeQueueState<unknown>) => {
  if (!current.items.length || current.total <= 0) return null;
  return { index: current.total - current.items.length + 1, total: current.total };
};

export const takeCurrentResizeItem = <T extends { id: string }>(
  current: ResizeQueueState<T>,
  itemId: string,
) => {
  const item = current.items[0];
  if (!item || item.id !== itemId) return { next: current, item: null };
  return { next: advanceResizeQueue(current), item };
};
