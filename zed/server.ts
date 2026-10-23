import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { TextDocumentSyncKind, createConnection } from 'vscode-languageserver/node';
import { awSender } from '../core/client';
import { Repositories } from '../core/git';
import { Data, Heartbeats } from '../core/heartbeats';

// Same data as the VS Code extension, in its own bucket
const CLIENT_NAME = 'aw-watcher-zed-odoo';
const EVENT_TYPE = 'app.zed.activity';
const INTERVAL_MS = 60 * 1000;
// Zed tells language servers nothing about focus changes, tab switches or scrolling,
// only about edits, and about cursor moves through code action requests. So Zed is
// considered in use for this long after the last of them, in place of being focused.
const IDLE_MS = 60 * 1000;

const connection = createConnection();
const heartbeats = new Heartbeats(
    awSender(CLIENT_NAME, EVENT_TYPE, {
        debug: (message) => connection.console.log(message),
        warn: (message) => connection.console.warn(message),
    })
);
const repositories = new Repositories();
let lastActivity: number | undefined;
// The folder of the last file edited or moved in, in a repository. Files outside any
// repository keep the current one, so they do not start a new event.
let repositoryDir: string | undefined;

async function currentData(): Promise<Data> {
    const repository = repositoryDir && (await repositories.get(repositoryDir));
    return repository || { branch: 'unknown', repository: 'unknown' };
}

// An edit or a cursor move: starts a new event right away if the repository or the
// branch changed, or if Zed was not in use. Otherwise the next tick extends it.
async function onActivity(uri: string) {
    lastActivity = Date.now();
    if (uri.startsWith('file:')) {
        const dir = dirname(fileURLToPath(uri));
        if (await repositories.get(dir)) {
            repositoryDir = dir;
        }
    }
    await heartbeats.beatIfChanged(await currentData());
}

connection.onInitialize(() => ({
    capabilities: {
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: true },
        // Zed requests code actions on every cursor move: the only way to know it is in
        // use, and in which file, when the user does not type
        codeActionProvider: true,
    },
}));
// Not didOpen: Zed opens files in the background, such as all the restored tabs
connection.onDidChangeTextDocument(({ textDocument }) => onActivity(textDocument.uri));
connection.onDidSaveTextDocument(({ textDocument }) => onActivity(textDocument.uri));
connection.onCodeAction(({ textDocument }) => {
    void onActivity(textDocument.uri);
    return [];
});
connection.onShutdown(async () => {
    if (lastActivity !== undefined) {
        await heartbeats.close(new Date(Math.min(Date.now(), lastActivity + IDLE_MS)));
    }
});

setInterval(async () => {
    if (lastActivity === undefined) {
        return;
    }
    if (Date.now() - lastActivity <= IDLE_MS) {
        // Read again each time, so a checkout is picked up
        await heartbeats.beat(await currentData());
    } else {
        // Nothing was sent after that, as only activity in the last minute extends it
        await heartbeats.close(new Date(lastActivity + IDLE_MS));
    }
}, INTERVAL_MS);

connection.listen();
