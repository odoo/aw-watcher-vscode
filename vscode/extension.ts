import { ExtensionContext, LogOutputChannel, Uri, extensions, window } from 'vscode';
import { awSender } from '../core/client';
import { Data, Heartbeats } from '../core/heartbeats';
import { pickRemote, repositoryName } from '../core/remote';
import { API as GitAPI, GitExtension, Repository as GitRepository } from './git';

// Not `app.editor.activity`: aw-webui expects `file`, `language` and `project` in
// those events, and this watcher records the repository and branch, not the file
const CLIENT_NAME = 'aw-watcher-vscode-odoo';
const EVENT_TYPE = 'app.vscode.activity';
const INTERVAL_MS = 60 * 1000;

let heartbeats: Heartbeats | undefined;

export async function activate(context: ExtensionContext) {
    const log = window.createOutputChannel('ActivityWatch', { log: true });
    context.subscriptions.push(log);

    heartbeats = new Heartbeats(awSender(CLIENT_NAME, EVENT_TYPE, log));

    const git = await getGitApi(log);
    const repositories = new RepositoryTracker(git);
    const beats = heartbeats;
    const currentData = (): Data => repositories.current();
    // Starts a new event right away if the repository or the branch changed
    const onChange = () => window.state.focused && beats.beatIfChanged(currentData());

    context.subscriptions.push(
        window.onDidChangeWindowState((state) => (state.focused ? beats.beat(currentData()) : beats.close())),
        // Opening a file of another repository
        window.onDidChangeActiveTextEditor(onChange)
    );
    // A checkout, from VS Code or a terminal. Also fires on edits, which send
    // nothing as long as the branch is the same.
    if (git) {
        const watch = (repository: GitRepository) => context.subscriptions.push(repository.state.onDidChange(onChange));
        git.repositories.forEach(watch);
        context.subscriptions.push(git.onDidOpenRepository(watch));
    }
    const timer = setInterval(() => window.state.focused && beats.beat(currentData()), INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });

    if (window.state.focused) {
        beats.beat(currentData());
    }
}

export function deactivate() {
    return heartbeats?.close();
}

// The repository of the last file opened in a repository. Anything else (Claude
// Code, terminal, settings, files outside a repository) keeps the current one, so
// it does not start a new event.
class RepositoryTracker {
    private _lastRepoFile: Uri | undefined;

    constructor(private readonly _git: GitAPI | undefined) {}

    public current(): Data {
        const file = window.activeTextEditor?.document.uri;
        if (file && this._git?.getRepository(file)) {
            this._lastRepoFile = file;
        }
        // Read again each time, so a checkout is picked up
        const repository = this._lastRepoFile && this._git?.getRepository(this._lastRepoFile);
        if (!repository) {
            return { branch: 'unknown', repository: 'unknown' };
        }
        const { HEAD, remotes } = repository.state;
        const remoteName = pickRemote(
            remotes.map((r) => r.name),
            HEAD?.upstream?.remote
        );
        const remote = remotes.find((r) => r.name === remoteName);
        const url = remote?.fetchUrl ?? remote?.pushUrl;
        const name = (url && repositoryName(url)) || repository.rootUri.fsPath.split(/[\\/]/).pop() || 'unknown';
        return { branch: HEAD?.name ?? 'unknown', repository: name };
    }
}

async function getGitApi(log: LogOutputChannel): Promise<GitAPI | undefined> {
    try {
        const extension = extensions.getExtension<GitExtension>('vscode.git');
        const git = extension && (extension.isActive ? extension.exports : await extension.activate());
        return git?.enabled ? git.getAPI(1) : undefined;
    } catch (err) {
        log.warn(`Git extension unavailable, branch will be "unknown": ${String(err)}`);
        return undefined;
    }
}
