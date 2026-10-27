import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFileSize, isReportFile, isImageFile } from './mt4ArchiveFiles';

test('formatFileSize converts bytes to appropriate KB and MB units', () => {
    assert.equal(formatFileSize(0), '1 KB');
    assert.equal(formatFileSize(500), '1 KB');
    assert.equal(formatFileSize(1024), '1 KB');
    assert.equal(formatFileSize(2048), '2 KB');
    assert.equal(formatFileSize(1024 * 1024), '1.0 MB');
    assert.equal(formatFileSize(2.5 * 1024 * 1024), '2.5 MB');
});

test('isReportFile accepts HTML and ZIP report files and rejects unsupported files', () => {
    assert.equal(isReportFile({ name: 'StrategyTester.htm' }), true);
    assert.equal(isReportFile({ name: 'Report.HTML' }), true);
    assert.equal(isReportFile({ name: 'report_with_chart.zip' }), true);
    assert.equal(isReportFile({ name: 'report.ZIP' }), true);

    assert.equal(isReportFile({ name: 'data.csv' }), false);
    assert.equal(isReportFile({ name: 'chart.png' }), false);
    assert.equal(isReportFile({ name: 'script.mq4' }), false);
    assert.equal(isReportFile({ name: 'document.pdf' }), false);
});

test('isImageFile identifies images by MIME type or file extension', () => {
    assert.equal(isImageFile({ name: 'chart.png', type: 'image/png' }), true);
    assert.equal(isImageFile({ name: 'screenshot.jpg', type: 'image/jpeg' }), true);
    assert.equal(isImageFile({ name: 'curve.webp', type: 'image/webp' }), true);
    assert.equal(isImageFile({ name: 'chart.GIF', type: 'image/gif' }), true);
    assert.equal(isImageFile({ name: 'without-mime.jpeg' }), true);

    assert.equal(isImageFile({ name: 'report.html', type: 'text/html' }), false);
    assert.equal(isImageFile({ name: 'report.zip', type: 'application/zip' }), false);
    assert.equal(isImageFile({ name: 'document.pdf', type: 'application/pdf' }), false);
});
