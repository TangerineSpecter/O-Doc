import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildDiaryCalendarGrid} from './diaryCalendarGrid.ts';

test('构建 2026 年 11 月日历网格：1号为周日，前后补齐整行保证 7 列对齐', () => {
    // 2026年11月（11月1日是周日，共30天）
    const grid = buildDiaryCalendarGrid(2026, 10); // monthIndex 从 0 开始，10 代表 11 月

    // 1 号是周日，不需要前置补齐
    assert.equal(grid[0].dayNum, 1);
    assert.equal(grid[0].dayStr, '2026-11-01');
    assert.equal(grid[0].isCurrentMonth, true);

    // 30 号是周一
    assert.equal(grid[29].dayNum, 30);
    assert.equal(grid[29].dayStr, '2026-11-30');
    assert.equal(grid[29].isCurrentMonth, true);

    // 总天数应该能被 7 整除
    assert.equal(grid.length % 7, 0);
    assert.equal(grid.length, 35);

    // 后面 5 天属于 12 月补齐
    assert.equal(grid[30].dayNum, 1);
    assert.equal(grid[30].dayStr, '2026-12-01');
    assert.equal(grid[30].isCurrentMonth, false);

    assert.equal(grid[34].dayNum, 5);
    assert.equal(grid[34].dayStr, '2026-12-05');
    assert.equal(grid[34].isCurrentMonth, false);
});

test('构建 2026 年 12 月日历网格：1号为周二，前面平滑补齐上月最后 2 天', () => {
    // 2026年12月（12月1日是周二，共31天）
    const grid = buildDiaryCalendarGrid(2026, 11);

    // 前面补齐 2 天（11月29日、11月30日）
    assert.equal(grid[0].dayNum, 29);
    assert.equal(grid[0].dayStr, '2026-11-29');
    assert.equal(grid[0].isCurrentMonth, false);

    assert.equal(grid[1].dayNum, 30);
    assert.equal(grid[1].dayStr, '2026-11-30');
    assert.equal(grid[1].isCurrentMonth, false);

    // 12月1日为周二，位于第 3 格
    assert.equal(grid[2].dayNum, 1);
    assert.equal(grid[2].dayStr, '2026-12-01');
    assert.equal(grid[2].isCurrentMonth, true);

    // 总行数整齐对齐
    assert.equal(grid.length % 7, 0);
});

test('跨年网格（2027年1月）前补齐能正确回退到上一年12月', () => {
    // 2027年1月（1月1日是周五，共31天）
    const grid = buildDiaryCalendarGrid(2027, 0);

    // 周日~周四需补齐 5 天（2026-12-27 到 2026-12-31）
    assert.equal(grid[0].dayStr, '2026-12-27');
    assert.equal(grid[0].isCurrentMonth, false);
    assert.equal(grid[4].dayStr, '2026-12-31');
    assert.equal(grid[4].isCurrentMonth, false);

    // 1月1日
    assert.equal(grid[5].dayStr, '2027-01-01');
    assert.equal(grid[5].isCurrentMonth, true);

    assert.equal(grid.length % 7, 0);
});
