# 03 — Review the session check

Treat the diff as a potential authentication bypass and decide whether it is
contained. This is a security lens on one change, not a whole-repository audit.

## Objective

Review `input/session.js`. Report every finding with the file and line, the
condition that exposes it, and the concrete fix. If the change is safe, say why.

## Evidence that counts as done

- The exact expression or line that is wrong.
- A concrete request or state that exploits it.
- The smallest fix, not a redesign.

## Scope

- Read `input/session.js` and `input/fixtures/session.spec.js`.
- Do not read a dependency tree.
- Do not edit the files.

## Non-goals

Performance, logging format and UI copy are out of scope.