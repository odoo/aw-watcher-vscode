# aw-watcher-zed-odoo

Zed watcher for [ActivityWatch](https://activitywatch.net) that records the time spent
per Git branch, with the same data and heartbeat model as the VS Code extension of this
repository, whose code it shares (`../core`).

## What it records

Events of type `app.zed.activity` in the bucket `aw-watcher-zed-odoo_<hostname>`, with
the data:

```json
{
    "branch": "saas-19.2-timesheet_grid-assistant-outlook-abgh",
    "repository": "odoo-dev/enterprise"
}
```

The branch and repository of the last file edited or moved in, in a repository, with
the same rules as VS Code. They are read with the git command line, at most every 5
seconds per folder, so a checkout is picked up within the next minute.

## How

Zed tells extensions nothing about focus changes, tab switches or scrolling. A Zed
extension can only start a language server, which is told about edits, and about cursor
moves through code action requests (answered with no actions). So instead of "while
focused", Zed is considered in use for a minute after the last edit or cursor move:

- while in use, a heartbeat is sent every minute with a pulsetime of 80s;
- a new event starts as soon as the repository or the branch changes;
- a minute after the last edit or cursor move, the event ends with a 0s event with
  `"focused": false`.

Limitations:

- switching to an open tab is only seen at the next cursor move or edit in it;
- up to a minute is still counted after leaving Zed;
- only files of the languages listed in `extension.toml` start the language server.

## Layout

- `src/lib.rs`: the extension, compiled to WebAssembly by Zed. It installs the npm
  package `aw-watcher-zed-odoo` and runs it with the Node.js of Zed.
- `server.ts`: the language server, bundled with `../core` into `dist/server.js`, the
  only file of the npm package.

## Development

```sh
npm install            # in the root of the repository, for ../core
cd zed
npm install
npm run build          # type checks, and bundles dist/server.js
```

In Zed, run `zed: install dev extension` and pick this folder (Zed builds it, which
needs Rust installed with rustup). To use the local server instead of the npm package,
add to the Zed settings:

```json
"lsp": {
    "aw-watcher-odoo": {
        "binary": {
            "path": "/path/to/node",
            "arguments": ["/path/to/aw-watcher-vscode/zed/dist/server.js", "--stdio"]
        }
    }
}
```

Logs: `dev: open language server logs`, "ActivityWatch" server.

To publish the language server: `npm publish` in this folder (builds it first).
