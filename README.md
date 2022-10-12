# CVS for Visual Studio Code

The extension provides CVS (Concurrent Versions System) support to VS Code. CVS is an older Source Control Management (SCM) system. The extension integrates CVS into VS Code's SCM interface for a familar user experience such as git.


## Pre-requisites
CVS client software is [installed](https://www.nongnu.org/cvs/).
## Features

The extenstioin will automatically activate when it detects source code managed by CVS. It provides the following features:
- Add files.
- Remove files
- Undo add or remove of file.
- Revert files to repository version.
- Commit files(s).
- Merge changes from the repository into local copy. 
- View diffs between locally modifed file and repository version.

## Supported CVS Version

The extension was developed using version 1.12.13-MirDebian-28 (client/server) of CVS. Older versions may not be compatible with the extension.

## Extension Settings

None at this time.

## Known Issues

The extension has only been tested with Ubuntu 22.04 LTS. Issues encountered with Windows or macOS may not be resolved in a timely fashion. 
