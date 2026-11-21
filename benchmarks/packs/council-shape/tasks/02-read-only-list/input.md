# Context

The pane needs to render the list it already receives. The current port returns summaries ordered by `updatedAt`; the picker filters subagents again.

A tempting shape is a new REST endpoint that returns a pre-rendered list. A second tempting shape is a client-side poller that refreshes every second.