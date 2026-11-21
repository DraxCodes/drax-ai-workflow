# Context

The current script saves `{key,text,caret,focused}` and restores only on a key match.

A tempting shape is a host-side draft store keyed by thread id. A second tempting shape is a single global draft that survives every switch.