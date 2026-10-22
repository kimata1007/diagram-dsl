# DSL specification, v0.1

This document defines the first deliberately small DSL. The DSL describes diagram meaning; the compiler chooses Mermaid syntax and generated identifiers.

## Design rules

- Do not require a diagram-type declaration or layout-direction declaration.
- Do not require users to invent Mermaid node IDs.
- Accept only the fixed statements below. This is a small language, not arbitrary English or an AI prompt.
- Infer an ER diagram from entity fields or `has` relationships. Otherwise, interpret flow statements as a flowchart.
- On unsupported or ambiguous syntax, return a line-numbered diagnostic instead of guessing.
- Keep Mermaid-specific escape hatches out of v0.1. They can be designed later without weakening the core grammar.

Names are either one bare word (`ArgoCD`) or a double-quoted name (`"Build API"`). Names are case-insensitive for identity; the spelling of their first declaration is used as the visible label. Indentation uses two spaces per level. Tabs are not allowed. In a flow diagram, declare a node's group membership with its `is a ...` statement before any connection that mentions it.

Blank lines are ignored. A line whose first non-space character is `#` is a comment.

## Flow diagrams

### Connections

```text
ArgoCD -> GitHub
ArgoCD -> GitHub: deploy
```

The arrow creates nodes as needed. Its optional label follows `:`. The initial compiler uses a left-to-right Mermaid flowchart and one solid, directed arrow form.

### Appearance

```text
ArgoCD is a yellow box
Database is a blue cylinder
```

Supported colors: `yellow`, `blue`, `gray`, `green`, `red`, `orange`, `purple`, `pink`, `white`, and `black`.

Supported shapes: `box`, `rounded box`, `circle`, `diamond`, and `cylinder`.

The color describes the node's fill. Text and border colors are chosen by the compiler for contrast. A node with no appearance statement is a plain box. A name can have at most one appearance statement.

### Nested groups

```text
Cluster contains:
  ArgoCD is a yellow box
  GitHub is a blue box
  Storage contains:
    Registry is a gray cylinder

ArgoCD -> GitHub: deploy
GitHub -> Registry: publish
```

`contains:` creates a visual group. Children are indented by exactly two spaces. Groups can contain appearance declarations and other groups. Connections are written at the top level.

## Entity relationship diagrams

An entity header followed by indented fields, or a `has` relationship, selects ER mode.

```text
User:
  id: number key
  name: text

Posts:
  id: number key
  author_id: number

User has many Posts
```

Fields use `field_name: type` and may end in `key`. `key` means a primary key. Field names and types are bare identifiers; array types may end in `[]`.

Supported relationship forms:

```text
User has one Profile
User has many Posts
User has zero or one Settings
```

`has many` means one source entity relates to zero or more target entities. `has one` means exactly one target. `has zero or one` means an optional single target. Each relationship must refer to declared entities. Relationship labels are generated from the written phrase.

## Diagram selection

If an entity field declaration or `has` relationship appears, the source is parsed as an ER diagram. Flow statements and ER statements cannot be mixed. A flow source may contain connections, appearance statements, and nested groups.

## v0.1 limits

- Flow diagrams support only directed solid arrows. Dotted, bidirectional, and cardinality arrows are deferred.
- Flow connections must be at the top level; groups are visual containers for nodes.
- There are no per-edge styles, arbitrary CSS colors, custom Mermaid directives, or raw Mermaid blocks yet.
- ER diagrams support scalar field types, primary-key markers, and the three relationship forms above. Foreign-key validation and indexes are deferred.
- No implicit pluralization or singularization is performed. Entity names in a relationship must match their declarations exactly (ignoring case).
