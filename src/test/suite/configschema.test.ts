import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Set by runTest.ts: a workspace with a `.hephconfig`, a `ci.hephconfig`
// profile, and `heph.bin1` pointing at the heph under test.
const workspaceDir = process.env.HEPH_TEST_WORKSPACE;
const expectedKeys = (process.env.HEPH_TEST_EXPECTED_KEYS ?? '').split(',').filter(Boolean);
// Set only when the fake heph is under test: a script the tests may rewrite.
const fakeBin = process.env.HEPH_TEST_FAKE_BIN;

async function completionLabels(uri: vscode.Uri): Promise<string[]> {
	const list = await vscode.commands.executeCommand<vscode.CompletionList>(
		'vscode.executeCompletionItemProvider',
		uri,
		new vscode.Position(0, 0)
	);
	return list.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label));
}

// yaml-language-server starts, asks for the schema and runs heph
// asynchronously: poll until completion reflects the schema.
async function waitForCompletion(uri: vscode.Uri, keys: string[], timeoutMs: number): Promise<string[]> {
	const deadline = Date.now() + timeoutMs;
	let labels: string[] = [];
	while (Date.now() < deadline) {
		labels = await completionLabels(uri);
		if (keys.every((key) => labels.includes(key))) {
			return labels;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	return labels;
}

suite('.hephconfig schema', function () {
	this.timeout(90_000);

	suiteSetup(function () {
		if (!workspaceDir) {
			this.skip();
		}
	});

	for (const name of ['.hephconfig', 'ci.hephconfig']) {
		test(`${name} completes keys from heph tool config-schema`, async () => {
			const uri = vscode.Uri.file(path.join(workspaceDir!, name));
			const doc = await vscode.workspace.openTextDocument(uri);
			assert.strictEqual(doc.languageId, 'yaml');
			await vscode.window.showTextDocument(doc);

			const labels = await waitForCompletion(uri, expectedKeys, 60_000);
			for (const key of expectedKeys) {
				assert.ok(labels.includes(key), `expected completion "${key}", got [${labels.join(', ')}]`);
			}
		});
	}

	// Saving the config may move the version pin to a heph with another
	// schema: the extension runs the command again and serves the new one.
	test('a saved .hephconfig picks up a changed schema', async function () {
		if (!fakeBin) {
			this.skip();
		}

		const uri = vscode.Uri.file(path.join(workspaceDir!, '.hephconfig'));
		const doc = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(doc);
		assert.ok((await waitForCompletion(uri, ['hephFixtureKey'], 60_000)).includes('hephFixtureKey'));

		fs.writeFileSync(fakeBin!, fs.readFileSync(fakeBin!, 'utf8').replace('"hephFixtureKey"', '"hephFixtureKeyV2"'));
		const edit = new vscode.WorkspaceEdit();
		edit.insert(uri, new vscode.Position(0, 0), '\n');
		await vscode.workspace.applyEdit(edit);
		await doc.save();

		const labels = await waitForCompletion(uri, ['hephFixtureKeyV2'], 30_000);
		assert.ok(labels.includes('hephFixtureKeyV2'), `expected the new schema's key, got [${labels.join(', ')}]`);
		assert.ok(!labels.includes('hephFixtureKey'), `the old schema's key is still offered: [${labels.join(', ')}]`);
	});
});
