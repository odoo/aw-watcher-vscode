// Zed extensions are WebAssembly and can only start a language server, which gets the
// editor events. This one is `../server.ts`, which shares its code with the VS Code
// extension: it is installed from npm and run with the Node.js of Zed.

use std::env;

use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

const PACKAGE: &str = "aw-watcher-zed-odoo";
const SERVER: &str = "node_modules/aw-watcher-zed-odoo/dist/server.js";

struct Extension {
    installed: bool,
}

impl Extension {
    fn install(&mut self, id: &LanguageServerId) -> Result<()> {
        if self.installed {
            return Ok(());
        }
        let installed = zed::npm_package_installed_version(PACKAGE)?;
        match zed::npm_package_latest_version(PACKAGE) {
            Ok(latest) if installed.as_ref() != Some(&latest) => {
                zed::set_language_server_installation_status(
                    id,
                    &zed::LanguageServerInstallationStatus::Downloading,
                );
                zed::npm_install_package(PACKAGE, &latest)?;
            }
            Ok(_) => {}
            // Offline: keep the installed version
            Err(_) if installed.is_some() => {}
            Err(err) => return Err(err),
        }
        self.installed = true;
        Ok(())
    }
}

impl zed::Extension for Extension {
    fn new() -> Self {
        Self { installed: false }
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // A local build instead, for development:
        // "lsp": { "aw-watcher-odoo": { "binary": { "path": "node", "arguments": ["<repo>/zed/dist/server.js", "--stdio"] } } }
        if let Some(binary) = LspSettings::for_worktree(id.as_ref(), worktree)?.binary {
            if let Some(path) = binary.path {
                return Ok(zed::Command {
                    command: path,
                    args: binary.arguments.unwrap_or_default(),
                    env: Default::default(),
                });
            }
        }

        self.install(id)?;
        let server = env::current_dir().map_err(|e| e.to_string())?.join(SERVER);
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server.to_string_lossy().into_owned(), "--stdio".to_string()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(Extension);
