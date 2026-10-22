import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

function runScript(args, installed = true) {
    const root = mkdtempSync(join(tmpdir(), 'odoc-dev-local-test-'));
    try {
        const bin = join(root, 'bin');
        mkdirSync(bin);
        mkdirSync(join(root, 'frontend_react', installed ? 'node_modules' : 'src'), {recursive: true});
        writeFileSync(join(root, 'dev.sh'), readFileSync(new URL('../../dev.sh', import.meta.url)));
        writeFileSync(join(bin, 'lsof'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
        // Any accidental backend initialization fails the test without accessing user data.
        for (const command of ['python', 'python3', 'docker']) {
            writeFileSync(join(bin, command), '#!/bin/sh\necho UNEXPECTED_BACKEND >&2\nexit 97\n', {mode: 0o755});
        }
        writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "MOCK=%s LOCAL=%s ARGS=%s\\n" "$VITE_ENABLE_MOCKS" "$VITE_LOCAL_MODE" "$*"\n', {mode: 0o755});
        return spawnSync('sh', ['dev.sh', ...args], {cwd: root, encoding: 'utf8',
            env: {...process.env, PATH: `${bin}:${process.env.PATH}`, ODOC_DEV_FRONTEND_PORT: '43219', VITE_ENABLE_MOCKS: 'false', VITE_LOCAL_MODE: 'false'}, timeout: 10000});
    } finally {
        assert.ok(root.startsWith(join(tmpdir(), 'odoc-dev-local-test-')));
        rmSync(root, {recursive: true, force: true});
    }
}

test('sh dev.sh local starts only the frontend with mocks enabled and the configured port', () => {
    const result = runScript(['local']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /MOCK=true LOCAL=true ARGS=run dev -- --port 43219 --strictPort/);
    assert.doesNotMatch(result.stdout + result.stderr, /UNEXPECTED_BACKEND/);
});

test('local installs frontend dependencies in a fresh checkout', () => {
    const result = runScript(['local'], false);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ARGS=ci/);
    assert.match(result.stdout, /MOCK=true LOCAL=true ARGS=run dev/);
});

test('unknown startup modes fail before starting services', () => {
    const result = runScript(['locla']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /用法: sh dev.sh \[local\]/);
    assert.doesNotMatch(result.stdout, /ARGS=/);
});

test('Vite reads local mode from env files with shell variables taking precedence', () => {
    const require = createRequire(import.meta.url);
    const vite = pathToFileURL(require.resolve('vite')).href;
    const configFile = new URL('../vite.config.ts', import.meta.url).pathname;
    for (const [fileValue, shellValue, expected] of [['true', undefined, 'true'], ['true', 'false', 'false'], ['false', 'true', 'true']]) {
        const root = mkdtempSync(join(tmpdir(), 'odoc-vite-local-test-'));
        try {
            writeFileSync(join(root, '.env.local'), `VITE_LOCAL_MODE=${fileValue}\n`);
            const env = {...process.env};
            delete env.VITE_LOCAL_MODE;
            if (shellValue !== undefined) env.VITE_LOCAL_MODE = shellValue;
            const code = `import {resolveConfig} from ${JSON.stringify(vite)};
                const config = await resolveConfig({configFile: ${JSON.stringify(configFile)}}, 'serve');
                console.log(JSON.stringify({localMode: config.env.VITE_LOCAL_MODE, proxy: Boolean(config.server.proxy)}));`;
            const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {cwd: root, env, encoding: 'utf8', timeout: 20000});
            assert.equal(result.status, 0, result.stderr);
            assert.deepEqual(JSON.parse(result.stdout.trim()), {localMode: expected, proxy: expected !== 'true'});
        } finally {
            assert.ok(root.startsWith(join(tmpdir(), 'odoc-vite-local-test-')));
            rmSync(root, {recursive: true, force: true});
        }
    }
});
