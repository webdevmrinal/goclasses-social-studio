// Copyright (c) 2026 Mrinal. All rights reserved.
import { ReadinessError, preparedButton } from './utils.js';

// Only the empty X portal observed in the saved failure permits keyboard fallback.
export async function prepareXSubmit(page, composer, button) {
  await preparedButton(page, button);
  await button.scrollIntoViewIfNeeded();
  try {
    await button.click({ trial: true, timeout: 1200 });
    return { method: 'pointer', publish: () => button.click({ timeout: 5000 }) };
  } catch {
    const safe = await button.evaluate(el => {
      const dialog = el.closest('[role="dialog"]');
      const visible = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
      if (!dialog || visible.at(-1) !== dialog || el.closest('[inert],[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect(), blocker = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return blocker && !el.contains(blocker) && blocker.tagName === 'DIV' && !blocker.children.length && !blocker.textContent.trim()
        && !blocker.getAttribute('role') && !blocker.getAttribute('aria-label') && !blocker.hasAttribute('tabindex')
        && blocker.matches('.r-1p0dtai.r-1d2f490.r-1xcajam.r-zchlnj.r-ipm5af')
        && blocker.parentElement?.parentElement?.parentElement?.matches('.r-aqfbo4.r-12vffkv')
        && !blocker.closest('[role="dialog"],[role="alertdialog"],[data-testid="paywallScrim"]');
    });
    if (!safe) throw new ReadinessError('X has an overlay blocking Post. Close it in the worker and retry preparation. Nothing was submitted.');
    await button.focus();
    if (!await button.evaluate(el => document.activeElement === el)) throw new ReadinessError('X could not focus the reviewed Post button. Nothing was submitted.');
    return { method: 'keyboard', publish: async () => {
      if (!await composer.isVisible() || !await button.evaluate(el => document.activeElement === el)) throw new Error('X focus changed after review. Verify the platform before retrying.');
      // Real keyboard activation of the exact focused button; never a forced or DOM click.
      await button.press('Space', { timeout: 5000 });
    } };
  }
}
