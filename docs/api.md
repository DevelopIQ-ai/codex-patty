# API streaming privacy

Live SSE subscribers receive normalized provider deltas while connected. Patty persists only event ordering/type metadata for `delta` and approval events; it does not persist provider output content. Late SSE replay therefore provides redacted delta markers and terminal semantics, not prior generated text.
