# Core Libraries

A monorepo containing reusable core libraries for the DCL ecosystem.

## 📦 Project Structure

This repository is organized as a monorepo using pnpm workspaces with the following structure:

```
core-libs/
├── libraries/
│   ├── http-commons/    # Common middlewares and utils for HTTP Servers
```

## 🚀 Libraries

### HTTP Server Commons

- **HTTP Commons** (`@dcl/http-server-commons`) - Middlewares and utilities for HTTP Servers

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install
```

### Available Scripts

```bash
# Build all packages
pnpm build

# Run tests for all packages
pnpm test

# Start development mode (watch mode)
pnpm dev

# Clean build artifacts
pnpm clean

# Lint all packages
pnpm lint
```

### Package Management

This project uses [Changesets](https://github.com/changesets/changesets) for version management:

```bash
# Create a new changeset
pnpm changeset

# Version packages based on changesets
pnpm version-packages

# Build and publish packages
pnpm release
```

## 📚 Testing

Each library includes comprehensive test suites using Jest. Run tests with:

```bash
# Run all tests
pnpm test

# Run tests for a specific library
cd libraries/http-server-commons && pnpm test
```

## 🔧 Configuration

### TypeScript

All packages use TypeScript with strict configuration. TypeScript configuration is inherited from the root `tsconfig.json` and can be extended in individual packages.

### Jest

Testing is configured with Jest and `ts-jest` for TypeScript support. The configuration is centralized in the root `jest.config.js`.

## 📦 Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for automated version management and publishing to npm. All packages are published under the `@dcl` scope:

- `@dcl/http-server-commons`

### Publishing Workflow

Every pull request that introduces changes to any package **must** include a changeset file that describes the changes and their semantic versioning impact.

#### Step 1: Create a Changeset

When making changes to any package, run the changeset command to create a changeset file:

```bash
pnpm changeset
```

This interactive command will:

- Ask you to select which packages have changed
- Prompt you to choose the version bump type (major, minor, or patch)
- Request a summary of the changes for the changelog

The command creates a new file in the `.changeset/` directory with your change description.

#### Step 2: Commit and Submit PR

Include the generated changeset file in your PR:

```bash
git add .changeset/
git commit -m "chore: Add changeset for [your changes]"
```

#### Step 3: Merge PR

After peer review and approval, merge your PR. The changeset CI will automatically:

- Detect the merged changeset
- Create a new "Version Packages" PR with:
  - Updated version numbers in `package.json` files
  - Generated changelogs for each affected package
  - Consumed changeset files (they'll be deleted)

#### Step 4: Release

Merge the "Version Packages" PR to trigger the automated publishing process:

- Packages are built and published to npm
- Git tags are created for the new versions
- GitHub releases are generated

## 🔗 Related

- [Changesets](https://github.com/changesets/changesets) - Version management tool
