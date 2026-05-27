# Exact Live Runbook for `areksaxyz/test-poc` -> `triguardai/test-poc`

Mapping:

- `repo-a`: `areksaxyz/test-poc`
- `repo-b`: `triguardai/test-poc`

Current state I verified:

- both repos are public
- both repos are currently empty
- from the GitHub auth active in this environment:
  - I have push/admin on `areksaxyz/test-poc`
  - I only have pull on `triguardai/test-poc`

That means I can prepare the exact flow for both repos, but I cannot push directly to `triguardai/test-poc` from this environment unless auth changes.

## Goal

Produce live owned-repo evidence for:

1. official MCP `create_inline_comment`
2. official buffer append to `/tmp/inline-comments-buffer.jsonl`
3. official `post-buffered-inline-comments.ts`
4. stale buffer replay into unrelated current PR
5. GitHub API proof that the comment appears on `repo-b`

## Runner requirement

You need one shared non-ephemeral self-hosted runner label that resolves to the same host for both repos.

I will refer to it as:

```text
YOUR_SHARED_RUNNER_LABEL
```

If that label points to multiple hosts, the demo becomes nondeterministic.

## Repo bootstrap plan

Because both repos are empty, use this simple layout:

- `main` contains:
  - `README.md`
  - `poc/inline-buffer-seed-via-mcp.mjs`
  - `poc/verify-pr-inline-comment.mjs`
  - `.github/workflows/repo-a-seed-buffer.yml` in `repo-a`
  - `.github/workflows/repo-b-replay-buffer.yml` in `repo-b`

- PR branch in `repo-a`:
  - any trivial change, just to create an open PR number

- PR branch in `repo-b`:
  - must modify `README.md` line 1 so the replayed inline comment has a valid sink

## Exact sequence

### A. Bootstrap `areksaxyz/test-poc`

1. Create an initial `main` commit with `README.md`.
2. Add:
   - `poc/inline-buffer-seed-via-mcp.mjs`
   - `poc/verify-pr-inline-comment.mjs`
   - `.github/workflows/repo-a-seed-buffer.yml`
3. In `.github/workflows/repo-a-seed-buffer.yml`, replace:

```text
YOUR_SHARED_RUNNER_LABEL
```

with your real shared self-hosted runner label.

4. Push to `main`.
5. Create a throwaway PR branch, for example `seed-source-pr`.
6. Make any small change and open PR `repo-a` -> `main`.

### B. Bootstrap `triguardai/test-poc`

1. Create an initial `main` commit with `README.md`.
2. Add:
   - `poc/inline-buffer-seed-via-mcp.mjs`
   - `poc/verify-pr-inline-comment.mjs`
   - `.github/workflows/repo-b-replay-buffer.yml`
3. In `.github/workflows/repo-b-replay-buffer.yml`, replace:

```text
YOUR_SHARED_RUNNER_LABEL
```

with the exact same runner label used in `repo-a`.

4. Push to `main`.
5. Create a PR branch, for example `replay-target-pr`.
6. Change `README.md` line 1 and open PR `repo-b` -> `main`.

## Run A

Dispatch workflow:

- repo: `areksaxyz/test-poc`
- workflow: `Seed Claude Inline Comment Buffer`

Inputs:

- `target_pr`: PR number from `repo-a`
- `body_marker`: leave empty to auto-generate
- `comment_path`: `README.md`
- `comment_line`: `1`

Capture:

- `RUNNER_NAME`
- `HOSTNAME`
- `RUNNER_TEMP`
- `RUN_A_UNIQUE_BODY`
- `BUFFERED_COMMENT_PATH`
- `BUFFERED_COMMENT_LINE`
- `BUFFER_ENTRY_APPENDED=true`

## Run B

Dispatch workflow:

- repo: `triguardai/test-poc`
- workflow: `Replay Claude Inline Comment Buffer`

Inputs:

- `target_pr`: PR number from `repo-b`
- `expected_body_marker`: exact `RUN_A_UNIQUE_BODY` from Run A

Capture:

- `RUNNER_NAME`
- `HOSTNAME`
- `RUNNER_TEMP`
- `BUFFER_SHA256_BEFORE_REPLAY`
- `BUFFER_SHA256_AFTER_REPLAY`
- `FOUND_MATCH=true`
- `COMMENT_REPO=test-poc`
- `COMMENT_PR=<repo-b pr number>`
- `MATCH_COMMENT_ID`
- `MATCH_HTML_URL`

## Evidence split for the report

### Evidence A

Use the deterministic local harness:

- [inline-buffer-replay-run.mjs](/home/nobcoder/claude/poc/inline-buffer-replay-run.mjs:1)
- [inline-buffer-replay-output.txt](/home/nobcoder/claude/poc/inline-buffer-replay-output.txt:1)

This proves:

- stale buffer persists
- run B does not create a new buffer entry
- stale entry is replayed into a different repo/PR with run B token

### Evidence B

Use the owned-repo live flow above.

This proves:

- the stale entry was created through the official Anthropic MCP server path
- the replay was executed through Anthropic's real post-step logic
- the comment actually appeared in `triguardai/test-poc` PR via GitHub API verification

## Operational note

Because these repos are public, keep the workflows:

- `workflow_dispatch` only
- minimal permissions only

After capture, you can remove the helper files and workflows, or delete the temporary branches.
