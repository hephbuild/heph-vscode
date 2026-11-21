import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { resolveBin } from '../../v1/bin';

suite('v1 binary resolution', () => {
	let root: string;
	let both: string; // has heph1 and heph
	let onlyHeph: string; // has heph only
	let notExecutable: string; // has a heph1 without the executable bit

	suiteSetup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'heph-vscode-bin-'));
		const dir = (name: string, files: Record<string, number>) => {
			const d = path.join(root, name);
			fs.mkdirSync(d);
			for (const [file, mode] of Object.entries(files)) {
				fs.writeFileSync(path.join(d, file), '#!/bin/sh\n', { mode });
			}
			return d;
		};
		both = dir('both', { heph1: 0o755, heph: 0o755 });
		onlyHeph = dir('only-heph', { heph: 0o755 });
		notExecutable = dir('not-executable', { heph1: 0o644 });
	});

	suiteTeardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('the heph.bin1 setting wins', () => {
		assert.strictEqual(resolveBin('/opt/heph1/bin/heph', both, 'linux', undefined), '/opt/heph1/bin/heph');
	});

	test('heph1 on PATH comes before heph', () => {
		assert.strictEqual(resolveBin('', both, 'linux', undefined), 'heph1');
		assert.strictEqual(resolveBin(undefined, [onlyHeph, both].join(':'), 'linux', undefined), 'heph1');
	});

	test('falls back to heph', () => {
		assert.strictEqual(resolveBin('', onlyHeph, 'linux', undefined), 'heph');
		assert.strictEqual(resolveBin('', notExecutable, 'linux', undefined), 'heph');
		assert.strictEqual(resolveBin('', undefined, 'linux', undefined), 'heph');
	});

	test('on Windows, heph1 is found with a PATHEXT extension', () => {
		const d = path.join(root, 'win');
		fs.mkdirSync(d);
		fs.writeFileSync(path.join(d, 'heph1.EXE'), '');
		assert.strictEqual(resolveBin('', d, 'win32', '.COM;.EXE'), 'heph1');
		assert.strictEqual(resolveBin('', d, 'win32', '.CMD'), 'heph');
	});
});
