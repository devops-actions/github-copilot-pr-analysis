# GitHub Copilot PR Analysis Action

A GitHub Action that analyzes pull requests across your repositories to track GitHub Copilot usage, collaboration patterns, and development metrics.

## Features

- **Copilot Usage Detection**: Automatically detects GitHub Copilot-assisted PRs with detailed breakdown:
  - Copilot Coding Review assistance
  - Copilot Coding Agent contributions
  - Manual PRs (no Copilot assistance)
- **Multi-Repository Analysis**: Analyze all repositories or specific ones across your account or organization
- **Dependabot Detection**: Identifies and categorizes Dependabot PRs separately
- **Comprehensive Metrics**: Track commits, line changes (additions/deletions), file modifications
- **GitHub Actions Usage**: Monitor Actions runs and minutes consumed by Copilot-triggered workflows
- **Weekly Aggregation**: Automatic weekly grouping with trend analysis over 3-month period (configurable)
- **Mermaid Charts**: Generate beautiful visualizations including:
  - PR trends over time (total vs Copilot-assisted)
  - Copilot assistance types breakdown
  - Usage percentage trends
  - Detailed data tables
- **Privacy-First**: Automatic masking of private repository names in CI environments
- **Performance Optimized**: Built-in HTTP caching with 20-hour TTL and API retry logic with exponential backoff
- **Multiple Output Formats**: JSON and CSV exports for further analysis
- **Organization Filtering**: Include or exclude specific organizations/repositories via configuration file

## Usage

### Basic Usage

Add this action to your workflow to analyze all repositories:

```yaml
name: Analyze Pull Requests

on:
  schedule:
    - cron: '0 9 * * 1'  # Run every Monday at 9 AM UTC
  workflow_dispatch:
    inputs:
      output_format:
        description: 'Output format (json or csv)'
        required: false
        default: 'json'
      clean_cache:
        description: 'Clean cache and start fresh'
        required: false
        default: 'false'

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Run PR analysis with charts
        uses: devops-actions/github-copilot-pr-analysis@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
          output_format: ${{ inputs.output_format || 'json' }}
          analyze_all_repos: 'true'
          clean_cache: ${{ inputs.clean_cache || 'false' }}
      
      - name: Upload analysis results
        uses: actions/upload-artifact@v4
        with:
          name: pr-analysis-results
          path: report/pr_analysis_*
          retention-days: 30
```

### With HTTP Caching

To persist the HTTP cache between workflow runs and improve performance:

```yaml
      - name: Restore HTTP cache
        uses: actions/cache@v4
        with:
          path: .http_cache
          key: http-cache-${{ github.run_id }}
          restore-keys: |
            http-cache-
      
      - name: Run PR analysis
        uses: devops-actions/github-copilot-pr-analysis@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
```

### Single Repository Analysis

To analyze only a specific repository:

```yaml
      - name: Run PR analysis
        uses: devops-actions/github-copilot-pr-analysis@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
          analyze_all_repos: 'false'
        env:
          GITHUB_REPOSITORY_NAME: 'my-repo'
```

### Using Sub-Actions Separately

The action is composed of two sub-actions that can be used independently:

#### Analysis Only

Run only the PR analysis without generating charts:

```yaml
      - name: Run PR analysis only
        uses: devops-actions/github-copilot-pr-analysis/analyze@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
          output_format: 'json'
          analyze_all_repos: 'true'
```

#### Charts Only

Generate charts from existing analysis results:

```yaml
      - name: Generate charts from existing analysis
        uses: devops-actions/github-copilot-pr-analysis/charts@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
```

This is useful when you want to:
- Run analysis and charts in separate jobs
- Re-generate charts without re-running the analysis
- Customize the workflow between analysis and chart generation

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github_token` | GitHub Personal Access Token with `repo` and pull request read permissions | Yes | - |
| `output_format` | Output format for results: `json` or `csv` | No | `json` |
| `analyze_all_repos` | Analyze all repositories for the user/organization | No | `true` |
| `clean_cache` | Clean the cache and start with fresh data | No | `false` |
| `skipped_orgs` | Organizations to skip during analysis. Multiline input with one entry per line. Supports simple format (skip entire org) or selective format (`org-name:include:repo1,repo2`) | No | `''` |

## Outputs

The action generates several outputs in the `report/` directory:

- **`pr_analysis_YYYYMMDD_HHMMSS.json`**: Comprehensive JSON analysis with all metrics
- **`pr_analysis_YYYYMMDD_HHMMSS.csv`**: CSV format for spreadsheet analysis (when `output_format: 'csv'`)
- **GitHub Actions Step Summary**: Beautiful charts and tables directly in the workflow run summary

### JSON Output Structure

```json
{
  "analyzedAt": "2024-12-01T10:30:00.000Z",
  "analyzedUser": "username",
  "analyzedRepository": "all_repositories",
  "totalRepositories": 25,
  "totalPRs": 145,
  "totalCopilotPRs": 98,
  "totalActionsRuns": 1250,
  "totalActionsMinutes": 3420,
  "weeklyAnalysis": {
    "2024-W48": {
      "totalPRs": 12,
      "copilotAssistedPRs": 8,
      "copilotPercentage": 66.67,
      "copilotReviewPRs": 5,
      "copilotAgentPRs": 3,
      "uniqueCollaborators": 4,
      "collaborators": ["user1", "user2"],
      "repositories": ["repo1", "repo2"],
      "actionsUsage": {
        "totalRuns": 85,
        "totalMinutes": 245
      },
      "pullRequests": [...]
    }
  }
}
```

## Requirements

### GitHub Token Permissions

Your GitHub Personal Access Token needs the following permissions:

- `repo` scope (for private repositories) or `public_repo` (for public only)
- Read access to pull requests
- Read access to repository metadata
- Read access to Actions (for Actions usage metrics)

### Creating a PAT

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with required scopes
3. Store as a repository secret named `GH_PAT`

## Configuration

### Organization Filtering

You can control which organizations and repositories to analyze using the `skipped_orgs` input. This is a multiline input where each line specifies an organization filtering rule:

```yaml
      - name: Run PR analysis with charts
        uses: devops-actions/github-copilot-pr-analysis@v1
        with:
          github_token: ${{ secrets.GH_PAT }}
          skipped_orgs: |
            # Skip entire organization
            unwanted-org
            # Include only specific repos from an org
            my-org:include:repo1,repo2,repo3
```

#### Supported Formats

- **Simple format** - Skip entire organization: `org-name`
- **Selective format** - Skip organization except for specific repositories: `org-name:include:repo1,repo2,repo3`

Lines starting with `#` are treated as comments and ignored.

#### Legacy File-Based Configuration

For backwards compatibility, you can also create a `skipped_orgs.txt` file in your repository root. The file uses the same format as the `skipped_orgs` input. If both the input and file are present, the input takes precedence.

## Advanced Features

### Privacy & Security

- Automatically masks private repository names when running in CI environments
- Only displays analysis messages for public repositories in CI
- No sensitive data exposed in logs or outputs

### Performance Optimization

- **HTTP Caching**: 20-hour in-memory cache for API responses
- **API Retry Logic**: Exponential backoff with jitter for transient failures
- **Rate Limit Handling**: Automatic detection and waiting for rate limit reset
- **Pagination**: Efficient handling of large result sets

### Detection Capabilities

The action can detect:
- **Copilot Coding Agent PRs**: PRs created by GitHub Copilot
- **Copilot Review PRs**: PRs with Copilot-assisted code reviews
- **Dependabot PRs**: Automated dependency update PRs
- **Commit Patterns**: User vs Copilot commit ratios in PRs
- **Line Changes**: Additions, deletions, and files modified

## Documentation

For more detailed information, see:

- **[Feature Documentation](docs/pr-analysis.md)**: Comprehensive guide to all features and capabilities
- **[JavaScript Usage Guide](docs/javascript-usage.md)**: How to use the tool as a Node.js CLI

## Local Development & Testing

### Prerequisites

- Node.js 18 or higher
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/devops-actions/github-copilot-pr-analysis.git
cd github-copilot-pr-analysis

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint
```

### Running Locally

```bash
# Set required environment variables
export GH_PAT="your-github-token"
export GITHUB_REPOSITORY_OWNER="username"

# Run analysis
npm run analyze

# Generate charts
npm run charts
```

## Examples

### Chart Examples

The action generates several types of Mermaid charts:

**PR Trend Chart**: Shows total PRs vs Copilot-assisted PRs over time

**Copilot Types Chart**: Breakdown of Coding Review vs Coding Agent assistance

**Usage Percentage Chart**: Tracks Copilot adoption rate over time

### Data Tables

Detailed tables with European metric formatting (e.g., 101.891 for thousands):

- Weekly repository activity
- Percentage breakdowns
- Commit statistics
- Line change aggregations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [Report bugs or request features](https://github.com/devops-actions/github-copilot-pr-analysis/issues)
- **Documentation**: Check the [docs/](docs/) folder for detailed guides

## Credits

Originally developed by [@rajbos](https://github.com/rajbos) and extracted into a standalone action for broader community use.

## Version History

- **v1.0.0** - Initial release with full feature set
  - Multi-repository analysis
  - Copilot detection (Review & Agent)
  - Mermaid chart generation
  - JSON/CSV output formats
  - HTTP caching and retry logic
  - Privacy features for CI environments
