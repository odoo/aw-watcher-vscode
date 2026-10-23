import * as assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { Repositories, readRepository } from '../git';

describe('readRepository', () => {
    let dir: string;
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args]);

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'aw-watcher-git-'));
        mkdirSync(join(dir, 'addons'));
        git('init', '-q', '-b', 'master-foo-abgh');
    });

    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('reads the branch, and the folder name without any remote', async () => {
        assert.deepStrictEqual(await readRepository(join(dir, 'addons')), {
            branch: 'master-foo-abgh',
            repository: basename(dir),
        });
    });

    it('reads the remote the branch tracks, else origin', async () => {
        git('remote', 'add', 'origin', 'git@github.com:odoo/enterprise.git');
        git('remote', 'add', 'dev', 'https://user:token@github.com/odoo-dev/enterprise.git');
        assert.strictEqual((await readRepository(dir))?.repository, 'odoo/enterprise');
        git('config', 'branch.master-foo-abgh.remote', 'dev');
        assert.strictEqual((await readRepository(dir))?.repository, 'odoo-dev/enterprise');
    });

    it('sends "unknown" as the branch on a detached HEAD', async () => {
        git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
        git('checkout', '-q', '--detach');
        assert.strictEqual((await readRepository(dir))?.branch, 'unknown');
    });

    it('returns undefined outside a repository', async () => {
        const outside = mkdtempSync(join(tmpdir(), 'aw-watcher-nogit-'));
        assert.strictEqual(await readRepository(outside), undefined);
        rmSync(outside, { recursive: true });
    });

    it('reads a folder again after a few seconds, for checkouts', async () => {
        let now = 0;
        const repositories = new Repositories(() => now);
        assert.strictEqual((await repositories.get(dir))?.branch, 'master-foo-abgh');
        git('checkout', '-q', '-b', 'master-bar-abgh');
        now = 1000;
        assert.strictEqual((await repositories.get(dir))?.branch, 'master-foo-abgh');
        now = 6000;
        assert.strictEqual((await repositories.get(dir))?.branch, 'master-bar-abgh');
    });
});
