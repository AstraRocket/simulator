# Branch protection

The GitHub rulesets that enforce the branch flow in [`DEVELOPER.md`](./DEVELOPER.md#branches). They live in the repository settings, not in the code, so this page is the record of what they should say. Set them up under **Settings → Rules → Rulesets → New branch ruleset**.

There are three rulesets. They share most settings and differ in two: which merge methods they allow, and whether a PR must be up to date with its target before it merges.

| Ruleset          | Targets          | Merge methods    | Up to date before merging |
| ---------------- | ---------------- | ---------------- | ------------------------- |
| Working branches | `dev`, `hotfix`  | Squash and Merge | Off                       |
| Beta             | `beta`           | Merge only       | On                        |
| Production       | `master`         | Merge only       | On                        |

## Shared settings

Every ruleset carries these.

| Setting                                  | Value                                   | Why                                                                                                                                                  |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enforcement status                       | **Active**                              |                                                                                                                                                      |
| Restrict deletions                       | On                                      | The branch cannot be deleted by accident.                                                                                                            |
| Block force pushes                       | On                                      | Nobody can rewrite a branch other branches are built from.                                                                                           |
| Require a pull request before merging    | On                                      | Only a PR runs the gates (`ci.yml` has no `push` trigger), so this is what keeps an untested change off the branch.                                  |
| Required approvals                       | **0** while there is one maintainer     | GitHub does not let you approve your own PR, so 1 locks a sole maintainer out. Raise it once someone else reviews.                                   |
| Dismiss stale approvals                  | Optional                                | Only matters once approvals are required.                                                                                                            |
| Require conversation resolution          | Optional                                | Only matters once there are reviewers.                                                                                                               |
| Require status checks to pass            | On, with **`verify`**                   | `CI / verify` is the one check that stands for every gate (see "Pull requests" in `DEVELOPER.md`). The picker lists it only after it has run once; it can be typed in before then. |
| Require linear history                   | **Off**                                 | It forbids merge commits, which the promotion PRs need (see below).                                                                                  |
| Bypass list                              | Empty                                   | See [Bypass](#bypass).                                                                                                                               |

## Working branches: `dev` and `hotfix`

- **Allowed merge methods: Squash and Merge.** Feature and fix PRs land here and can be squashed. Merge is needed for the back-merge of `master` into both after a hotfix ships.
- **Require branches to be up to date before merging: Off.** Most PRs land here, and making each one catch up with the branch first is busywork the up-to-date rule on `beta` and `master` already covers.

## Beta: `beta`

- **Allowed merge methods: Merge only.** The PRs into `beta` are promotions from `dev`, plus the back-merge of `master` after a hotfix. A squashed promotion gives `beta` new copies of changes `dev` already has in another form, so the two drift apart and every later promotion shows old changes again or conflicts.
- **Require branches to be up to date before merging: On.** CI tests the merge of the PR into `beta` as it stood when the run started. This makes that tested result exactly what `beta` gets.

## Production: `master`

Target `master` by name, or use the **Default branch** target while `master` is the default.

- **Allowed merge methods: Merge only.** Both PRs into `master`, from `beta` and from `hotfix`, are promotions, for the same reason as `beta`.
- **Require branches to be up to date before merging: On.** `deploy.yml` publishes every merge into `master` and runs no gates of its own. Without this, a PR merged after `master` moved publishes a combination no gate ran on.

## Bypass

Leave the bypass list empty. If you want an emergency override, add yourself with **For pull requests only**, which lets you merge a PR past a failing rule but still never push to the branch directly. Do not use **Always**: it allows a direct push to `master`, and `deploy.yml` publishes that without any gate.

## What not to protect

- **The `data` branch.** `sync-catalogs.yml` pushes the catalogs straight to it on a schedule, and a pull request rule there would stop the sync. So never target **All branches**.
- **Required deployments.** Leave **Require deployments to succeed** off. The dev, beta and hotfix sites deploy from their own repositories, so this repository never sees those deployments.

## What rulesets cannot enforce

A ruleset cannot say which branch a PR comes from. Nothing stops a PR from a feature branch straight into `master`, or from `dev` into `master`, past `beta`. If that needs enforcing rather than relying on review, add a job to `gates.yml` that fails when the base is `master` and the head is anything but `beta` or `hotfix` (and when the base is `beta` and the head is not `dev` or `master`). `verify` stands for every `gates.yml` job, so the new job is enforced without adding another required check.
