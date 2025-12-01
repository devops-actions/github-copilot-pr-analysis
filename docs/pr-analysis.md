# PR Analysis Documentation

## Overview

This repository includes a GitHub Actions workflow and Python scripts to analyze pull requests from the last 3 months across all user repositories, with a focus on GitHub Copilot collaboration detection and visualization.

## Files

- `scripts/pr_analysis.py` - Main Python script for analyzing PRs
- `scripts/generate_mermaid_charts.py` - Script for generating mermaid charts
- `.github/workflows/pr-analysis.yml` - GitHub Actions workflow
- `requirements.txt` - Python dependencies

## Features

### PR Analysis Script (`scripts/pr_analysis.py`)

The script analyzes pull requests and provides:

1. **HTTP Request Caching**: All GitHub API requests are cached for 4 hours using SQLite backend to reduce API calls and improve performance
2. **Rate Limit Monitoring**: Displays current GitHub API rate limit status and reset time in minutes/seconds
3. **Multi-Repository Analysis**: Analyzes PRs across all user repositories and organization repositories where the user has been involved
4. **Organization Support**: Automatically discovers and analyzes PRs from all organizations the user belongs to
5. **Pull Request Retrieval**: Fetches all PRs from the past 3 months using GitHub's REST API
6. **Collaborator Analysis**: Identifies all collaborators on PRs
7. **Weekly Grouping**: Calculates PR counts for each week
8. **Copilot Detection**: Determines which PRs were co-created with GitHub Copilot
9. **Dependabot Detection**: Identifies PRs created by Dependabot for dependency updates
10. **Output Formats**: Results in JSON or CSV format
11. **Repository Filtering**: Automatically skips archived and disabled repositories to focus analysis on active repositories
12. **Commit Count Analysis**: For Copilot-assisted PRs, analyzes and reports the breakdown of commits by user vs Copilot

#### Commit Count Analysis

For each Copilot-assisted PR, the system analyzes individual commits to provide detailed insights:

- **Total Commits**: Count of all commits in the PR
- **User Commits**: Commits authored by the analyzed user without Copilot assistance
- **Copilot Commits**: Commits that show evidence of Copilot collaboration, including:
  - Commits with co-authored-by Copilot attribution
  - Commits authored by Copilot bots
  - Commits with commit messages mentioning Copilot

This analysis provides transparency into the collaboration patterns between users and GitHub Copilot within pull requests.

#### Repository Filtering

The script automatically filters out repositories that should not be analyzed:

- **Archived Repositories**: Repositories that are archived (read-only) are skipped
- **Disabled Repositories**: Repositories that are disabled or deleted are skipped
- **Tracking**: Reports the number of repositories analyzed vs skipped for transparency

This filtering reduces unnecessary API calls and focuses the analysis on active, maintainable repositories.

#### Multi-Repository and Organization Support

By default, the script now analyzes **all repositories** for the authenticated user and **all organization repositories** where the user has been involved, providing a comprehensive view of development activity and Copilot usage across the entire GitHub profile.

**Organization Analysis:**
- Automatically discovers all organizations the user belongs to
- Fetches repositories from each organization
- Filters PRs to only include those where the user was involved (as author, assignee, or reviewer)
- Displays organization repositories with full path (e.g., `org-name/repo-name`)
- Supports flexible organization filtering via `skipped_orgs.txt` configuration file

#### Organization Filtering

The script supports flexible organization filtering through the `skipped_orgs.txt` configuration file, which supports two filtering modes:

**1. Complete Organization Exclusion:**
```
# Skip entire organizations
LinkedInLearning
githubpartners
```

**2. Selective Repository Inclusion:**
```
# Skip organization except for specific repositories
mcp-research:include:mcp-security-scans
test-org:include:repo1,repo2,repo3
```

The selective filtering format allows you to exclude an entire organization while still analyzing specific repositories within that organization. This is useful when you want to focus on particular projects within a large organization.

#### HTTP Request Caching

The script implements efficient HTTP request caching to improve performance and reduce GitHub API calls:

- **Cache Backend**: Uses SQLite database for persistent storage (`.http_cache/github_api_cache.sqlite`)
- **Cache Duration**: Responses are cached for 4 hours (configurable in `_setup_cache()` method)
- **Cached Methods**: Only GET requests are cached (POST/PUT/DELETE are never cached)
- **Cached Status Codes**: Caches HTTP 200 (success) and 404 (not found) responses  
- **Artifact Persistence**: Cache database is uploaded/downloaded as GitHub Artifact to persist between workflow runs
- **Stale Cache**: Returns cached responses even if they're expired when new requests fail
- **Cache Location**: Stored in `.http_cache/` directory (excluded from git via `.gitignore`)

This caching reduces redundant API calls, especially for repository metadata and pull request data that doesn't change frequently.

#### Rate Limit Monitoring

The script includes real-time GitHub API rate limit monitoring to help users understand their current API usage:

- **Non-Cached Rate Limit Check**: Makes a dedicated API call to `/rate_limit` endpoint (not cached to ensure real-time data)
- **Remaining Requests**: Displays current remaining requests out of the total limit (e.g., "3000/5000")
- **Reset Time Display**: Shows time until rate limit resets in human-readable format ("29 minutes and 30 seconds")
- **Error Handling**: Gracefully handles rate limit API failures with warning messages
- **Real-Time Status**: Called at the start of analysis to provide immediate feedback on API capacity

This monitoring helps users understand their API consumption and plan analysis runs accordingly, especially important for large-scale repository analysis.

#### Copilot Detection Methods

The script detects GitHub Copilot collaboration and categorizes by assistance type:

- **Author Detection**: PRs created by the Copilot bot user (categorized as 'agent')
- **Keyword Analysis**: PR titles/descriptions mentioning "copilot", "co-pilot", "github copilot", "ai-assisted"
  - **Review Type**: Keywords like "review", "feedback", "suggestion", "comment", "approve"
  - **Agent Type**: Keywords like "generate", "create", "implement", "code", "develop", "write"
- **Assignee Analysis**: PRs with Copilot as an assignee (categorized as 'review')
- **Commit Analysis**: Commit messages mentioning Copilot or containing co-authored-by patterns
  - **Co-authored Commits**: Indicate code generation (categorized as 'agent')
  - **Review Context**: Commit messages with review-related keywords (categorized as 'review')

**Categories:**
- **Coding Review**: PRs where Copilot was used for code review assistance
- **Coding Agent**: PRs where Copilot was used for code generation/development

#### Dependabot Detection Methods

The script detects Dependabot PRs through:

- **Author Detection**: PRs created by dependabot or dependabot[bot] users
- **Title Pattern Analysis**: PR titles with patterns like "bump", "update", "build(deps)", typical of dependency updates

#### Usage

```bash
# Set environment variables
export GITHUB_TOKEN="your_github_pat"  # Personal Access Token required
export GITHUB_REPOSITORY_OWNER="username"
export OUTPUT_FORMAT="json"  # or "csv"
export ANALYZE_ALL_REPOS="true"  # analyze all user repos (default)

# Run the script
python scripts/pr_analysis.py
```

### Mermaid Chart Generator (`scripts/generate_mermaid_charts.py`)

This script reads the JSON analysis results and generates interactive mermaid charts:

1. **PR Trends Chart**: Shows total PRs, Copilot-assisted PRs, and Dependabot PRs over time
2. **Copilot Usage Percentage Chart**: Displays the percentage trends for Copilot adoption
3. **Copilot Assistance Types Chart**: Stacked bar chart showing breakdown by assistance type (Coding Review vs Coding Agent)
4. **Repository Activity Breakdown**: Shows top repositories by PR activity (when analyzing all repos)

The charts are automatically displayed in the GitHub Actions step summary for easy visualization.

### GitHub Actions Workflow (`.github/workflows/pr-analysis.yml`)

The workflow:

- **Schedule**: Runs every Monday at 9:00 AM UTC
- **Manual Trigger**: Can be triggered manually with optional output format selection and cache cleaning option
- **Authentication**: Uses Personal Access Token (`secrets.GITHUB_PAT`) for full access
- **HTTP Cache**: Downloads and uploads cache artifacts to persist between runs
- **Cache Management**: Option to clean cache and start fresh when manually triggered
- **Artifacts**: Uploads analysis results with 30-day retention
- **Visualization**: Generates and displays mermaid charts in step summary

#### Workflow Features

- Automatic Python environment setup
- Dependency installation from `requirements.txt`
- HTTP cache download (if available from previous runs)
- Optional cache cleaning for fresh analysis (manual trigger only)
- Multi-repository PR analysis
- HTTP cache upload for future runs
- Mermaid chart generation and display
- Artifact upload for both JSON and CSV formats

## Output Format

### JSON Output Structure

```json
{
  "analysis_date": "2025-01-06T21:30:00Z",
  "period_start": "2024-10-06T21:30:00Z",
  "period_end": "2025-01-06T21:30:00Z",
  "analyzed_user": "rajbos",
  "analyzed_repository": "all_repositories",
  "total_prs": 15,
  "total_copilot_prs": 8,
  "total_copilot_review_prs": 3,
  "total_copilot_agent_prs": 5,
  "total_dependabot_prs": 4,
  "total_repositories": 42,
  "weekly_analysis": {
    "2024-W41": {
      "total_prs": 3,
      "copilot_assisted_prs": 1,
      "copilot_review_prs": 0,
      "copilot_agent_prs": 1,
      "copilot_percentage": 33.33,
      "copilot_review_percentage": 0.0,
      "copilot_agent_percentage": 33.33,
      "dependabot_prs": 1,
      "dependabot_percentage": 33.33,
      "unique_collaborators": 2,
      "collaborators": ["rajbos", "dependabot"],
      "repositories": ["repo1", "repo2"],
      "pull_requests": [
        {
          "number": 1,
          "title": "Test PR",
          "author": "rajbos",
          "repository": "repo1",
          "created_at": "2024-10-08T10:00:00Z",
          "copilot_assisted": true,
          "copilot_type": "agent",
          "dependabot_pr": false,
          "url": "https://github.com/rajbos/repo1/pull/1",
          "commit_counts": {
            "total_commits": 5,
            "user_commits": 3,
            "copilot_commits": 2
          }
        }
      ]
    }
  }
}
```

### CSV Output Structure

```csv
Week,Total PRs,Copilot Assisted PRs,Copilot Review PRs,Copilot Agent PRs,Copilot Percentage,Copilot Review Percentage,Copilot Agent Percentage,Unique Collaborators,Collaborators
2024-W41,3,1,0,1,33.33,0.0,33.33,2,"rajbos, dependabot"
```

## Security

- **Authentication**: Uses Personal Access Token (`secrets.GITHUB_PAT`) for comprehensive repository access
- **Permissions**: Read access to all user repositories, organization repositories, and pull requests
- **Privacy**: No sensitive data in outputs, only public repository information
  - In GitHub Actions: Private repository names are replaced with `<private-repo>` in logs and outputs
  - In local/Codespace environments: Full repository information is shown for debugging purposes
- **Retention**: 30-day artifact retention limit

## Setup Requirements

### Personal Access Token

To analyze all repositories and organizations, you need to create a Personal Access Token:

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a new token with the following scopes:
   - `repo` (Full control of private repositories)
   - `public_repo` (Access public repositories)
   - `read:user` (Read user profile data)
   - `read:org` (Read organization data)
3. Add the token as `GITHUB_PAT` in your repository secrets

### Repository Secret

Add your Personal Access Token as a repository secret:
1. Go to your repository Settings → Secrets and variables → Actions
2. Create a new secret named `GITHUB_PAT`
3. Set the value to your Personal Access Token

## Visualization Examples

The workflow automatically generates charts and data tables in the step summary:

- **📈 Pull Request Trends**: Line chart showing total PRs, Copilot-assisted PRs, and Dependabot PRs over time
  - **📊 Pull Request Trends Data**: Corresponding table with exact weekly numbers (in collapsed section)
- **🤖 GitHub Copilot Usage Trends**: Percentage chart showing Copilot adoption patterns
  - **📊 Copilot Usage Percentage Data**: Corresponding table with exact weekly percentages (in collapsed section)
- **🤖📝 GitHub Copilot Assistance Types**: Stacked bar chart showing breakdown by assistance type (Coding Review vs Coding Agent)
  - **📊 Copilot Assistance Types Data**: Corresponding table with assistance type breakdown (in collapsed section)
- **📚 Repository Activity Breakdown**: Bar chart of most active repositories
  - **📊 Repository Activity Data**: Corresponding table with exact repository PR counts (in collapsed section)

The data tables are displayed in collapsible sections below each chart, providing exact numerical values that correspond to each chart while keeping the interface clean and organized.

## Customization

The script can be customized by modifying:

- **Time Period**: Change the 90-day lookback period in `analyze_pull_requests()`
- **Detection Keywords**: Add/modify Copilot detection keywords in `detect_copilot_collaboration()` or Dependabot patterns in `detect_dependabot_pr()`
- **Output Format**: Extend JSON/CSV structures in `save_results()`
- **Chart Types**: Modify mermaid chart generation in `generate_mermaid_charts.py`
- **Schedule**: Modify workflow cron expression