import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceResizeQueue,
  classifyImageUploads,
  collectDroppedFiles,
  emptyResizeQueue,
  enqueueResizeItems,
  getProcessedImageOutput,
  getResizeDrawSource,
  imageExceedsUploadLimit,
  isImageUploadFile,
  resolvePhotoDropAction,
  resizeQueueProgress,
  takeCurrentResizeItem,
} from './imageUpload';

const config = { maxLongEdge: 2048, maxFileSizeMb: 10 };
const maxBytes = config.maxFileSizeMb * 1024 * 1024;

test('isImageUploadFile accepts Finder drops that have an empty MIME type', () => {
  assert.equal(isImageUploadFile(new File(['ok'], 'shot.png', { type: 'image/png' })), true);
  assert.equal(isImageUploadFile(new File(['ok'], 'shot.PNG', { type: '' })), true);
  assert.equal(isImageUploadFile(new File(['ok'], 'shot.jpg', { type: '' })), true);
  assert.equal(isImageUploadFile(new File(['no'], 'notes.txt', { type: '' })), false);
});

test('getProcessedImageOutput keeps PNG when Finder leaves MIME empty', () => {
  assert.deepEqual(getProcessedImageOutput(new File(['x'], 'shot.png', { type: 'image/png' })), {
    type: 'image/png',
    extension: 'png',
  });
  assert.deepEqual(getProcessedImageOutput(new File(['x'], 'shot.PNG', { type: '' })), {
    type: 'image/png',
    extension: 'png',
  });
  assert.deepEqual(getProcessedImageOutput(new File(['x'], 'shot.jpg', { type: '' })), {
    type: 'image/jpeg',
    extension: 'jpg',
  });
  assert.deepEqual(getProcessedImageOutput(new File(['x'], 'shot.jpg', { type: 'image/jpeg' })), {
    type: 'image/jpeg',
    extension: 'jpg',
  });
});

test('resolvePhotoDropAction prefers in-progress reorder over thumbnail file payloads', () => {
  const dropped = [new File(['x'], 'thumb.png', { type: 'image/png' })];
  assert.deepEqual(resolvePhotoDropAction(2, dropped), { type: 'reorder' });
  assert.deepEqual(resolvePhotoDropAction(null, dropped), { type: 'add', files: dropped });
  assert.deepEqual(resolvePhotoDropAction(null, []), { type: 'none' });
});

test('collectDroppedFiles keeps every dropped file, not just the first', () => {
  const files = [
    new File(['a'], 'a.png', { type: 'image/png' }),
    new File(['b'], 'b.png', { type: '' }),
    new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
  ];
  const fromFilesOnly = collectDroppedFiles({ files });
  assert.deepEqual(fromFilesOnly.map(file => file.name), ['a.png', 'b.png', 'c.jpg']);

  const fromItems = collectDroppedFiles({
    files: files.slice(0, 1),
    items: files.map(file => ({ kind: 'file' as const, getAsFile: () => file })),
  });
  assert.deepEqual(fromItems.map(file => file.name), ['a.png', 'b.png', 'c.jpg']);
});

test('takeCurrentResizeItem only advances the matching current file once', () => {
  const queued = enqueueResizeItems(emptyResizeQueue<{ id: string; name: string }>(), [
    { id: 'one', name: 'a.png' },
    { id: 'two', name: 'b.png' },
    { id: 'three', name: 'c.png' },
  ]);

  const first = takeCurrentResizeItem(queued, 'one');
  assert.equal(first.item?.name, 'a.png');
  assert.deepEqual(first.next.items.map(item => item.name), ['b.png', 'c.png']);
  assert.deepEqual(resizeQueueProgress(first.next), { index: 2, total: 3 });

  const replay = takeCurrentResizeItem(first.next, 'one');
  assert.equal(replay.item, null);
  assert.deepEqual(replay.next.items.map(item => item.name), ['b.png', 'c.png']);

  const second = takeCurrentResizeItem(first.next, 'two');
  assert.equal(second.item?.name, 'b.png');
  assert.deepEqual(second.next.items.map(item => item.name), ['c.png']);
  assert.deepEqual(resizeQueueProgress(second.next), { index: 3, total: 3 });
});

test('imageExceedsUploadLimit flags oversize long edge or file size', () => {
  assert.equal(imageExceedsUploadLimit({ width: 2048, height: 1024, fileSize: maxBytes }, config), false);
  assert.equal(imageExceedsUploadLimit({ width: 2049, height: 800, fileSize: 100 }, config), true);
  assert.equal(imageExceedsUploadLimit({ width: 800, height: 3000, fileSize: 100 }, config), true);
  assert.equal(imageExceedsUploadLimit({ width: 800, height: 600, fileSize: maxBytes + 1 }, config), true);
});

test('classifyImageUploads splits a mixed batch into ready and resize queues', () => {
  const items = [
    { name: 'ok.jpg', width: 1600, height: 900, fileSize: 2 * 1024 * 1024 },
    { name: 'wide.png', width: 4096, height: 2160, fileSize: 4 * 1024 * 1024 },
    { name: 'heavy.jpg', width: 1200, height: 800, fileSize: 12 * 1024 * 1024 },
    { name: 'edge.jpg', width: 2048, height: 2048, fileSize: maxBytes },
  ];

  const { ready, needsResize } = classifyImageUploads(items, config);

  assert.deepEqual(ready.map(item => item.name), ['ok.jpg', 'edge.jpg']);
  assert.deepEqual(needsResize.map(item => item.name), ['wide.png', 'heavy.jpg']);
});

test('getResizeDrawSource keeps full frame for long-edge and uses crop box otherwise', () => {
  const crop = { x: 8, y: 8, width: 84, height: 84 };
  assert.deepEqual(getResizeDrawSource('long-edge', crop, 4000, 3000), {
    sx: 0,
    sy: 0,
    sw: 4000,
    sh: 3000,
  });
  assert.deepEqual(getResizeDrawSource('3:2', crop, 4000, 3000), {
    sx: 320,
    sy: 240,
    sw: 3360,
    sh: 2520,
  });
});

test('group modal pipeline keeps valid photos and queues oversized ones for crop', () => {
  const inspected = [
    { name: 'ok.jpg', width: 1600, height: 900, fileSize: 800_000 },
    { name: 'big-1.png', width: 4096, height: 2304, fileSize: 3_000_000 },
    { name: 'big-2.jpg', width: 1200, height: 800, fileSize: 11 * 1024 * 1024 },
  ];
  const { ready, needsResize } = classifyImageUploads(inspected, config);
  const queue = enqueueResizeItems(emptyResizeQueue<typeof inspected[number]>(), needsResize);

  assert.deepEqual(ready.map(item => item.name), ['ok.jpg']);
  assert.deepEqual(queue.items.map(item => item.name), ['big-1.png', 'big-2.jpg']);
  assert.deepEqual(resizeQueueProgress(queue), { index: 1, total: 2 });
  assert.deepEqual(
    getResizeDrawSource('long-edge', { x: 8, y: 8, width: 84, height: 84 }, queue.items[0].width, queue.items[0].height),
    { sx: 0, sy: 0, sw: 4096, sh: 2304 },
  );

  const afterFirst = advanceResizeQueue(queue);
  assert.equal(afterFirst.items[0].name, 'big-2.jpg');
  assert.deepEqual(resizeQueueProgress(afterFirst), { index: 2, total: 2 });
});

test('resize queue advances one oversized file at a time', () => {
  const first = enqueueResizeItems(emptyResizeQueue<string>(), ['a.png', 'b.png']);
  assert.deepEqual(resizeQueueProgress(first), { index: 1, total: 2 });

  const afterMore = enqueueResizeItems(first, ['c.png']);
  assert.deepEqual(resizeQueueProgress(afterMore), { index: 1, total: 3 });
  assert.deepEqual(afterMore.items, ['a.png', 'b.png', 'c.png']);

  const second = advanceResizeQueue(afterMore);
  assert.deepEqual(resizeQueueProgress(second), { index: 2, total: 3 });

  const done = advanceResizeQueue(advanceResizeQueue(second));
  assert.deepEqual(done, { items: [], total: 0 });
  assert.equal(resizeQueueProgress(done), null);
});

test('aborting the resize queue drops remaining oversized files', () => {
  const queued = enqueueResizeItems(emptyResizeQueue<{ id: string }>(), [
    { id: 'one' },
    { id: 'two' },
    { id: 'three' },
  ]);
  const skipped = takeCurrentResizeItem(queued, 'one');
  assert.equal(skipped.next.items.length, 2);
  assert.deepEqual(emptyResizeQueue(), { items: [], total: 0 });
});
