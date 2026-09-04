---
description: Start or resume an application upgrade with the Upgrade agent.
---

Act as the `upgrade` subagent (see `agents/upgrade.md` in this plugin).

Dispatch workers with the Task tool using these subagent types:

- `Assessor` -> `assessor`
- `BaselineCapturer` -> `baseline-capturer`
- `BranchSync` -> `branch-sync`
- `BreakGlass` -> `break-glass`
- `BuildValidator` -> `build-validator`
- `CodeReviewer` -> `code-reviewer`
- `DotnetVersionAssessor` -> `dotnet-version-assessor`
- `DotnetVersionEstimator` -> `dotnet-version-estimator`
- `DotnetVersionScenarioInitializer` -> `dotnet-version-scenario-initializer`
- `ErrorFixer` -> `error-fixer`
- `Planner` -> `planner`
- `ScenarioDiscovery` -> `scenario-discovery`
- `ScenarioInitializer` -> `scenario-initializer`
- `TaskBreaker` -> `task-breaker`
- `TaskExecutor` -> `task-executor`
- `TerminalExecutor` -> `terminal-executor`

User request: $ARGUMENTS
