import { execFile } from 'child_process';
import { basename } from 'path';
import { promisify } from 'util';
import { pickRemote, repositoryName } from './remote';

// For editors without a Git API: the repository of a folder, read with the git command
// line, so worktrees and submodules are handled the way git does.

export type Repository = {
    // `"unknown"` on a detached HEAD
    branch: string;
    // `owner/name` of the remote the branch lives on, else the folder name
    repository: string;
};

// Read again after this long, so a checkout from a terminal is picked up
const TTL_MS = 5 * 1000;

const run = promisify(execFile);

async function git(dir: string, ...args: string[]): Promise<string | undefined> {
    try {
        const { stdout } = await run('git', ['-C', dir, ...args]);
        return stdout.trim();
    } catch {
        return undefined;
    }
}

// undefined outside a repository
export async function readRepository(dir: string): Promise<Repository | undefined> {
    const root = await git(dir, 'rev-parse', '--show-toplevel');
    if (root === undefined) {
        return undefined;
    }
    const branch = await git(dir, 'symbolic-ref', '--quiet', '--short', 'HEAD');
    const remotes = (await git(dir, 'remote'))?.split('\n').filter(Boolean) ?? [];
    const tracked = branch && (await git(dir, 'config', `branch.${branch}.remote`));
    const remote = pickRemote(remotes, tracked || undefined);
    const url = remote && (await git(dir, 'remote', 'get-url', remote));
    return {
        branch: branch || 'unknown',
        repository: (url && repositoryName(url)) || basename(root),
    };
}

// The repositories of folders, read at most every few seconds
export class Repositories {
    private readonly _cache = new Map<string, { readAt: number; repository: Promise<Repository | undefined> }>();

    constructor(private readonly _now: () => number = () => Date.now()) {}

    public get(dir: string): Promise<Repository | undefined> {
        const cached = this._cache.get(dir);
        if (cached && this._now() - cached.readAt < TTL_MS) {
            return cached.repository;
        }
        const repository = readRepository(dir);
        this._cache.set(dir, { readAt: this._now(), repository });
        return repository;
    }
}
