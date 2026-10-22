# diagram-dsl

A small, predictable language for writing diagrams and compiling them to Mermaid.

```text
ArgoCD -> GitHub: deploy
ArgoCD is a yellow box
```

The first version supports flow diagrams and entity relationship diagrams (ERDs). It uses a deliberately small grammar instead of trying to interpret arbitrary natural language. See [SPEC.md](SPEC.md) for the v0.1 syntax and limits.

## TypeScript API

```ts
import { compile } from "diagram-dsl";

const result = compile(`ArgoCD -> GitHub: deploy\nArgoCD is a yellow box`);

if (result.ok) {
  console.log(result.kind);
  console.log(result.mermaid);
} else {
  console.error(result.diagnostics);
}
```

The compiler has no runtime dependencies and is designed to run in a browser extension or Node.js. The repository is at an early design stage; syntax changes may happen before a stable release.
