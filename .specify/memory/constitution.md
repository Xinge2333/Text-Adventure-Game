<!--
Sync Impact Report
Version change: N/A → 1.0.0
Modified principles: Initial adoption
Added sections: Core Principles; Mandatory Artifacts; Execution Workflow; Governance
Removed sections: None
Templates requiring updates:
- ✅ .specify/templates/plan-template.md (Constitution Check gates aligned to principles)
- ✅ .specify/templates/spec-template.md (referenced principle expectations within user stories)
- ✅ .specify/templates/tasks-template.md (reinforced test-first and independence requirements)
Follow-up TODOs: None
-->

# Try 4th Constitution

## Core Principles

### Independent Value Increments
- Every feature MUST be decomposed into user stories that deliver demonstrable value independently and can ship on their own.
- Plans, specs, and task lists MUST label story dependencies and parallelization so independence is auditable during reviews.
Rationale: Protecting incremental delivery keeps scope controlled and preserves rollback options.

### Spec-Plan-Tasks Chain
- New work MUST progress through research → plan.md → spec.md → tasks.md before implementation starts, with each artifact linking to the previous one.
- Open questions MUST be captured as `NEEDS CLARIFICATION` items until resolved, and work MAY NOT advance while critical gaps remain.
Rationale: The artifact chain creates traceability from intent to execution and blocks work that lacks clarity.

### Test-First Verification
- Tests covering each story and foundational change MUST be authored before implementation and observed failing at least once.
- Tasks and commits MUST reference the governing test assets, and failing tests MUST block merges and releases.
Rationale: Test-first discipline proves intent, catches regressions early, and documents expected behaviour.

### Explicit Contracts
- Interfaces, APIs, CLIs, and data exchanges MUST be defined under `specs/.../contracts/` before implementation, including schemas and invocation examples.
- Breaking contract changes MUST ship with compatibility guidance, migration steps, and explicit sign-off from affected maintainers.
Rationale: Clear contracts stabilize collaboration and defend downstream consumers from surprises.

### Operational Transparency
- Runtime code MUST emit structured logs and metrics that map to user story acceptance criteria and critical error paths.
- Plans and tasks MUST enumerate the observability checkpoints that will confirm functionality and surface regressions.
Rationale: Transparent systems enable rapid diagnosis, reliable support, and trustworthy automation.

## Mandatory Artifacts
- `plan.md` documents scope, architecture, Constitution Check outcomes, and identifies dependencies before any implementation work begins.
- `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` MUST be delivered when the plan references them; any omission demands a written justification in the plan.
- `spec.md` MUST capture user stories, priorities, and acceptance scenarios that satisfy Independent Value Increments, including explicit `NEEDS CLARIFICATION` tags for gaps.
- `tasks.md` MUST map every task to a user story, distinguish blocking foundational work, and flag parallelizable tasks to preserve traceability.

## Execution Workflow
1. Run `/speckit.plan` once the Constitution Check confirms compliance with every principle, and circulate the plan for review before moving forward.
2. Produce `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md` as dictated by the plan, incorporating reviewer feedback and resolving blockers before implementation.
3. Generate `tasks.md`, author failing tests, and only then begin implementation work, keeping tasks, commits, and tests synchronized through delivery and review.

## Governance
- Authority: This constitution supersedes conflicting guidance; deviations require explicit written approval recorded alongside the affected artifact.
- Amendments: Proposals MUST include a change summary, risk analysis, and migration plan; two maintainers MUST approve updates before adoption.
- Versioning: Constitution versions follow Semantic Versioning (MAJOR.MINOR.PATCH) based on impact to principles, governance, or required artefacts.
- Compliance Reviews: Every pull request, plan, spec, and task list MUST document how each principle is satisfied; reviewers MUST block merges when evidence is missing.
- Audits: A retrospective compliance audit MUST occur at least once per release cycle to verify adherence and surface amendment proposals.

**Version**: 1.0.0 | **Ratified**: 2025-10-13 | **Last Amended**: 2025-10-13
