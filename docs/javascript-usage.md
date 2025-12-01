# PR Analysis Tool

A JavaScript/Node.js tool for analyzing GitHub pull requests to track GitHub Copilot usage and collaboration patterns.

## Features

- **Copilot Detection**: Automatically detects GitHub Copilot collaboration in PRs with categorization:
  - `agent`: Code generation/development assistance
  - `review`: Code review assistance  
  - `none`: No Copilot collaboration detected

- **Multiple Output Formats**: Supports both JSON and CSV output
- **Flexible Analysis**: Analyze single repositories or all user repositories
- **Visualization**: Generate Mermaid charts for GitHub Actions step summaries
- **Privacy-Aware**: Masks private repository information in CI environments
- **Caching**: HTTP request caching to reduce API calls and improve performance

## Installation

```bash
npm install
```

## Usage

### Environment Variables

Set these environment variables before running:

```bash
export GITHUB_TOKEN="your_github_personal_access_token"
export GITHUB_REPOSITORY_OWNER="username" 
export OUTPUT_FORMAT="json"  # or "csv"
export ANALYZE_ALL_REPOS="true"  # or "false" for single repo
export GITHUB_REPOSITORY_NAME="repo_name"  # if analyzing single repo
```

### Command Line Interface

The tool supports two main modes of operation:

#### Analyze Pull Requests

```bash
# Analyze all repositories for a user
npm run analyze

# Or use the direct command
node src/index.js analyze --all-repos

# Analyze a specific repository
node src/index.js analyze --repo my-repo

# Use CSV output format
node src/index.js analyze --format csv --all-repos
```

#### Generate Charts

```bash
# Generate Mermaid charts from analysis results
npm run charts

# Or use the direct command  
node src/index.js charts
```

#### Mode Parameter

You can also use the `--mode` parameter for backward compatibility:

```bash
node src/index.js --mode=analyze
node src/index.js --mode=charts
```

### Available Commands

- `npm run start` - Interactive mode (prompts for mode selection)
- `npm run analyze` - Run PR analysis
- `npm run charts` - Generate Mermaid charts
- `npm test` - Run unit tests
- `npm run lint` - Run ESLint (when configured)

## Output

### JSON Format
The tool generates comprehensive JSON files with weekly breakdowns including:
- Total PRs per week
- Copilot-assisted PRs (by type)
- Collaborator statistics
- Repository information
- Individual PR details

### CSV Format
Simplified CSV output with weekly summary data suitable for spreadsheet analysis.

### Mermaid Charts
When run in GitHub Actions, generates visual charts showing:
- PR trends over time
- Copilot usage percentage trends  
- Copilot assistance type breakdowns

## Testing

Run the comprehensive test suite:

```bash
npm test
```

The test suite includes 10 test cases covering:
- Real-world PR detection scenarios
- Edge cases for reviewer name patterns
- Dependabot detection
- All Copilot collaboration types

## Architecture

The tool is modular with separate concerns:

- `src/pr-analyzer.js` - Core analysis logic and GitHub API integration
- `src/mermaid-generator.js` - Chart generation and visualization
- `src/index.js` - Command-line interface and orchestration
- `tests/` - Comprehensive test suite

## GitHub Actions Integration

The tool is designed to work seamlessly in GitHub Actions workflows with:
- Environment detection for CI/CD contexts
- Privacy protection for private repositories
- Step summary integration for chart display
- Efficient caching to respect rate limits

## Copilot Detection Logic

The tool uses a priority-based detection system:

1. **Author Detection**: PRs created by Copilot bot → `agent`
2. **Assignee Analysis**: Copilot as assignee → `agent`  
3. **Reviewer Analysis**: Copilot-related bots as reviewers → `review`
4. **Commit Analysis**: Co-authored commits and commit messages → context-based
5. **Content Analysis**: PR titles/descriptions mentioning Copilot → context-based

## Rate Limiting

The tool includes built-in rate limit monitoring and efficient caching to minimize GitHub API usage while providing comprehensive analysis.