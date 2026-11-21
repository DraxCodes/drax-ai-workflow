# 01 — Slugify drops a trailing separator

The project is a small Node package. The test suite fails on one case.

## Objective

Make `npm test` pass without changing the tests. The failing case is a slug that
ends with a separator; the expected output has no leading, trailing or repeated
separators.

## Floor

- `npm test`
- `npm run build`

## Evidence that counts as done

- The real `npm test` output, with the previously failing case passing.
- The diff, limited to `src/slugify.js`.
- A one-sentence cause: what the current code does and why the output differs.

## Scope

- Edit `src/slugify.js` only.
- Do not edit `fixtures/slugify.spec.js`.
- Do not add a dependency.

## Non-goals

Unicode transliteration, locale handling and a new API shape are out of scope.