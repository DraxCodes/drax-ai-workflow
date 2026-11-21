# Context

The page needs status, a changelog from git history, coverage and stack badges. The existing read route returns JSON; the renderer takes a page model.

A tempting shape is a small React island that fetches on mount. A second tempting shape is a nightly job that writes static HTML.