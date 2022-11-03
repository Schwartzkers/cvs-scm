# CVS for Visual Studio Code

The extension provides CVS (Concurrent Versions System) support to VS Code. CVS is an older Source Control Management (SCM) system. The extension integrates CVS into VS Code's SCM interface for a familar user experience such as git.

## Features

The extenstioin will automatically activate when it detects source code managed by CVS. It provides the following features:
- Add new file or folder to the repository:
- Remove file from repository:
- Commit changes to the repository:
- Merge changes from the repository into local copy
- Discard local changes and revert to the repository revision.
- View diffs between locally modifed file and repository revision.
- Display branch and revision number of file opened in active editor.

## Source Control States

![alt text](resources/images/resourceStates.png "CVS Resource States")

The following describes the possible states for a source control resource:

- `M  (Staged Changes/Changes) Locally Modifed`
- `A  (Staged Changes/Changes) Locally Added`
- `R  (Staged Changes/Changes) Locally Removed`
- `D  (Changes) Locally Deleted`
- `R  (Repository Changes) Removed from repository`
- `F  (Repository Changes) New Directory found in repository`
- `M  (Repository Changes) Needs Merge with repository`
- `NC (Conflicts) Needs Checkout from repository`
- `P  (Repository Changes) Needs Patch from repository`
- `C  (Conflicts) File had conflicts on merge`
- `U  (Untracked) Resource is not part of source control`

### Staged Changes

Changes to be included in a commit must be staged. However, unlike git, additonal changes made to a staged item will not display under `Changes`. Think of `Staged Changes` as a collection of changed source control items that are selected for the next commit.
### Repository Changes

 To check for remote changes use the `Refresh Repository` icon. Remote changes detected by the extension are displayed here.
 
### Conflicts

When user intervention is required to solve merge conflicts.

 ![alt text](resources/images/resolveConflict.png "Resolve Conflict")

## Branch and Revision

The Branch (Sticky Tag) and Revision are displayed for the file opened in the active editor.

![alt text](resources/images/stickyTagRev.png "CVS Sticky Tag and Revision")

## Quick Diff

Both the regular diff (when the user clicks on the changed resource in the source control view) and the Quick Diff (available in the left margin of the text editor) are provided by the extension. 

![alt text](resources/images/quickDiff.png "CVS Quick diff")

![alt text](resources/images/gutterDiff.png "CVS Gutter diff")

## Pre-requisites
CVS client software is [installed](https://www.nongnu.org/cvs/).

## Supported CVS Version

The extension was developed using version 1.12.13-MirDebian-28 (client/server) of CVS. Older versions may not be compatible with the extension.

## Extension Settings

![alt text](resources/images/settings.png "CVS Settings")

## Known Issues

- The extension has been tested with Ubuntu 16.04 & 22.04 LTS. Issues encountered with Windows or macOS may not be resolved in a timely fashion.
