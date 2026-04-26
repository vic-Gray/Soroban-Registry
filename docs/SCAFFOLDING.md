# Contract Scaffolding Framework

## Overview

The Soroban Registry CLI includes a powerful scaffolding framework designed to accelerate contract development. By using the `scaffold` (or `template`) command, developers can generate pre-configured, production-ready contract structures.

## Features

- **Ready-to-build Templates:** `default`, `token`, `dex`, etc.
- **Built-in Tests:** Scaffolded projects include functioning test setups out of the box.
- **Security Configurations:** Pre-configured `.soroban-lint.toml` files mapping to repository rules.
- **Optimized Builds:** Pre-configured `Cargo.toml` tailored for Soroban WASM outputs.

## Usage

### List Available Templates

```bash
soroban-registry scaffold list
```

### Initialize Default Template

```bash
soroban-registry scaffold init my-awesome-contract
```

### Clone with Parameters

Templates can accept arguments to automatically substitute values inside the generated codebase. 
For example, generating a token contract:

```bash
soroban-registry scaffold clone token my-token --symbol TKN --initial-supply 1000000
```

## Scaffolded Project Structure

A standard scaffolded project will look like this:

```text
my-awesome-contract/
├── Cargo.toml               # Configured with required soroban-sdk dependencies
├── README.md                # Example documentation and deployment steps
├── .soroban-lint.toml       # Linter configuration for automated quality checks
└── src/
    ├── lib.rs               # Contract entrypoint
    └── test.rs              # Contract tests
```

## Acceptance Criteria

The scaffolding framework guarantees that:
1. ✅ **Structure:** A proper standard Rust/Soroban layout is generated.
2. ✅ **Builds:** `cargo build --target wasm32-unknown-unknown --release` succeeds without warnings.
3. ✅ **Tests:** `cargo test` executes the scaffolded tests and passes.

## Extending Templates

To add a new template to the registry:
1. Create a new directory under `templates/<template-name>/`
2. Provide `Cargo.toml`, `src/lib.rs`, and `src/test.rs`.
3. Ensure that placeholders use the `{{ placeholder_name }}` syntax for variables (e.g., `{{ symbol }}`).
4. Submit a Pull Request.