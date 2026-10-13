import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const checker = fileURLToPath(new URL('./readcheck.mjs', import.meta.url));
function check(duration, text, options = [], visibleFrom = 0) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lemo-readcheck-'));
  try {
    writeFileSync(path.join(dir, 'index.html'), `<script>
      window.DUR = ${duration};
      window.render = () => {};
      window.TEXTS = t => t >= ${visibleFrom}
        ? [{ id: 'caption', text: ${JSON.stringify(text)}, x0: 0, y0: 0, x1: 100, y1: 20 }]
        : [];
      window.READY = true;
    </script>`);
    const result = spawnSync(process.execPath, [checker, dir, ...options], {
      encoding: 'utf8', timeout: 30000
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readcheck does not credit time beyond the end of the film', () => {
  // Three letters need 1.70 s; default 0.04 s sampling used to credit 1.72 s.
  const result = check(1.69, 'abc');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /need 1\.70s  got 1\.69s/);
});

test('readcheck accepts text held for exactly its required duration', () => {
  const result = check(1.70, 'abc');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('readcheck clamps a sample step longer than the whole film', () => {
  const result = check(0.5, 'abc', ['--step', '2']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /got 0\.50s/);
});

test('readcheck gives no reading time to text appearing at the endpoint', () => {
  const result = check(2, 'abc', ['--step', '2'], 2);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /got 0\.00s/);
});
