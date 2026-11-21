# Key — 01 slugify

## Expected outcome

`slugify("  Hello, World!  ")` returns `"hello-world"`; a trailing separator is
trimmed, repeated separators collapse, and the existing cases still pass.

A correct fix normalizes the string, replaces non-alphanumeric runs with one
hyphen, then trims hyphens from both ends. It does not change the test, add a
dependency, or rewrite the module's public API.

## Scoring anchors

- **4 correctness** — all tests pass; the cause is named; no test changed.
- **3** — tests pass but the cause is a guess or the fix is broader than needed.
- **2** — the failing case passes but another case regresses.
- **0–1** — tests still fail, or the test file was edited.

## Common wrong turns

- Only trimming the end, so `"  Hello"` keeps a leading hyphen.
- Replacing `\W+` without handling the comma and spaces in one pass.
- Adding `lodash` or a slug library.
- Editing the test to match the buggy output.