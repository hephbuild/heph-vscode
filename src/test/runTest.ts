import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { downloadAndUnzipVSCode, runTests, runVSCodeCommand } from '@vscode/test-electron';

// A stand-in for heph1 that only knows `tool config-schema`. Anything else
// (e.g. the language server's `tool build-lsp`) fails, which the extension
// reports and otherwise ignores.
const FAKE_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	additionalProperties: false,
	properties: {
		version: { type: 'string', description: 'The heph version this workspace pins.' },
		hephFixtureKey: { type: 'string', description: 'Only the fake heph knows this key.' },
	},
};

const FAKE_HEPH = `#!/bin/sh
if [ "$1" = "tool" ] && [ "$2" = "config-schema" ]; then
	cat <<'EOF'
${JSON.stringify(FAKE_SCHEMA, null, 2)}
EOF
	exit 0
fi
echo "fake heph: unsupported command: $*" >&2
exit 2
`;

// A throwaway workspace whose settings point `heph.bin1` at the binary under
// test: the fake above, or a real heph1 named by $HEPH_TEST_BIN.
function makeWorkspace(): { dir: string; expectedKeys: string[]; fakeBin?: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heph-vscode-test-'));

	let bin = process.env.HEPH_TEST_BIN;
	let expectedKeys = ['version', 'caches'];
	let fakeBin: string | undefined;
	if (!bin) {
		bin = fakeBin = path.join(dir, 'fake-heph');
		fs.writeFileSync(bin, FAKE_HEPH, { mode: 0o755 });
		expectedKeys = ['version', 'hephFixtureKey'];
	}

	fs.writeFileSync(path.join(dir, '.hephconfig'), '');
	fs.writeFileSync(path.join(dir, 'ci.hephconfig'), '');
	fs.mkdirSync(path.join(dir, '.vscode'));
	fs.writeFileSync(
		path.join(dir, '.vscode', 'settings.json'),
		JSON.stringify({ 'heph.mode': 'v1', 'heph.bin1': path.resolve(bin) }, null, 2)
	);

	return { dir, expectedKeys, fakeBin };
}

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vscodeExecutablePath = await downloadAndUnzipVSCode();

		// .hephconfig completion goes through the Red Hat YAML extension.
		await runVSCodeCommand(['--install-extension', 'redhat.vscode-yaml'], { reuseMachineInstall: false });

		const workspace = makeWorkspace();

		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspace.dir],
			extensionTestsEnv: {
				HEPH_TEST_WORKSPACE: workspace.dir,
				HEPH_TEST_EXPECTED_KEYS: workspace.expectedKeys.join(','),
				...(workspace.fakeBin ? { HEPH_TEST_FAKE_BIN: workspace.fakeBin } : {}),
			},
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
