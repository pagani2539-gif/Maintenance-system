# Stylesheet architecture

`index.css` is the stylesheet entry point. Its migration order is:

`tokens → reset → legacy compatibility → layout → components → table → pages → utilities → responsive → print`

Legacy rules are kept in `legacy.css` during migration, while the other files contain the canonical tokens, baseline reset, layout contract, shared components, table contract, responsive contract, page scopes, utilities, and print rules.

New rules must be added to the narrowest applicable file and must not reintroduce global selectors that override `.data-table`, `.btn`, `.card`, or layout primitives without an explicit compatibility comment.
