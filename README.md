# TODO Creeper

A GitHub Action that helps you identify and track TODO comments as they creep into your codebase. This action scans your repository for TODO, FIXME, and HACK comments and can fail your workflow if the count exceeds a specified threshold.

## Features

- 🔍 **Comprehensive Scanning**: Detects TODO, FIXME, and HACK comments across multiple programming languages
- 📊 **Detailed Reporting**: Provides count, file distribution, and detailed location information
- ⚙️ **Configurable Thresholds**: Set maximum allowed TODO count before action fails
- 🚫 **Exclusion Patterns**: Skip specific directories and files (e.g., node_modules, build artifacts)
- 📈 **Action Outputs**: Expose TODO statistics for use in other workflow steps

## Supported Comment Patterns

The action detects the following comment patterns:

- `// TODO` - JavaScript, TypeScript, Java, C#, etc.
- `/* TODO */` - Multi-line comments
- `# TODO` - Python, Shell scripts, YAML, etc.
- `<!-- TODO -->` - HTML, XML, Markdown
- `// FIXME` - Similar patterns for FIXME comments
- `// HACK` - Similar patterns for HACK comments

## Usage

### Basic Usage

```yaml
name: Check TODOs
on: [push, pull_request]

jobs:
  todo-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Scan for TODOs
        uses: Gustrb/todo-creeper@v1.1.0
        with:
          threshold: 10
```

### Advanced Usage

```yaml
name: Comprehensive TODO Check
on: [push, pull_request]

jobs:
  todo-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Scan for TODOs
        id: todo-scan
        uses: Gustrb/todo-creeper@v1.1.0
        with:
          threshold: 5
          exclude-patterns: 'node_modules,dist,build,.git,tests/mocks'
      
      - name: Report TODO Count
        run: |
          echo "Found ${{ steps.todo-scan.outputs.todo-count }} TODOs"
          echo "Across ${{ steps.todo-scan.outputs.todo-files }} files"
      
      - name: Create TODO Report
        if: steps.todo-scan.outputs.todo-count != '0'
        run: |
          echo "## TODO Report" >> $GITHUB_STEP_SUMMARY
          echo "Found ${{ steps.todo-scan.outputs.todo-count }} TODOs" >> $GITHUB_STEP_SUMMARY
          echo "Files affected: ${{ steps.todo-scan.outputs.todo-files }}" >> $GITHUB_STEP_SUMMARY
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | GitHub token for API access | Yes | `${{ github.token }}` |
| `threshold` | Maximum number of TODOs allowed before action fails | No | `10` |
| `exclude-patterns` | Comma-separated patterns to exclude from TODO search | No | `node_modules,dist,build,.git` |

## Outputs

| Output | Description |
|--------|-------------|
| `todo-count` | Total number of TODOs found |
| `todo-files` | Number of files containing TODOs |
| `todo-details` | JSON string with detailed TODO information |

## Example Output

```
🔍 Starting TODO scan...
📊 Found 3 TODOs across 2 files

📝 TODO Details:
1. src/utils.js:15 - // TODO: Implement error handling
2. src/components/Button.jsx:42 - // TODO: Add loading state
3. docs/README.md:8 - <!-- TODO: Add API documentation -->

✅ TODO count (3) is within threshold (10)
```

## Supported File Types

The action scans files with the following extensions:
- JavaScript/TypeScript: `.js`, `.jsx`, `.ts`, `.tsx`
- Python: `.py`
- Java: `.java`
- C/C++: `.cpp`, `.c`
- C#: `.cs`
- PHP: `.php`
- Ruby: `.rb`
- Go: `.go`
- Rust: `.rs`
- Swift: `.swift`
- Kotlin: `.kt`
- Scala: `.scala`
- Clojure: `.clj`
- Haskell: `.hs`
- OCaml: `.ml`
- F#: `.fs`
- Visual Basic: `.vb`
- SQL: `.sql`
- Shell scripts: `.sh`, `.bash`, `.zsh`, `.fish`
- PowerShell: `.ps1`
- Batch files: `.bat`, `.cmd`
- Configuration: `.yml`, `.yaml`, `.json`, `.xml`
- Web: `.html`, `.css`, `.scss`, `.sass`, `.less`
- Frameworks: `.vue`, `.svelte`
- Documentation: `.md`, `.txt`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
