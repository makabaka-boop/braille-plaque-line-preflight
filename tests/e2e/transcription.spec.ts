import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-transcription').click();
  await expect(page.getByTestId('capture-zone')).toBeVisible();
});

/** 聚焦采集区（点击获得焦点后才能接收按键）。 */
async function focusCaptureZone(page: Page) {
  await page.getByTestId('capture-zone').click();
  await expect(page.getByTestId('capture-zone')).toBeFocused();
}

/** 抄录稿中已提交的 CellView 单元（不含录入中的占位）。 */
function committedCells(page: Page) {
  return page.getByTestId('transcript-cell').locator('.cell');
}

test.describe('进入六键抄录工作区', () => {
  test('工作区独立于既有四种模式，未录入前无抄录稿', async ({ page }) => {
    await page.goto('/');
    // 默认仍是单稿预检
    await expect(page.getByTestId('phrase-input')).toBeVisible();
    await expect(page.getByTestId('capture-zone')).toHaveCount(0);

    await page.getByTestId('mode-transcription').click();
    await expect(page.getByTestId('capture-zone')).toBeVisible();
    // 既有四个工作区的控件都不与六键抄录同时出现
    await expect(page.getByTestId('phrase-input')).toHaveCount(0);
    await expect(page.getByTestId('base-input')).toHaveCount(0);
    await expect(page.getByTestId('point-grid')).toHaveCount(0);
    await expect(page.getByTestId('training-start')).toHaveCount(0);

    // 六键点位对照完整：F/D/S/J/K/L 对应 1-6 点，空格对应空方
    const legend = page.getByTestId('key-legend').locator('li');
    await expect(legend).toHaveCount(7);
    await expect(legend.first()).toContainText('F');
    await expect(legend.first()).toContainText('第 1 点');
    await expect(legend.last()).toContainText('空格');
    await expect(legend.last()).toContainText('空方');

    // 未录入：无抄录稿、无中断提示
    await expect(page.getByTestId('transcription-result')).toHaveCount(0);
    await expect(page.getByTestId('transcription-notice')).toHaveCount(0);
    await expect(page.getByTestId('capture-hint')).toContainText('点击此处聚焦');
  });
});

test.describe('连续录入含空方的抄录稿', () => {
  test('并击多方与空方按顺序展示点位、点号与总方数，且不请求在线接口', async ({ page }) => {
    const externalRequests: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
        externalRequests.push(url);
      }
      return route.continue();
    });

    await focusCaptureZone(page);

    // 第 1 方：F+J 并击 -> 14（三）；交错释放，与顺序无关
    await page.keyboard.down('f');
    await page.keyboard.down('j');
    await expect(page.getByTestId('capture-live')).toContainText('第 1、4 点');
    await expect(page.getByTestId('transcript-pending')).toBeVisible();
    await page.keyboard.up('j');
    await page.keyboard.up('f');

    // 第 2 方：空格 -> 空方
    await page.keyboard.press('Space');

    // 第 3 方：F+K -> 15（五）
    await page.keyboard.down('f');
    await page.keyboard.down('k');
    await page.keyboard.up('f');
    await page.keyboard.up('k');

    // 第 4 方：D+J+K -> 245（零）
    await page.keyboard.down('d');
    await page.keyboard.down('j');
    await page.keyboard.down('k');
    await page.keyboard.up('d');
    await page.keyboard.up('j');
    await page.keyboard.up('k');

    // 抄录稿：四方按录入顺序展示，空方同样占位
    await expect(page.getByTestId('transcript-cell')).toHaveCount(4);
    await expect(page.getByTestId('transcript-pending')).toHaveCount(0);
    const cells = committedCells(page);
    await expect(cells).toHaveCount(4);
    const expectedDots = ['14', '', '15', '245'];
    for (const [index, dots] of expectedDots.entries()) {
      await expect(cells.nth(index)).toHaveAttribute('data-dots', dots);
    }
    // 空方以空方样式呈现，点号标签为“空方”
    await expect(cells.nth(1)).toHaveClass(/is-empty/);
    await expect(cells.nth(1)).toContainText('空方');
    // 点位标签按顺序编号
    await expect(page.getByTestId('transcript-cell').nth(0)).toContainText('第 1 方');
    await expect(page.getByTestId('transcript-cell').nth(3)).toContainText('第 4 方');
    await expect(page.getByTestId('transcription-total')).toHaveText('总方数：4 方');

    // 凸点方的六点网格与实际点位一致（14：点 1、4 凸起）
    const firstCell = cells.first();
    for (const dot of [1, 4]) {
      await expect(firstCell.locator(`.dot[data-dot="${dot}"]`)).toHaveClass(/raised/);
    }
    for (const dot of [2, 3, 5, 6]) {
      await expect(firstCell.locator(`.dot[data-dot="${dot}"]`)).not.toHaveClass(/raised/);
    }

    // 全程离线：没有任何在线转换请求
    expect(externalRequests).toEqual([]);
  });

  test('无关按键、自动重复与滞留释放不产生方', async ({ page }) => {
    await focusCaptureZone(page);

    // 无关按键：不开始采集、不产生方
    await page.keyboard.press('a');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('transcription-result')).toHaveCount(0);
    await expect(page.getByTestId('capture-hint')).toBeVisible();

    // 按住 F 期间操作系统的自动重复被忽略
    await page.keyboard.down('f');
    await expect(page.getByTestId('capture-live')).toBeVisible();
    const zone = page.getByTestId('capture-zone');
    await zone.dispatchEvent('keydown', { key: 'f', repeat: true });
    await zone.dispatchEvent('keydown', { key: 'f', repeat: true });
    await expect(page.getByTestId('transcript-cell')).toHaveCount(0);
    await expect(page.getByTestId('capture-live')).toBeVisible();

    // 释放后只提交一方；随后的滞留释放不再重复提交
    await page.keyboard.up('f');
    await expect(committedCells(page)).toHaveCount(1);
    await expect(committedCells(page).first()).toHaveAttribute('data-dots', '1');
    await zone.dispatchEvent('keyup', { key: 'f' });
    await expect(committedCells(page)).toHaveCount(1);
    await expect(page.getByTestId('transcription-total')).toHaveText('总方数：1 方');
  });
});

test.describe('焦点中断', () => {
  test('并击中失焦仅取消未完成的一方，重新聚焦后继续抄录且无幽灵方', async ({ page }) => {
    await focusCaptureZone(page);

    // 并击进行中：F+D 已按下（点 1、2 待提交）
    await page.keyboard.down('f');
    await page.keyboard.down('d');
    await expect(page.getByTestId('capture-live')).toContainText('第 1、2 点');
    await expect(page.getByTestId('transcript-pending').locator('.cell')).toHaveAttribute('data-dots', '12');

    // 窗口失焦：取消未完成的一方并提示重新录入
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
    });
    const notice = page.getByTestId('transcription-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('已取消未完成的第 1 方');
    await expect(notice).toContainText('重新录入');
    await expect(page.getByTestId('transcript-cell')).toHaveCount(0);
    await expect(page.getByTestId('transcript-pending')).toHaveCount(0);

    // 失焦期间释放此前按住的键：不产生任何方
    await page.keyboard.up('f');
    await page.keyboard.up('d');
    await expect(page.getByTestId('transcript-cell')).toHaveCount(0);

    // 重新聚焦后继续抄录：只录入 F 一方，被取消的 12 不复活（无幽灵方）
    await focusCaptureZone(page);
    await page.keyboard.down('f');
    await page.keyboard.up('f');
    await expect(page.getByTestId('transcript-cell')).toHaveCount(1);
    await expect(committedCells(page).first()).toHaveAttribute('data-dots', '1');
    await expect(page.getByTestId('transcription-total')).toHaveText('总方数：1 方');
    // 重新录入完成后提示消失
    await expect(page.getByTestId('transcription-notice')).toHaveCount(0);
  });

  test('页面隐藏发生在并击中时同样取消未完成方，已提交方保留', async ({ page }) => {
    await focusCaptureZone(page);

    // 先提交一方 F -> 1
    await page.keyboard.down('f');
    await page.keyboard.up('f');
    await expect(committedCells(page)).toHaveCount(1);

    // 新一轮并击进行中（J -> 4 待提交）时页面隐藏
    await page.keyboard.down('j');
    await expect(page.getByTestId('capture-live')).toBeVisible();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 已提交的第 1 方保留，未完成的第 2 方被取消并提示
    await expect(page.getByTestId('transcription-notice')).toContainText('已取消未完成的第 2 方');
    await expect(committedCells(page)).toHaveCount(1);
    await expect(page.getByTestId('transcript-pending')).toHaveCount(0);

    // 页面重新可见后释放滞留键：被忽略，不产生幽灵方
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.keyboard.up('j');
    await expect(committedCells(page)).toHaveCount(1);

    // 继续抄录下一方
    await page.keyboard.down('j');
    await page.keyboard.up('j');
    await expect(committedCells(page)).toHaveCount(2);
    await expect(committedCells(page).nth(1)).toHaveAttribute('data-dots', '4');
    await expect(page.getByTestId('transcription-total')).toHaveText('总方数：2 方');
  });
});

test.describe('与既有工作区隔离', () => {
  test('抄录后切回单稿预检，原输入与预览未受影响；离开工作区即丢弃抄录稿', async ({ page }) => {
    // 先在单稿预检生成预览
    await page.goto('/');
    await page.getByTestId('phrase-input').fill('12，三。');
    await page.getByTestId('width-input').fill('20');
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('total-cells')).toContainText('总方数：6 方');

    // 到六键抄录录入两方（含一方空方）
    await page.getByTestId('mode-transcription').click();
    await focusCaptureZone(page);
    await page.keyboard.down('f');
    await page.keyboard.down('j');
    await page.keyboard.up('f');
    await page.keyboard.up('j');
    await page.keyboard.press('Space');
    await expect(committedCells(page)).toHaveCount(2);
    await expect(page.getByTestId('transcription-total')).toHaveText('总方数：2 方');

    // 切回单稿预检：输入保留、逐方预览与总方数完全保持原行为
    await page.getByTestId('mode-single').click();
    await expect(page.getByTestId('phrase-input')).toHaveValue('12，三。');
    await expect(page.getByTestId('width-input')).toHaveValue('20');
    await expect(page.getByTestId('preview')).toBeVisible();
    await expect(page.getByTestId('total-cells')).toContainText('总方数：6 方');
    const previewCells = page.getByTestId('preview').locator('.cell');
    await expect(previewCells).toHaveCount(6);
    await expect(previewCells.first()).toHaveAttribute('data-dots', '3456');

    // 单稿错误阻断行为不变
    await page.getByTestId('phrase-input').fill('12楼');
    await expect(page.getByTestId('errors')).toBeVisible();
    await expect(page.getByTestId('preview')).toHaveCount(0);

    // 离开工作区即丢弃抄录稿：再次进入时为空抄录稿
    await page.getByTestId('mode-transcription').click();
    await expect(page.getByTestId('transcription-result')).toHaveCount(0);
    await expect(page.getByTestId('transcript-cell')).toHaveCount(0);
    await expect(page.getByTestId('capture-hint')).toContainText('点击此处聚焦，开始并击录入第一方');
  });

  test('抄录稿不做本地保存', async ({ page }) => {
    await focusCaptureZone(page);
    await page.keyboard.down('f');
    await page.keyboard.up('f');
    await expect(committedCells(page)).toHaveCount(1);

    const storedKeys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(storedKeys).toEqual([]);
  });
});
