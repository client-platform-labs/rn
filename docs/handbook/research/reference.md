# Reference Book — Industry Brief

> Research scope: GitHub issue [#208](https://github.com/client-platform-labs/rn/issues/208), parent #200.
> Domains: (1) industrial CLI subcommand granularity and plugin systems,
> (2) config file format trade-offs (JSONC / TOML / YAML / Starlark),
> (3) backend API protocols for control-plane / OTA / registry services.
> All claims cite a primary source URL with access date 2026-09-07 unless otherwise noted.

## CLI subcommand granularity

### kubectl

- **Core principle**: core `kubectl` is intentionally minimal — only generic
  building blocks (`get`, `create`, `apply`, `delete`, `describe`, `logs`,
  `exec`, `rollout`). Everything domain-specific is a plugin.
  — source: <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/>
  (accessed 2026-09-07)
- **Plugin mechanism = pure path convention**: a binary named `kubectl-foo`
  in `$PATH` is auto-exposed as `kubectl foo`. A `kubectl-foo-bar-baz`
  binary becomes `kubectl foo bar baz`. No SDK, no manifest, no runtime
  registration. — source: <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/>
- **Hard constraint**: plugins **cannot** shadow or extend a built-in
  command. A plugin named `kubectl-version` is silently ignored because
  `kubectl version` exists. This is the central POLA gate.
  — source: <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/>
- **Plugin lifecycle is managed by Krew** (krew.sigs.k8s.io), which plays
  the same role as `apt` or `brew` for kubectl extensions.
  — source: <https://krew.sigs.k8s.io/docs/developer-guide/develop/plugin-development/>
- **Plugin SDK**: `k8s.io/cli-runtime` provides helpers for flag binding,
  kubeconfig parsing, and API access; sample-cli-plugin is the reference
  implementation. — source: <https://pkg.go.dev/k8s.io/cli-runtime>

### gradle

- **No subcommands — only tasks**. Interface is `gradle [taskName...] [--option-name...]`.
  Tasks are namespaced with `:` for multi-project builds (`gradle :app:build`).
  Plugins add tasks and **task-specific CLI options** (e.g. Java test plugin
  exposes `--tests`), not subcommands.
  — source: <https://docs.gradle.org/current/userguide/command_line_interface_basics.html>
  (accessed 2026-09-07)
- **Implication for surface area**: any feature added by a plugin looks like
  `gradle <task> <option>`, not `gradle <plugin-subcommand> <verb>`. This keeps
  the global namespace flat; discovery is via `gradle tasks`.
  — source: <https://docs.gradle.org/current/userguide/command%5Fline%5Finterface.html>

### cargo

- **Architecture**: single binary composed of `clap` subcommands; one file
  per subcommand in `src/bin/cargo/commands/`. Each subcommand parses its
  own flags and delegates to `src/cargo/ops/mod.rs`.
  — source: <https://github.com/rust-lang/cargo/blob/857b2a59fa55c93bc0c917c114db197243a545d4/ARCHITECTURE.md>
  (accessed 2026-09-07)
- **Plugin mechanism = same convention as kubectl**: any binary named
  `cargo-<name>` in `$PATH` is auto-exposed as `cargo <name>`, and is
  listed in `cargo --list`. — source: <https://doc.rust-lang.org/stable/book/ch14-05-extending-cargo.html>
- **Design principle (Cargo contributor guide)**: "Cargo strives to remain
  backwards compatible … each knob that is added has a high cost … layering
  and defaults can help avoid the surface area that the user needs to be
  concerned with. Try to avoid small functionalities that may have complex
  interactions with one another." This is a textbook YAGNI statement applied
  to CLI. — source: <https://doc.crates.io/contrib/design.html>
- **Aliases** are first-class (built-in `b` → `build`, user-defined via
  `[alias]` in `.cargo/config.toml`) and resolved with cycle detection
  before dispatch. — source: <https://deepwiki.com/rust-lang/cargo/6.1-cli-architecture>

### npm

- **Architecture**: commands are loaded **lazily** from `lib/commands/` via
  `Npm.cmd()`; each file subclasses `BaseCommand` and declares `name`,
  `description`, `params`, `workspaces`, and optionally `subcommands` and
  `definitions` (per-command flag schema). This is the **late-binding
  alternative** to kubectl's convention: dispatch is in-process.
  — source: <https://deepwiki.com/npm/cli/6-command-system>
- **Recursive subcommand dispatch**: `npm trust github`, `npm cache clean`
  declare `static subcommands` and `execCommandClass` recurses, building
  a `commandPath` like `['trust', 'github']` for timing labels and help
  rendering. — source: <https://deepwiki.com/npm/cli/2.2-command-processing>
- **Two execution modes per command**: legacy (`exec(args[])`) and
  definitions-based (`exec(args[], flags)`). Definitions-based is the
  modern recommended path; it parses flags into a structured object
  rather than raw argv. — source: <https://deepwiki.com/npm/cli/2.2-command-processing>
- **Workspaces are not a subcommand tree** — they are a cross-cutting
  orthogonal dimension. RFC #0038 categorizes every existing subcommand
  into 3 levels of workspace-awareness and rejects `--workspaces` on
  commands where it would be meaningless. — source: <https://github.com/npm/rfcs/blob/main/implemented/0038-workspaces-run-cmds.md>

### pnpm

- **Plugin-based modular package system**: every command is a
  `CommandDefinition` object registered in `pnpm/src/cmd/index.ts` and
  imported from independently versioned packages (`@pnpm/installing.commands`,
  `@pnpm/releasing.commands`, `@pnpm/store.commands`, etc.). The core CLI
  is a thin dispatcher; the heavy lifting lives in per-domain packages.
  — source: <https://deepwiki.com/pnpm/pnpm/2.6-plugin-architecture>
- **Strict option validation** is a deliberate npm divergence: unknown
  flags fail loudly (`pnpm install --target_arch x64` errors), unlike
  npm which silently ignores them. This is POLA at the parser level.
  — source: <https://pnpm.io/pnpm-cli>
- **Fallback to script runner**: if an unknown command matches a script
  name in `package.json`, pnpm runs it (`pnpm eslint` ≡ `pnpm run eslint`).
  This is the Unix "do what I mean" tail, scoped to the user's own scripts.
  — source: <https://pnpm.io/pnpm-cli>

### supabase CLI

- **Hierarchical command tree** built on Cobra (Go), with three top-level
  groups: `quick-start`, `local-dev`, `management-api`. Each group is a
  namespace; verbs live below. — source: <https://deepwiki.com/supabase/cli/2-core-cli-architecture>
- **Public spec lives in YAML** (`apps/docs/spec/cli_v1_commands.yaml`,
  `clispec: 001`) and is the single source of truth for command
  documentation, groups, and tags. This is the **doc-as-spec** pattern.
  — source: <https://github.com/supabase/supabase/blob/b6c0c606/apps/docs/spec/cli_v1_commands.yaml>
- **Hybrid Go/TypeScript** during the bootstrap-to-native port: complex
  orchestration commands (`bootstrap`) are being moved from Go to TypeScript
  to enable `--output-format json|stream-json` for agents. The migration
  is staged; `db push` still delegates to the Go binary as of 2026.
  — source: <https://github.com/supabase/cli/pull/5470>

### vercel CLI

- **Centralized command registry** in `packages/cli/src/commands/index.ts`
  maps names + aliases to canonical implementations, similar to npm's
  pattern but in TypeScript. — source: <https://deepwiki.com/vercel/vercel/3.1-cli-commands-and-help-system>
- **Agentic mode**: a non-interactive JSON output path is designed for AI
  agents. Mutation gating uses a `--yes` flag to protect production
  resources. — source: <https://deepwiki.com/vercel/vercel/3.1-cli-commands-and-help-system>

### Synthesis: how industrial CLIs bound their surface

| Tool      | Core surface                                   | Extension model                                  | Anti-shadowing rule                  |
| --------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| kubectl   | generic verbs only (get/apply/delete)          | `kubectl-<x>` binary in PATH                     | plugins cannot shadow built-ins      |
| gradle    | flat `task[:subtask]` namespace                | plugins add tasks + task options                 | n/a (no verbs to shadow)             |
| cargo     | subcommand-per-file via clap                   | `cargo-<x>` binary in PATH                       | built-in aliases shadow user aliases |
| npm       | `BaseCommand` subclass, lazy-loaded            | in-process `subcommands` map, recursive dispatch | built-in commands win over plugins   |
| pnpm      | `CommandDefinition` from per-domain packages   | in-package, plus strict flag validation          | unknown flags are errors, not silent |
| supabase  | Cobra tree with tag-grouped YAML spec          | Go↔TS port for orchestrator commands             | n/a (single binary)                  |
| vercel    | TS command map + JSON agentic output           | in-process, with `--yes` mutation gate           | `--yes` for production mutations     |

Two patterns dominate:

1. **PATH-convention plugins** (kubectl, cargo) — zero ceremony, no SDK
   required, but the convention is the contract. Good for *external*
   extensions.
2. **In-process subcommand map** (npm, pnpm, vercel, supabase) — heavier
   machinery, but versioned, type-checked, and easier to evolve.
3. **POLA gates are uniform**: built-ins always win over user extensions,
   unknown flags fail loudly (pnpm), mutations need explicit opt-in
   (vercel `--yes`).

## Config file format

### JSONC (JSON with Comments)

- **Origin**: introduced informally by Microsoft for VS Code's own
  configuration files (`settings.json`, `tasks.json`, `launch.json`),
  then formalized as `jsonc-parser` and the `jsonc.org` spec.
  — source: <https://jsonc.org/> (accessed 2026-09-07)
- **What it adds over JSON**: `//` and `/* */` comments; trailing commas
  (with a warning). It is **not** an official IETF format; it is
  "VSCode-specific … without any aspirations to define a new common
  file format". — source: <https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/server/README.md>
- **Ecosystem reach**: `tsconfig.json` is treated as jsonc by VS Code
  by default; `tsconfig.*.json` and other variants require manual
  `files.associations` registration. Deno explicitly supports both
  `deno.json` and `deno.jsonc` and considers them content-equivalent.
  — sources: <https://github.com/Microsoft/vscode/issues/50974>, <https://docs.deno.com/runtime/fundamentals/configuration/>
- **Tooling**: VS Code ships a json-language-features server that supports
  both `json` and `jsonc`; schema validation via `json.schemas` (draft-04
  through draft-07 well-supported, 2019-09 / 2020-12 limited).
  — source: <https://code.visualstudio.com/docs/languages/json>
- **Limitation**: the format is a de-facto standard — npm/Yarn do not
  parse `package.json` as jsonc, and JSON.parse() in V8 rejects comments.
  Any consumer that did not adopt `jsonc-parser` will fail on jsonc.

### TOML

- **Cargo's choice rationale (Tom Preston-Werner / community)**: "We don't
  need a hierarchical format like JSON or XML, and the INI format is not
  well specified, so mojombo made TOML. … TOML aims for simplicity, a
  goal which is not apparent in the YAML specification."
  — source: <https://users.rust-lang.org/t/why-does-cargo-use-toml/3577>
  (accessed 2026-09-07)
- **Deno deliberately rejected adding TOML support** (issue #14376):
  the maintainer's stated reason — "if we add support for TOML, then
  soon we'll have to add support for YAML as well. That would mean
  probing file system 4 times in each location to find a configuration
  file" — is a **single-format discipline** argument. Every tool that
  reads or programmatically manipulates a config file is doubled, and
  every consumer needs to search 4 file names per directory.
  — source: <https://github.com/denoland/deno/issues/14376>
- **Deno's escape hatch**: `deno.json` can have an `update_config` task
  that reads any source format and writes JSON. The system of record
  stays JSON; non-JSON is a build-time step.
  — source: <https://github.com/denoland/deno/issues/14376>
- **Cargo manifest evolution**: `package.authors` is now deprecated and
  ignored by both Cargo and crates.io — the deprecation RFC was driven
  by privacy and admin concerns, not by the format. Lesson: config
  formats have long-term schema-migration costs that go beyond
  the format choice itself. — sources: <https://rust-lang.github.io/rfcs/3052-optional-authors-field.html>, <https://doc.rust-lang.org/stable/cargo/reference/manifest.html>
- **Ecosystem**: Cargo, Deno's *internal* `@std/toml` parser, taplo
  (LSP), biome (linter/formatter), pyproject.toml (PEP 621).
  — source: <https://docs.deno.com/runtime/reference/std/toml/>

### YAML

- **Dominant in CI/CD and infrastructure**: GitHub Actions workflows,
  Kubernetes manifests, Helm values, Docker Compose, Ansible playbooks,
  GitHub Actions workflow schema is community-maintained at SchemaStore
  because **GitHub does not publish an official JSON/YAML schema** for
  workflows. — sources: <https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions>, <https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/github-workflow.json>
- **Known production hazards**:
  - The **Norway problem** — country code `NO`, plus `OFF`, `ON`, `YES`,
    `FALSE` are parsed as booleans in YAML 1.1. YAML 1.2 fixed this
    by restricting booleans to `true`/`false` only, but most parsers
    still default to 1.1. — source: <https://openformatter.com/blog/yaml-vs-json-2024>
  - **Indentation errors are silent** — a misaligned key changes the
    shape of the parsed document without raising a parse error.
    — source: <https://openformatter.com/blog/yaml-vs-json-2024>
  - **Implicit type coercion** — `0755` becomes octal `493`, `1e2`
    becomes float, `2024-01-01` becomes a date. Defensive mitigation:
    quote ambiguous scalars + validate the parsed value with Pydantic
    or JSON Schema. — sources: <https://oortcraft.dev/blog/yaml-validation-best-practices/>, <https://python-config-secrets-hub.com/core-configuration-patterns-file-formats/yaml-json-parsing-strategies/handling-nested-configuration-in-yaml-safely/>
  - **RCE risk** with `yaml.load()` (Python) — must use `yaml.safe_load()`.
    — source: <https://usetoolsuite.com/blog/yaml-vs-json/>
- **No built-in schema validation** in the format itself. YAML is a
  superset of JSON, so JSON-Schema can be used as a validation layer
  (this is what Kubernetes CRDs do via `kubeconform`/`yamale`).
  — source: <https://oortcraft.dev/blog/yaml-validation-best-practices/>
- **Parsing cost**: ~1 MB YAML takes "tens to hundreds of milliseconds"
  in Python/Node — non-trivial at API scale, irrelevant for human-edited
  config files. — source: <https://usetoolsuite.com/blog/yaml-vs-json/>

### Other formats (Starlark, Nix-style)

- **Starlark (Bazel BUILD files)**: deliberately restricted Python subset.
  `BUILD` files cannot define functions, cannot use `*args`/`**kwargs`,
  and **cannot perform arbitrary I/O**. This last constraint is what
  makes evaluation **hermetic** — "dependent only on a known set of
  inputs, which is essential for ensuring that builds are reproducible."
  — source: <https://bazel.build/concepts/build-files> (accessed 2026-09-07)
- **Starlark's tradeoff**: it pays the cost of a real language because
  the build graph is **code that runs at config time**. A pure data
  format cannot express `glob`, `select`, or rule composition. The
  constraint set is calibrated for hermeticity, not minimalism.
  — source: <https://bazel.build/concepts/build-files>
- **Nix language** is the same family — Turing-complete by design, but
  with restricted side effects. Neither is appropriate for a config
  file that humans hand-edit a few times a year; both earn their
  complexity only when the config is also a *program*.

### Synthesis: when each format wins

| Format     | Hand-edited by humans? | Strict schema? | Expressive power | Cost                                |
| ---------- | ---------------------- | -------------- | ---------------- | ----------------------------------- |
| JSONC      | yes                    | excellent (JSON Schema) | flat-ish     | not standardized, tooling fragmented |
| TOML       | yes                    | good (taplo, biome)      | moderate  | spec churn (1.0 still had 1.0.0-rc) |
| YAML       | yes                    | medium (CRD-ish)         | high     | Norway problem, silent indentation, RCE in unsafe loaders |
| JSON       | no                     | excellent                | flat     | no comments, no trailing commas     |
| Starlark   | yes, but as code       | N/A — type-checked code  | full     | hermeticity constraints are steep   |

Two clear lessons for a platform:

1. **Pick one canonical format for system config; do not probe the
   filesystem for four extensions** (Deno's reasoning, with which we
   agree).
2. **If humans edit it, support comments and trailing commas.** JSONC
   and TOML both deliver this; raw JSON does not.

## Backend API for CP / OTA / registry

### REST: the default

#### Kubernetes API server

- **RESTful resource-based interface** with standard HTTP verbs
  (POST, PUT, PATCH, DELETE, GET) over JSON. Every object has `kind`
  and `apiVersion`; collection types are `Kind` + `List`.
  — source: <https://kubernetes.io/docs/reference/using-api/api-concepts/>
  (accessed 2026-09-07)
- **Declarative, not imperative** — the spec defines *desired state*;
  `.status` is observed state, served as a separate subresource so user
  and controller writes cannot race. The api-server is the only writer
  to etcd. — sources: <https://github.com/kubernetes/community/blob/61f3d0/contributors/devel/sig-architecture/api-conventions.md>, <https://www.golinuxcloud.com/desired-state-vs-actual-state-kubernetes/>
- **Watch + list-and-watch with `resourceVersion`** instead of polling.
  Clients receive a stream of deltas; etcd compaction bounds the
  watchable history. — source: <https://kubernetes.io/docs/reference/using-api/api-concepts/>
- **Field names are declarative, not imperative** — `Replicas`, not
  `ScaleUp`. This is codified in the API conventions doc and is the
  reason GitOps (ArgoCD, Flux) works as a thin reconciliation layer.
  — source: <https://github.com/kubernetes/community/blob/61f3d0/contributors/devel/sig-architecture/api-conventions.md>

#### OCI Distribution Spec (Docker Registry v2)

- **HTTP API is the de-facto standard for any container-or-artifact
  registry**: `GET /v2/<name>/manifests/<reference>`, `PUT /v2/<name>/manifests/<reference>`,
  `GET /v2/<name>/blobs/<digest>`, plus the upload state machine
  (POST → PATCH → PUT for chunked uploads, or POST `?digest=` for
  monolithic). — source: <https://github.com/opencontainers/distribution-spec/blob/main/spec.md>
  (accessed 2026-09-07)
- **Reference granularity = digest OR tag**. Both are valid in the
  manifest URL; a tag is mutable, a digest is content-addressable.
  The response carries `Docker-Content-Digest` (now optional/legacy
  per the OCI spec, but still widely emitted).
  — source: <https://github.com/opencontainers/distribution-spec/blob/main/spec.md>
- **Why digest matters**: digest references are immutable and
  content-verified. Helm explicitly recommends `helm install
  oci://…/mychart@sha256:…` in production for reproducibility.
  — source: <https://github.com/helm/helm-www/blob/main/docs/topics/registries.mdx>
- **Helm charts are OCI artifacts**: a chart is a `schemaVersion: 2`
  manifest with a config blob (`application/vnd.cncf.helm.config.v1+json`)
  and a content layer (`application/vnd.cncf.helm.chart.content.v1.tar+gzip`).
  This is the **artifact-extensibility** pattern — same wire protocol,
  new media types registered with IANA.
  — source: <https://github.com/helm/helm-www/blob/main/blog/2023-05-15-helm-oci-mediatypes.md>

#### Maven Central

- **Two distinct REST surfaces**: search (Solr-backed, JSON or XML at
  `https://search.maven.org/solrsearch/select`) and publishing (Central
  Portal API at `https://central.sonatype.com/api/v1/publisher/…`).
  Publishing is a multi-step state machine: `POST /upload` (bundle) →
  `POST /status?id=…` (poll) → `POST /deployment/{id}` (publish).
  — sources: <https://central.sonatype.org/search/rest-api-guide/>, <https://central.sonatype.org/publish/publish-portal-api/>
- **Legacy alternative**: "Maven-API-like" PUTs against
  `https://ossrh-staging-api.central.sonatype.com/service/local/staging/deploy/maven2/com/example/example/0.1.0/example-0.1.0.pom`
  — the URL is the GAV coordinate. This is the **URL-as-path**
  pattern: the path *is* the identity.
  — source: <https://central.sonatype.org/publish/publish-portal-ossrh-staging-api/>
- **Search granularity**: by `g:` (groupId), `a:` (artifactId), `v:` (version),
  `p:` (packaging), `l:` (classifier). Identifiers are versioned strings,
  not digests — coordinates are human-meaningful, not content-addressable.

#### npm registry

- **Publish = `PUT /{escapedPackageName}`** with a JSON body containing
  `versions`, `dist-tags`, and `_attachments` (the tarball, base64).
  Same wire format for npm, pnpm, yarn Berry, and bun. This is
  *deliberate convergence* via the `libnpmpublish` shared library.
  — sources: <https://gitlab.com/gitlab-org/ops/registry-conformance/-/blob/main/docs/specs/S06-npm-contracts.md>, <https://github.com/git-agentic/pkg-registry/blob/main/docs/research/npm-registry-api-surface.md>
- **Read = `GET /{package}` + `GET /{package}/{version}` + `GET /-/{tarball-name}`**.
  npm 11.0 (2026) introduced a batched `POST /registry/v2/manifests`
  to cut round-trips on 100+ dep trees; the three considered
  alternatives were HTTP/2 multiplexing, GraphQL, and batched POST.
  The chosen answer is **batched REST over plain HTTP/1.1** because
  it is registry-agnostic and "many private registries don't support
  GraphQL". — source: <https://johal.in/deep-dive-npm-110s-new-registry-protocol-improves-deep>
- **Granularity is by version string, not digest** — npm pins to
  semver ranges at install time, and the registry returns integrity
  hashes alongside the tarball URL for client-side verification. There
  is no `GET /{pkg}@sha512:…` URL pattern in core npm (matters only
  for the integrity field, not the URL).

#### CocoaPods Trunk

- **Single endpoint, JSON body**: `POST https://trunk.cocoapods.org/api/v1/pods`
  with `Authorization: Token …`, `Content-Type: application/json`, body
  = JSON-serialized podspec. — source: <https://github.com/CocoaPods/trunk.cocoapods.org-api-doc>
- **Surprising operational truth**: the API regularly returns 5xx
  errors *after* the publish has already succeeded (issues #4922,
  #8889, #8925, #11621). The client workaround is to verify by
  checking the CocoaPods/Specs GitHub repo for the commit. This is
  the canonical case for **idempotent publish + client-side
  reconciliation against a separate source of truth**.
  — sources: <https://github.com/CocoaPods/CocoaPods/issues/4922>, <https://github.com/CocoaPods/CocoaPods/issues/11621>

### gRPC: streaming + bi-directional

- **Envoy xDS / ADS** is the canonical case for "control plane needs
  gRPC". The Aggregated Discovery Service multiplexes Listener, Cluster,
  Route, Endpoint, Secret deltas over a single bidirectional stream,
  giving the management server the ability to **carefully sequence
  updates across resource types to avoid traffic drop**.
  — source: <https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol>
  (accessed 2026-09-07)
- **Two variants**:
  - **State-of-the-World (SotW)**: every DiscoveryResponse contains
    every resource the client should have. Absence of a resource means
    deletion. — source: <https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/operations/dynamic_configuration>
  - **Delta xDS**: only added/changed/removed resources. Client uses
    `resource_names_subscribe` / `resource_names_unsubscribe` and ACKs
    with `response_nonce` (nonce is required in delta, optional in
    SotW). — source: <https://pkg.go.dev/github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3>
- **Why gRPC won this slot**: bidirectional streaming, schema evolution
  via `type.googleapis.com/...`, and HTTP/2 multiplexing remove the
  need for the client to poll. REST was tried (xDS also supports
  REST-JSON) but ADS is gRPC-only because the sequencing guarantee
  comes from a single shared stream.
  — source: <https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol>

### Bespoke HTTP+JSON

- **Cloudflare / fly-style custom control planes** (no formal cite
  available for an exact public spec; the design pattern is well-known
  in the community) tend to use POST-based RPC over HTTPS with a
  single JSON envelope, no streaming, and aggressive caching via
  ETag/`If-None-Match`. These work because the surface is small and
  churn is infrequent.
- **GitHub GraphQL v4** is the rare case where GraphQL is used for
  a public registry-class API — chosen because the consumer problem
  is "fetch a project with N pull requests, M issues, and K labels in
  one round-trip". GraphQL pays for itself only when client shape
  varies a lot; npm's RFC explicitly rejected it because most
  consumers wanted the same three fields. — source: <https://johal.in/deep-dive-npm-110s-new-registry-protocol-improves-deep>

### Synthesis: protocol choice by requirement

| Requirement                               | Industry default                                       |
| ----------------------------------------- | ------------------------------------------------------ |
| Pull by content hash (image, blob)        | OCI Distribution Spec (REST + digest)                  |
| Pull by version / coordinate              | Maven (PUT to coordinate path), npm (PUT to /name)     |
| Streamed config updates to many clients   | gRPC streaming (xDS/ADS)                               |
| Declarative desired-state reconciliation | REST + watch (Kubernetes API server)                   |
| One-shot publish from CLI                 | REST PUT, JSON body (npm, CocoaPods, Helm via OCI)     |
| Heterogeneous client queries              | GraphQL (GitHub) — only when consumer shape varies a lot |

## Concrete recommendations for rn platform

- **CLI subcommand granularity**: follow the **cargo + kubectl** pattern.
  Keep the core binary small (`rn`, `rn-delivery`) — a handful of verbs
  each — and let domain extensions live as `rn-<x>` binaries in `$PATH`
  (PATH-convention plugin, no SDK required for first-party extensions).
  Add an in-process subcommand map only for tightly-coupled sub-features
  (npm/pnpm style) where you want shared config validation. Built-ins
  always shadow user extensions. — sources: <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/>, <https://github.com/rust-lang/cargo/blob/857b2a59fa55c93bc0c917c114db197243a545d4/ARCHITECTURE.md>
- **Strict option validation**: pnpm-style — unknown flags are errors,
  not silent. This is cheap to implement with `clap` / `cac` and
  prevents a class of CI bugs. — source: <https://pnpm.io/pnpm-cli>
- **Configuration format**: choose **one** of TOML or JSONC for the
  primary user-edited config, and **probe only that one extension**.
  TOML has stronger ecosystem (Cargo, pyproject, taplo, biome); JSONC
  has stronger schema tooling (JSON Schema) and reuses the same parser
  in your TypeScript toolchain. Avoid YAML in user-edited config — the
  Norway problem and silent indentation errors are operational hazards
  with no upside for our shape. — sources: <https://github.com/denoland/deno/issues/14376>, <https://openformatter.com/blog/yaml-vs-json-2024>
- **CP / OTA API**: **REST + JSON, content-addressable**. Use the OCI
  Distribution Spec shape (`PUT /v2/<name>/manifests/<digest|tag>`,
  `GET /v2/<name>/blobs/<digest>`) — every major registry implementation
  (Docker Hub, GHCR, ECR, Harbor, GitHub Packages, GitLab Registry,
  Harbor) already speaks it, so reuse is free. Require the client to
  pass a **digest**, not a tag, for production pulls. Adopt
  `Docker-Content-Digest` for round-trip verification, and register
  IANA media types if you ship a new artifact kind.
  — sources: <https://github.com/opencontainers/distribution-spec/blob/main/spec.md>, <https://github.com/helm/helm-www/blob/main/docs/topics/registries.mdx>
- **Resilience to partial-failure publishes**: design the publish flow
  so the *registry* is the source of truth and the *API* is idempotent.
  npm's `PUT /{name}` is a single atomic write; Maven Central's portal
  is a state machine (`upload → validated → publish`). For OTA, prefer
  the npm model (idempotent PUT) and learn from CocoaPods (issues
  #4922, #11621) which shows that ack-after-side-effect is a recipe
  for CI pipelines that get stuck on phantom failures.
  — sources: <https://github.com/CocoaPods/CocoaPods/issues/11621>, <https://central.sonatype.org/publish/publish-portal-api/>
- **Adopt watch + `resourceVersion` for control-plane state** if you
  ever need streamed reconciliation. JSON-over-HTTP is fine for
  request/response; **gRPC bidirectional streaming** is the right
  primitive when many clients must receive carefully ordered state
  deltas (cf. Envoy ADS). For our scale, plain HTTP + polling is
  almost certainly enough; do not introduce gRPC until profiling
  forces it. — source: <https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol>

## References

- <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/> — accessed 2026-09-07 — kubectl plugin mechanism and shadowing rule
- <https://krew.sigs.k8s.io/docs/developer-guide/develop/plugin-development/> — accessed 2026-09-07 — Krew as plugin lifecycle manager
- <https://pkg.go.dev/k8s.io/cli-runtime> — accessed 2026-09-07 — kubectl plugin SDK
- <https://docs.gradle.org/current/userguide/command_line_interface_basics.html> — accessed 2026-09-07 — gradle task/option CLI shape
- <https://docs.gradle.org/current/userguide/command%5Fline%5Finterface.html> — accessed 2026-09-07 — gradle CLI reference
- <https://github.com/rust-lang/cargo/blob/857b2a59fa55c93bc0c917c114db197243a545d4/ARCHITECTURE.md> — accessed 2026-09-07 — cargo subcommand-per-file architecture
- <https://doc.crates.io/contrib/design.html> — accessed 2026-09-07 — cargo design principles (YAGNI applied to CLI)
- <https://doc.rust-lang.org/stable/book/ch14-05-extending-cargo.html> — accessed 2026-09-07 — cargo PATH-convention extension
- <https://deepwiki.com/rust-lang/cargo/6.1-cli-architecture> — accessed 2026-09-07 — cargo clap + alias + dispatch internals
- <https://deepwiki.com/npm/cli/6-command-system> — accessed 2026-09-07 — npm lazy-loaded BaseCommand architecture
- <https://deepwiki.com/npm/cli/2-core-architecture> — accessed 2026-09-07 — npm four-layer architecture
- <https://deepwiki.com/npm/cli/2.2-command-processing> — accessed 2026-09-07 — npm subcommand recursion + definitions-based parsing
- <https://github.com/npm/rfcs/blob/main/implemented/0038-workspaces-run-cmds.md> — accessed 2026-09-07 — npm workspaces as cross-cutting dimension, not subcommand
- <https://deepwiki.com/pnpm/pnpm/2.6-plugin-architecture> — accessed 2026-09-07 — pnpm per-domain package architecture
- <https://pnpm.io/pnpm-cli> — accessed 2026-09-07 — pnpm strict flag validation, script fallback
- <https://deepwiki.com/supabase/cli/2-core-cli-architecture> — accessed 2026-09-07 — supabase Cobra + tag-grouped architecture
- <https://github.com/supabase/supabase/blob/b6c0c606/apps/docs/spec/cli_v1_commands.yaml> — accessed 2026-09-07 — supabase doc-as-spec YAML
- <https://github.com/supabase/cli/pull/5470> — accessed 2026-09-07 — supabase Go→TS port rationale
- <https://deepwiki.com/vercel/vercel/3.1-cli-commands-and-help-system> — accessed 2026-09-07 — vercel centralized command registry + agentic JSON mode
- <https://jsonc.org/> — accessed 2026-09-07 — JSONC specification and history
- <https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/server/README.md> — accessed 2026-09-07 — JSONC as "VSCode-specific, no aspirations to define a common format"
- <https://code.visualstudio.com/docs/languages/json> — accessed 2026-09-07 — VS Code JSON / JSONC language support and schema
- <https://github.com/Microsoft/vscode/issues/50974> — accessed 2026-09-07 — tsconfig.*.json as jsonc association
- <https://docs.deno.com/runtime/fundamentals/configuration/> — accessed 2026-09-07 — deno.json vs deno.jsonc
- <https://docs.deno.com/examples/parsing_jsonc/> — accessed 2026-09-07 — Deno @std/jsonc parser
- <https://docs.deno.com/runtime/reference/std/toml/> — accessed 2026-09-07 — Deno @std/toml library
- <https://github.com/denoland/deno/issues/14376> — accessed 2026-09-07 — Deno's reasoning for NOT supporting TOML config
- <https://users.rust-lang.org/t/why-does-cargo-use-toml/3577> — accessed 2026-09-07 — Cargo's TOML choice rationale
- <https://doc.rust-lang.org/stable/cargo/reference/manifest.html> — accessed 2026-09-07 — Cargo manifest spec, authors deprecation
- <https://github.com/rust-lang/cargo/blob/master/src/doc/src/reference/manifest.md> — accessed 2026-09-07 — Cargo manifest reference source
- <https://rust-lang.github.io/rfcs/3052-optional-authors-field.html> — accessed 2026-09-07 — Cargo authors deprecation RFC
- <https://github.com/rust-lang/cargo/issues/16458> — accessed 2026-09-07 — discussion of authors deprecation
- <https://bazel.build/concepts/build-files> — accessed 2026-09-07 — Bazel BUILD files, Starlark hermeticity
- <https://bazel.build/rules/language?hl=en> — accessed 2026-09-07 — Bazel Starlark language overview
- <https://bazel.build/reference/be/overview> — accessed 2026-09-07 — Bazel BUILD Encyclopedia of Functions
- <https://openformatter.com/blog/yaml-vs-json-2024> — accessed 2026-09-07 — YAML pitfalls: Norway, indentation, coercion
- <https://usetoolsuite.com/blog/yaml-vs-json/> — accessed 2026-09-07 — YAML Norway problem, RCE risk, parsing cost
- <https://oortcraft.dev/blog/yaml-validation-best-practices/> — accessed 2026-09-07 — YAML validation best practices
- <https://python-config-secrets-hub.com/core-configuration-patterns-file-formats/yaml-json-parsing-strategies/handling-nested-configuration-in-yaml-safely/> — accessed 2026-09-07 — nested YAML + pydantic strategy
- <https://python-config-secrets-hub.com/core-configuration-patterns-file-formats/yaml-json-parsing-strategies/> — accessed 2026-09-07 — JSON/TOML/YAML loader-decoupled validation
- <https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions> — accessed 2026-09-07 — GitHub Actions workflow YAML syntax
- <https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/github-workflow.json> — accessed 2026-09-07 — community JSON schema for GitHub Actions workflows
- <https://github.com/nektos/act/issues/6095> — accessed 2026-09-07 — community schema lag vs GitHub prose docs
- <https://kubernetes.io/docs/reference/using-api/api-concepts/> — accessed 2026-09-07 — Kubernetes API resource + watch semantics
- <https://github.com/kubernetes/community/blob/61f3d0/contributors/devel/sig-architecture/api-conventions.md> — accessed 2026-09-07 — Kubernetes API conventions (declarative, spec/status split)
- <https://github.com/kubernetes/design-proposals-archive/blob/main/architecture/resource-management.md> — accessed 2026-09-07 — Kubernetes declarative resource model
- <https://www.golinuxcloud.com/desired-state-vs-actual-state-kubernetes/> — accessed 2026-09-07 — declarative vs imperative, level-triggered reconciliation
- <https://kkloudtarus.net/en/blog/kubernetes-architecture-up-close-loops-watches-and-the-api-server> — accessed 2026-09-07 — Kubernetes api-server pipeline, level-triggered reconcile
- <https://github.com/opencontainers/distribution-spec/blob/main/spec.md> — accessed 2026-09-07 — OCI Distribution Spec v1.1
- <https://github.com/opencontainers/distribution-spec/blob/v1.1.0-rc3/spec.md> — accessed 2026-09-07 — OCI Distribution Spec 1.1.0-rc3
- <https://github.com/helm/helm-www/blob/main/blog/2023-05-15-helm-oci-mediatypes.md> — accessed 2026-09-07 — Helm chart as OCI artifact, IANA media types
- <https://github.com/helm/helm-www/blob/main/docs/topics/registries.mdx> — accessed 2026-09-07 — Helm OCI push/pull + digest install
- <https://research.versioneer.at/oras-101> — accessed 2026-09-07 — OCI Distribution API overview + ORAS reuse
- <https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol> — accessed 2026-09-07 — Envoy xDS gRPC protocol, ADS
- <https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/operations/dynamic_configuration> — accessed 2026-09-07 — Envoy xDS configuration overview
- <https://www.envoyproxy.io/docs/envoy/latest/configuration/overview/xds_api.html> — accessed 2026-09-07 — Envoy xDS API endpoints (gRPC + REST)
- <https://pkg.go.dev/github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3> — accessed 2026-09-07 — Delta xDS gRPC API
- <https://central.sonatype.org/search/rest-api-guide/> — accessed 2026-09-07 — Maven Central Solr search API
- <https://central.sonatype.org/publish/publish-portal-api/> — accessed 2026-09-07 — Maven Central Portal publisher API
- <https://central.sonatype.org/publish/publish-portal-ossrh-staging-api/> — accessed 2026-09-07 — Maven legacy staging PUT API
- <https://gitlab.com/gitlab-org/ops/registry-conformance/-/blob/main/docs/specs/S06-npm-contracts.md> — accessed 2026-09-07 — npm publish wire-format conformance spec
- <https://github.com/git-agentic/pkg-registry/blob/main/docs/research/npm-registry-api-surface.md> — accessed 2026-09-07 — npm/pnpm/yarn/bun publish wire-format survey
- <https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md> — accessed 2026-09-07 — npm public registry API endpoints
- <https://api-docs.npmjs.com/> — accessed 2026-09-07 — npm registry API reference
- <https://johal.in/deep-dive-npm-110s-new-registry-protocol-improves-deep> — accessed 2026-09-07 — npm 11 v2 manifest protocol design rationale
- <https://github.com/CocoaPods/CocoaPods/issues/4922> — accessed 2026-09-07 — CocoaPods trunk push 500 after success
- <https://github.com/CocoaPods/CocoaPods/issues/11621> — accessed 2026-09-07 — CocoaPods publish success masked as error
- <https://github.com/CocoaPods/trunk.cocoapods.org-api-doc> — accessed 2026-09-07 — CocoaPods Trunk API Blueprint
