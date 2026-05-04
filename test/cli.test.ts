import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe('CLI entrypoint', () => {
  it('prints help', () => {
    const out = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], { encoding: 'utf8' });
    expect(out).toContain('oh-my-free-models');
    expect(out).toContain('omfm model');
  });

  it('reports stopped status without daemon', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omfm-cli-'));
    roots.push(root);
    const out = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'status'], { encoding: 'utf8', env: { ...process.env, OMFM_HOME: root } });
    expect(out).toContain('omfm stopped');
  });
});
