# VFang GitHub Rebrand

**Date:** 2026-07-30

## Goal

Rename the public GitHub identity of the project from **Fang** to **VFang**
without changing the identifiers used by installed systems or published release
assets.

The canonical repository becomes:

`https://github.com/bladeandsoulx/vfang-razer-linux`

## Scope

The rebrand covers the maintained GitHub-facing surfaces:

- repository name: `fang-razer-linux` → `vfang-razer-linux`;
- repository About description and topics;
- current README branding, image alternative text, support wording, and
  canonical repository links;
- the current contributing guide, hardware-testing guide, and GitHub issue
  template;
- canonical repository URLs in maintained metadata, workflows, installer
  configuration, updater code, service documentation, release tooling, and
  their tests;
- published GitHub release titles, using `VFang` consistently.

The README will contain a short compatibility note explaining that VFang still
uses the existing installed identifiers. Instructions must use the real current
command, package, application-entry, and asset names rather than pretending
that those identifiers have already been migrated.

## Compatibility Boundary

This pass does **not** rename:

- Rust crates, binaries, commands, or package names: `fang`, `fangd`;
- the systemd service `fangd.service`;
- the `fang` Unix group;
- `/run/fangd.sock` or other filesystem/configuration paths;
- environment variables such as `FANGD_ADDR`;
- D-Bus, Tauri, desktop-file, bundle, or updater identifiers;
- existing release tags, checksums, attestations, or immutable assets;
- historical changelog prose, completed design specifications, or
  implementation plans;
- user-visible strings inside the installed desktop application, daemon, or
  installer, except where a string is a canonical repository URL.

`Fang`, `fang`, and `fangd` may therefore remain in the repository when they
refer to a compatibility identifier, current installed behavior, an immutable
artifact, or a historical record. The rebrand is not a blind
case-insensitive replacement.

## Tracked-Content Changes

### Public documentation

The README heading and project prose use `VFang`. Screenshot alternative text,
support headings, credits, and the non-affiliation statement use the new brand.
Install and removal examples retain the actual technical identifiers.

`CONTRIBUTING.md`, `HARDWARE_TESTING.md`, and visible issue-template copy use
`VFang` when referring to the current project. Historical release entries in
`CHANGELOG.md` retain their original product wording, while their raw repository
links may move to the new canonical URL.

### Canonical URLs

Every active reference to
`github.com/bladeandsoulx/fang-razer-linux` is classified before editing:

- maintained links and operational repository constants change to
  `github.com/bladeandsoulx/vfang-razer-linux`;
- old links embedded in historical design records remain unchanged;
- installer, updater, publishing, CI, and contract tests change together with
  the code they verify.

The source-clone example changes both the URL and checkout directory to
`vfang-razer-linux`.

### GitHub metadata and releases

The repository is renamed with GitHub's repository rename operation. The About
description begins with `VFang`, and the `vfang` topic is added without removing
the existing discoverability topics.

Published release titles are normalized to `VFang`, including older releases.
Release bodies are retained as historical records unless a canonical repository
link must be corrected. Tags, assets, checksums, and attestations are never
modified. The existing immutable-release policy remains enabled.

## Execution Order

1. Create an isolated rebrand branch from the current `origin/main`, keeping the
   in-progress Fedora work separate.
2. Add a focused behavior test for the updater's canonical release URL. Audit
   public branding and the compatibility allowlist directly rather than adding
   source-text tests for human prose.
3. Update maintained tracked content and run the repository's complete
   verification suite.
4. Commit and push the reviewed changes.
5. Rename the GitHub repository to `vfang-razer-linux`.
6. Immediately update the local `origin` remote to the new canonical URL.
7. Update the GitHub About description, topics, and release titles.
8. Merge the verified tracked-content change to the default branch.
9. Verify the new repository page, default-branch README, releases, Actions,
   clone/fetch behavior, and the old repository redirect.

The old repository slug must not be reused, because doing so would disable
GitHub's redirect from the old location.

## Failure Handling

- If the requested repository slug is unavailable, stop before changing any
  metadata and report the conflict.
- If the repository rename succeeds but a later metadata update fails, keep the
  new name, update `origin`, and retry only the failed idempotent metadata
  operation.
- If tracked-content tests fail, do not merge the branch or alter the live
  repository name.
- If a release-title update fails, do not touch its immutable assets; report the
  exact tag and leave the remaining release data intact.
- If a GitHub Action references this repository as a reusable external action,
  update that reference before renaming because GitHub does not redirect action
  calls. The current repository must be checked explicitly for this condition.

## Verification

Local verification must demonstrate:

- all existing Rust, Node, installer, packaging, and release-contract tests
  pass;
- the version-synchronization check passes;
- active canonical URLs use `vfang-razer-linux`;
- `VFang` appears on the maintained public documentation surfaces;
- compatibility identifiers still use their original exact spelling;
- remaining `Fang` occurrences are confined to the documented compatibility or
  historical allowlist;
- no unrelated tracked files changed.

Live GitHub verification must demonstrate:

- `bladeandsoulx/vfang-razer-linux` is the canonical repository;
- its About description and topics use VFang;
- the default README presents VFang and its links resolve;
- all published release titles use VFang;
- immutable releases remain enabled and their assets/checksums are unchanged;
- CI on the merged default branch is green;
- the former repository URL redirects to the new repository;
- the local clone fetches from the new `origin`.
