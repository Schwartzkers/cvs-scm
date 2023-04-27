# Change Log

All notable changes to the `cvs-scm` extension will be documented in this file.
ile.
## [v1.11.1]
- Pre-release version.
- Fix merging of branches in `WORKSPACE BRANCHES` view.
## [v1.11.0]
- Pre-release version.
- Separate workspace branches and commands into new `WORKSPACE BRANCHES` view.
- Add `Compare BRANCHES` view to display diffs between branches, selected via `WORKSPACE BRANCHES` view.
- Fix bug with merge branch to file, where all changes in worksapce were undone.
- Fix bug where the correct file type (e.g. .cpp) was lost during revision comparison.
## [v1.10.0]
- Official release of the 1.9 pre-release.
## [v1.9.5]
- Pre-release version.
- Add command in `BRANCHES` view to merge a branch to a individual file.
## [v1.9.4]
- Pre-release version.
- Fix race condition bug in `Discard All Changes` causing failure.
- Fix branch merging in `BRANCHES` view.
## [v1.9.3]
- Pre-release version.
- Add command in `BRANCHES` view to merge a branch into the working branch.
## [v1.9.2]
- Pre-release version.
- Make tree id for Head Revision in `FILE HISTORY` unique.
## [v1.9.1]
- Pre-release version.
- Added new options to `FILE HISTORY` view:
  - Switch file to revision
  - Update file to revision
## [v1.9.0]
- Pre-release version.
- Added LogOutputChannel.
- Enhanced the extension error messages.
## [v1.8.0]
- Official release of 1.7 pre-release.
## [v1.7.9]
- Pre-release version.
- Fix bug where unable to undo the add of file on older CVS versions.
## [v1.7.8]
- Pre-release version.
- Fix bug where CVS views registered with other SCM provders.
- Change revision token used in diff editors (e.g. `file.log (1.4) <-> file.log (1.5)`).
## [v1.7.7]
- Pre-release version.
- Fix bug where branches were not included in branch tree if the branch number was two digits or more.
## [v1.7.6]
- Pre-release version.
- Handle Branch names with `_` when comparing.
## [v1.7.5]
- Pre-release version.
- Add `BRANCHES` tree to list the branches available for the file opened in the active editor.
- Refactor code to reduce cvs server calls.
- Cache cvs data for unchanged files.
## [v1.7.4]
- Pre-release version.
- Fix issue where editor gutter diffs not updated after a commit.
- Add debounce for `FILE HISTORY` events for a better UI experience.
## [v1.7.3]
- Pre-release version.
- Handle nested branches (branch of branch) in `FILE HISTORY` view.
## [v1.7.2]
- Pre-release version.
- Handle branch numbers greater than 1 digit in cvs log (e.g. 1.3.20.2).
## [v1.7.1]
- Pre-release version.
- Change delimiter for cvs log parsing.
## [v1.7.0]
- Pre-release version.
- Added the `FILE HISTORY` tree view to list the file revisions for the current branch.
- Fix bug where diff editor was not updated after commiting a file included in diff editor.
## [v1.6.2]
- Add user facing error msgs for failed cvs operations.
## [v1.6.1]
- Add optimizations to parsing cvs update/status results.
- Improvements and optimizations to address Issue #5: `Runaway "cvs -Q update -C -p" operations`.
## [v1.6.0]
- Add multi-selection capability, resources that do not support the command are ignored.
## [v1.5.0]
- Add new resource group `Repository Changes` to distinguish from actual merge conflicts in `Conflicts`.
- Add command `merge-all` to `Repository Changes` resource group to merge all changes from the repository.
- Fix Issue #2: `windows line endings cause parseResources to fail`.
## [v1.4.0]
- Add option to `Discard All Changes` in the `Changes` resource group.
- Add command to `checkout` new folders discovered on repository not in local checkout.
- Add command to `ignore` new folders that are discovered on repository.
- Add extension setting to view and edit ignored folders.
## [v1.3.0]
- Add user confirmation for several commands (e.g. delete file, discard changes , etc).
## [v1.2.1]
- Fix slow refresh rate of CVS SCM resources.
## [v1.2.0]
- Add staging area for the changes selected for commit.
## [v1.1.0]
- Add the branch name and revision number of the file (of active editor) to the status bar.
## [v1.0.0]
- Initial release.