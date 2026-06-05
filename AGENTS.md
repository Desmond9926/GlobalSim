# AGENTS.md

## Project Type

Multi-Agent Geopolitical Simulation Platform

## Global Rules

When implementing features:

1. Never introduce hardcoded geopolitical assumptions.
2. All entities must be data-driven.
3. Every simulation output must be explainable.
4. Preserve reproducibility.
5. Favor explicit schemas over implicit structures.

## Architecture Rules

Maintain strict separation between:

- Data Ingestion
- World State
- Agent Logic
- Simulation Engine
- Report Generation

No cross-layer coupling without documented interfaces.

## Before Writing Code

Always:

1. Read `plan.md`.
2. Read `TaskBoard.md`.
3. Read `decision_log.md`.

## Decision Making

If multiple implementations are possible:

Choose the solution that:

- improves explainability
- improves observability
- improves testability

rather than minimizing code length.

## Deliverables

Every completed task must include:

- code
- tests
- documentation updates
- progress update in `TaskBoard.md`
- `decision_log.md` updates
