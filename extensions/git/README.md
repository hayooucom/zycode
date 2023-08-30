# Git integration for ZY Studio Code

**Notice:** This extension is bundled with ZY Studio Code. It can be disabled but not uninstalled.

## Features

See [Git support in VS Code](https://code.visualstudio.com/docs/editor/versioncontrol#_git-support) to learn about the features of this extension.

## API

The Git extension exposes an API, reachable by any other extension.

1. Copy `src/api/git.d.ts` to your extension's sources;
2. Include `git.d.ts` in your extension's compilation.
3. Get a hold of the API with the following snippet:

 ```ts
 const gitExtension = zycode.extensions.getExtension<GitExtension>('zycode.git').exports;
 const git = gitExtension.getAPI(1);
 ```
