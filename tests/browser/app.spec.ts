import { test, expect } from '@playwright/test';

test('default natural E major, fixed frets and answer concealment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'E 自然大调音阶', exact: true })).toBeVisible();
  await expect(page.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
  await expect(page.locator('.note-summary')).toContainText('D♯');
  await expect(page.locator('.note')).toHaveCount(28);
  await expect(page.locator('.root-note')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '跟随根音' })).toHaveCount(0);
  await expect(page.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
  await page.getByRole('button', { name: '音级', exact: true }).click();
  await expect(page.locator('.note-label').filter({ hasText: 'D♯' })).toHaveCount(0);
  await page.getByRole('button', { name: '隐藏答案' }).click();
  await expect(page.locator('.note-label')).toHaveText(Array(28).fill(''));
  await expect(page.locator('.note title')).toHaveCount(0);
  await expect(page.locator('.note-list')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '揭晓答案' })).toBeVisible();
  await page.getByRole('button', { name: '揭晓答案' }).click();
  await expect(page.locator('.note-summary')).toContainText('D♯');
  expect(errors).toEqual([]);
});

test('all roots and chord qualities render on the fixed fretboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '和弦', exact: true }).click();
  const qualities = ['major', 'minor', 'dim', 'maj7', 'min7', 'dom7', 'halfDim'];
  const roots = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  for (const root of roots) {
    await page.getByRole('group', { name: '十二根音' }).getByRole('button', { name: root, exact: true }).click();
    for (const quality of qualities) {
      await page.getByLabel('和弦类型').selectOption(quality);
      await expect(page.locator('.note')).toHaveCount(['major', 'minor', 'dim'].includes(quality) ? 12 : 16);
      await expect(page.locator('.root-note')).toHaveCount(4);
    }
  }

});

test('share URL restores every setting in a fresh page and legacy links work', async ({ page, context }) => {
  await page.goto('/?root=Bb&mode=diatonic&scale=minor&chord=halfDim&degree=2&seventh=1&view=degree&range=fixed&hidden=1');
  await expect(page.getByRole('heading', { name: 'Cm7', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '揭晓答案' })).toBeVisible();
  const shared = page.url();
  const second = await context.newPage();
  await second.goto(shared);
  await expect(second.getByRole('heading', { name: 'Cm7', exact: true })).toBeVisible();
  await expect(second.getByRole('button', { name: '音级', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(second.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
  await second.goto('/?key=E&degree=2&type=7&view=interval');
  await expect(second.getByRole('heading', { name: 'G♭m7', exact: true })).toBeVisible();
  await second.goto('/?root=invalid&degree=99&mode=oops');
  await expect(second.getByRole('heading', { name: 'E 自然大调音阶', exact: true })).toBeVisible();
});

test('desktop, phone portrait and landscape keep controls usable and page within viewport', async ({ page }) => {
  await page.goto('/');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: '分享设置' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.fret-number')).toHaveCount(12);
    await page.screenshot({ path: `test-results/layout-${viewport.width}.png`, fullPage: true });
  }
});

test('copy link button and install guidance are actionable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: '分享设置' }).click();
  await expect(page.getByRole('status')).toContainText('当前设置链接已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await page.getByRole('button', { name: '安装应用' }).click();
  // On an installable browser this opens its native dialog; without a prompt, show instructions.
  if (await page.locator('.help-panel').isVisible()) await expect(page.locator('.help-panel')).toContainText('Safari');
});

test('only three shape modes remain and decorative copy is removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Shape 类型' }).getByRole('button')).toHaveText(['音阶', '和弦', '音程']);
  await expect(page.getByLabel('音阶类型').getByRole('option')).toHaveText(['自然大调音阶', '自然小调音阶']);
  await expect(page.getByRole('button', { name: '级数', exact: true })).toHaveCount(0);
  await expect(page.getByText('从级数，找到你的 Shape', { exact: false })).toHaveCount(0);
  await expect(page.getByText('上方为 G 弦 · 下方为 E 弦', { exact: true })).toHaveCount(0);
  await expect(page.getByText('指板 · 级数 · SHAPE', { exact: true })).toHaveCount(0);
  await page.getByLabel('音阶类型').selectOption('minor');
  await expect(page.getByRole('heading', { name: 'E 自然小调音阶', exact: true })).toBeVisible();
});

test('each selected interval shows only root and target across twelve roots', async ({ page }) => {
  await page.goto('/?mode=interval&range=follow');
  await expect(page.getByLabel('音程选择')).toHaveValue('7');
  const roots = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const degrees = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
  for (const root of roots) {
    await page.getByRole('group', { name: '十二根音' }).getByRole('button', { name: root, exact: true }).click();
    for (let interval = 0; interval < 12; interval++) {
      await page.getByLabel('音程选择').selectOption(String(interval));
      await expect(page.locator('.note')).toHaveCount(interval === 0 ? 4 : 8);
      await expect(page.locator('.root-note')).toHaveCount(4);
      await expect(page.locator('.note-summary .note-list > div > span')).toHaveText(interval === 0 ? ['1'] : ['1', degrees[interval]]);
      await expect(page.locator('.fretboard')).toHaveAttribute('aria-label', /1至12品/);
    }
  }
});

test('chosen interval survives sharing, refresh and concealment', async ({ page, context }) => {
  await page.goto('/?root=E&mode=interval&interval=3&view=degree&hidden=1&range=follow');
  await expect(page.getByRole('heading', { name: 'E · 小三度', exact: true })).toBeVisible();
  await expect(page.locator('.note-label')).toHaveText(Array(8).fill(''));
  expect(new URL(page.url()).searchParams.get('range')).toBe('fixed');
  const second = await context.newPage();
  await second.goto(page.url());
  await second.reload();
  await expect(second.getByLabel('音程选择')).toHaveValue('3');
  await expect(second.getByRole('button', { name: '揭晓答案' })).toBeVisible();
  await second.getByRole('button', { name: '揭晓答案' }).click();
  await expect(second.locator('.note-summary .note-list > div > b')).toHaveText(['E', 'G']);
  await expect(second.locator('.note-summary .note-list > div > span')).toHaveText(['1', '♭3']);
  await second.setViewportSize({ width: 390, height: 844 });
  await second.screenshot({ path: 'test-results/interval-390.png', fullPage: true });
  await second.setViewportSize({ width: 844, height: 390 });
  await second.screenshot({ path: 'test-results/interval-844.png', fullPage: true });
});
