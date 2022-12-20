# Change Log

All notable changes to the `cvs-scm` extension will be documented in this file.
## [v1.7.4]
- Pe-release version.
- Fix issue where editor gutter diffs not updated after a commit.
- Add debounce for `FILE HISTORY` events for a better UI experience.
## [v1.7.3]
- Pe-release version.
- Handle nested branches (branch of branch) in `FILE HISTORY` view.
## [v1.7.2]
- Pe-release version.
- Handle branch numbers greater than 1 digit in cvs log (e.g. 1.3.20.2).
## [v1.7.1]
- Pe-release version.
- Change delimiter for cvs log parsing.
## [v1.7.0]
- Pe-release version.
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