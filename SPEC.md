# Diagram DSL specification

Version: 0.2.0

This document is the source of truth for the language. The DSL describes diagram meaning in short, fixed statements; the compiler chooses Mermaid syntax, layout defaults, identifiers, and escaping. It is not arbitrary English and is not a Mermaid pass-through.

## Design principles

- Write diagrams in fenced code blocks on GitHub, or in a Notion code block.
- Keep common statements short and readable without requiring Mermaid keywords such as `flowchart`, `LR`, or generated node IDs.
- Preserve v0.1 flow and ER inputs. New diagram types use an explicit, lowercase type header because arrows such as `A -> B` are ambiguous between flows and sequence messages.
- Accept only documented syntax. Do not guess what unsupported text means; return line-numbered diagnostics.
- Compile and render locally in the browser. The extension does not send page text to a server.
- Use two spaces per indentation level. Tabs and control characters are errors. Blank lines and lines beginning with `#` are ignored.
- Names are either a bare identifier (`ArgoCD`) or a double-quoted name (`"Build API"`). Inside quoted names, only `\"` and `\\` escapes are allowed. Names are case-insensitive for identity; the first spelling is displayed.

## Opt-in on supported sites

On GitHub, mark the fenced block with the language identifier `diagram-dsl`:

````markdown
```diagram-dsl
ArgoCD -> GitHub: deploy
ArgoCD is a yellow box
```
````

In a Notion code block, put `# diagram-dsl` on the first line. The extension removes this marker before compiling. A code block without the marker is not treated as a diagram.

## Diagram selection

Unmarked v0.1 flowcharts and ER diagrams continue to be inferred from their statements. All additional types start with a type header and indent their contents by two spaces:

```text
sequence:
  Browser -> API: request
  API -->> Browser: response
```

Supported headers: `sequence:`, `state:`, `class:`, `mindmap:`, `pie:`, `gantt:`, `timeline:`, `journey:`, and `quadrant:`. A header is required even when the body could otherwise look like a flow diagram.

## Flow diagrams (default)

Connections create nodes as needed. The optional label follows `:`.

```text
ArgoCD -> GitHub: deploy
GitHub ..> Registry: publish optionally
Registry ==> Cluster: release
Operator <-> Dashboard: synchronize
```

The fixed arrow forms are `->` (solid directed), `..>` (dotted directed), `==>` (thick directed), and `<->` (bidirectional). The compiler emits a left-to-right flowchart. Layout direction is intentionally not a user-level option in this version.

Appearance statements use one color and one shape:

```text
ArgoCD is a yellow box
Database is a blue cylinder
User is a green rounded box
```

Colors: `yellow`, `blue`, `gray`, `green`, `red`, `orange`, `purple`, `pink`, `white`, `black`.

Shapes: `box`, `rounded box`, `circle`, `diamond`, `cylinder`.

Nested groups are visual containers. Nodes may be styled after a connection; source order does not change their group membership.

```text
Cloud contains:
  Cluster contains:
    ArgoCD is a yellow box
    GitHub is a blue box
  Registry is a gray cylinder

ArgoCD -> GitHub: deploy
GitHub ..> Registry: publish
```

Connections are written at the top level. Empty groups and duplicate appearance declarations are errors.

## Entity relationship diagrams (ER)

An entity field block or `has` relationship selects ER mode. Entities need at least one field.

```text
User:
  tenant_id: number key
  id: number key
  email: text unique
  nickname: text?

Post:
  id: number key
  author_id: number references User.id

User has many Post
Post has one User
User has zero or one Profile
```

Field form: `field_name: type`, optionally followed by `key`, `unique`, or `references Entity` / `references Entity.field`. A type may end in `[]` for an array and/or `?` for an optional value. Multiple `key` fields form a composite primary key. The compiler validates referenced entities and, when specified, fields. Mermaid marks key, foreign-key, and unique fields as `PK`, `FK`, and `UK`.

Relationship forms: `A has one B`, `A has many B`, and `A has zero or one B`. These mean exactly one, zero or more, and zero or one target respectively. Relationships must name declared entities. Flow and ER statements cannot be mixed in one unmarked block.

## Sequence diagrams

Messages are ordered by their source order. The first mention of a participant fixes its declaration order.

```text
sequence:
  Browser -> API: request
  API ->> Database: query
  Database -->> API: rows
  API --> Browser: response
```

Message arrows: `->` (solid), `->>` (solid with open arrowhead), `-->` (dashed), and `-->>` (dashed with open arrowhead). Every message requires a label after `:`. Participants are inferred. Notes, activation blocks, `alt`, `loop`, and parallel regions are not supported yet.

## State diagrams

```text
state:
  start -> Idle: boot
  Idle -> Running: start
  Running -> Failed: error
  Running -> Done: success
  Done -> end
```

`start` and `end` denote the Mermaid initial/final state marker. All other names identify states. Each line is a transition; an optional label follows `:`.

## Class diagrams

```text
class:
  User has id: number
  User has email: text
  Admin extends User
  AuditLog implements Repository
```

Members use `Class has member: type`. Relationships use `Child extends Parent` or `Class implements Interface`. Member visibility and operations are compiler defaults and are not configurable in this version.

## Mind maps

The first item is the single root. Indentation creates child levels.

```text
mindmap:
  Product
    Editor
      Preview
      Diagnostics
    Compiler
      Flow diagrams
      ER diagrams
```

Each item is one bare or quoted name. Indentation may increase by only one level at a time.

## Pie charts

```text
pie:
  Chrome: 65
  Firefox: 25
  Safari: 10
```

Each line is a label and a non-negative number. Labels may be quoted to contain spaces. Values are data, not pre-normalized percentages.

## Gantt charts

```text
gantt:
  title: Launch plan
  Design: 2026-10-01 to 2026-10-05
  Implementation: 2026-10-06 to 2026-10-18
```

The title is optional. Task date ranges use valid ISO dates in ascending order. The compiler calculates inclusive duration and places tasks in one `Plan` section. Dependencies and milestones are not supported yet.

## Timelines

```text
timeline:
  title: Releases
  2025: First prototype
  2026: Browser extension
```

Each event is a four-digit year followed by a short description. Events remain in source order.

## User journeys

```text
journey:
  title: First use
  Discover contains:
    Read the guide: 4 by User
  Create account contains:
    Join the workspace: 5 by User
```

Each section uses `Name contains:` and contains one or more tasks. Task form: `description: score by actor`, where score is an integer from 1 to 5.

## Quadrant charts

```text
quadrant:
  title: Priorities
  x-axis: Effort to Value
  y-axis: Risk to Impact
  Quick win: 0.2, 0.9
  Large bet: 0.8, 0.8
```

Axis labels and title are optional. Points use normalized coordinates from 0 through 1.

## Diagnostics, stability, and limits

- Diagnostics report a one-based source line and column. Invalid syntax never falls back to guessed meaning.
- Generated identifiers are deterministic and independent from visible labels. User content is escaped before it reaches Mermaid.
- Only the diagram kinds above are supported. Raw Mermaid, arbitrary configuration/directives, user-defined CSS, cross-kind composition, and Markdown in labels are not supported.
- The browser extension requires explicit site access for GitHub or Notion. It only augments opted-in blocks and does not write back to the page.
- Adding syntax is a compatibility change: update this specification, compiler tests, Mermaid parser integration tests, extension examples, and release notes together.
