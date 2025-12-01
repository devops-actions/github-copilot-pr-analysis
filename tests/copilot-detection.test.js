import { jest } from '@jest/globals';
import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';
import { 
    calculateCommitStatsPerWeek, 
    generateCommitStatsChart, 
    generateCommitStatsDataTable,
    calculateLineChangesStatsPerWeek,
    generateLineChangesChart,
    generateLineChangesDataTable
} from '../src/mermaid-generator.js';

describe('GitHubPRAnalyzer - Copilot Detection', () => {
    let analyzer;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
    });

    test('should detect PR #143 as Copilot agent collaboration', async () => {
        // Real PR data from GitHub API for mcp-research/mcp-security-scans/pull/143
        const prData = {
            number: 143,
            title: 'Fix secret scanning types not being categorized due to missing attributes',
            body: '## Problem\n\nThe daily security reports were showing "Secrets found but types not categorized" instead of displaying actual secret types, even when repositories had secret scanning alerts.\n\n## Root Cause\n\nThe `get_secret_scanning_alerts` function in `src/analyze.py` was using direct attribute access to read secret type information from GitHub API responses:\n\n```python\nsecret_type = alert.secret_type_display_name or alert.secret_type or "Unknown"\n```\n\nWhen the GitHub API response didn\'t include `secret_type_display_name` or `secret_type` attributes, this caused an `AttributeError`. The exception was caught by the generic exception handler, which logged an error and returned a result with `total > 0` but an empty `types` dictionary. This led to the "Secrets found but types not categorized" message in reports.\n\n## Solution\n\nChanged the attribute access to use `getattr()` with default values:\n\n```python\nsecret_type = getattr(alert, \'secret_type_display_name\', None) or getattr(alert, \'secret_type\', None) or "Unknown"\n```\n\nThis prevents `AttributeError` exceptions and ensures that secret alerts with missing type attributes are properly categorized as "Unknown" instead of being lost.\n\n## Impact\n\n- Secret scanning alerts are now properly categorized in reports\n- Reports will show actual secret types (including "Unknown" for unidentifiable secrets) instead of "Secrets found but types not categorized"\n- Improved reliability when GitHub API responses have incomplete data\n- No breaking changes to existing functionality\n\n## Testing\n\n- Added comprehensive test case for missing secret type attributes\n- All existing tests continue to pass\n- Verified the fix handles various edge cases (missing attributes, None values, empty strings)\n\nFixes #142.\n\n---\n\n💡 You can make Copilot smarter by setting up custom instructions, customizing its development environment and configuring Model Context Protocol (MCP) servers. Learn more [Copilot coding agent tips](https://gh.io/copilot-coding-agent-tips) in the docs.',
            user: {
                login: 'Copilot',
                id: 198982749,
                type: 'Bot'
            },
            assignees: [
                {
                    login: 'rajbos',
                    id: 1756190,
                    type: 'User'
                },
                {
                    login: 'Copilot',
                    id: 198982749,
                    type: 'Bot'
                }
            ],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'mcp-research/mcp-security-scans'
                }
            }
        };
        
        const mockReviews = [
            {
                user: {
                    login: 'copilot-pull-request-reviewer[bot]',
                    id: 175728472,
                    type: 'Bot'
                },
                state: 'COMMENTED',
                body: '## Pull Request Overview\\n\\nThis PR fixes an issue where secret scanning alerts were not being properly categorized when secret type attributes were missing from the GitHub API response...'
            }
        ];
        
        // Mock the API calls
        const mockCommits = [];
        
        // Mock the methods that make API calls
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue(mockCommits);
        
        // Test the detection
        const result = await analyzer.detectCopilotCollaboration(prData);
        
        // Based on the priority in detectCopilotCollaboration:
        // 1. Copilot bot as author -> 'agent' (this should match first)
        expect(result).toBe('agent');
    });

    test('should detect Copilot as author as agent', async () => {
        const prData = {
            number: 1,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'Copilot', type: 'Bot' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('agent');
    });

    test('should detect copilot-pull-request-reviewer[bot] as review', async () => {
        const prData = {
            number: 3,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'human_user', type: 'User' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        const mockReviews = [
            { user: { login: 'copilot-pull-request-reviewer[bot]', type: 'Bot' } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should detect Copilot as assignee as agent', async () => {
        const prData = {
            number: 2,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'human_user', type: 'User' },
            assignees: [{ login: 'Copilot', type: 'Bot' }],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('agent');
    });

    test('should detect Copilot as reviewer as review', async () => {
        const prData = {
            number: 4,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'human_user', type: 'User' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        const mockReviews = [
            { user: { login: 'Copilot', type: 'Bot' } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should return none for PR without Copilot', async () => {
        const prData = {
            number: 5,
            title: 'Regular PR',
            body: 'Regular PR body',
            user: { login: 'human_user', type: 'User' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue([]);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('none');
    });

    test('should handle edge case reviewer names with copilot and review', async () => {
        const prData = {
            number: 6,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'human_user', type: 'User' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        const mockReviews = [
            { user: { login: 'copilot-code-reviewer', type: 'Bot' } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('review');
    });

    test('should not detect usernames containing copilot but not review as reviewers', async () => {
        const prData = {
            number: 7,
            title: 'Test PR',
            body: 'Test body',
            user: { login: 'human_user', type: 'User' },
            assignees: [],
            requested_reviewers: [],
            base: {
                repo: {
                    full_name: 'test/repo'
                }
            }
        };
        
        const mockReviews = [
            { user: { login: 'copilot-assistant', type: 'Bot' } }
        ];
        
        jest.spyOn(analyzer, 'getPRReviews').mockResolvedValue(mockReviews);
        jest.spyOn(analyzer, 'getPRCommits').mockResolvedValue([]);
        
        const result = await analyzer.detectCopilotCollaboration(prData);
        expect(result).toBe('none');
    });

    test('should detect dependabot PRs', () => {
        const dependabotPR = {
            user: { login: 'dependabot[bot]', type: 'Bot' },
            title: 'Bump axios from 1.0.0 to 1.6.0'
        };
        
        const result = analyzer.detectDependabotPR(dependabotPR);
        expect(result).toBe(true);
    });

    test('should not detect regular PRs as dependabot', () => {
        const regularPR = {
            user: { login: 'human_user', type: 'User' },
            title: 'Add new feature'
        };
        
        const result = analyzer.detectDependabotPR(regularPR);
        expect(result).toBe(false);
    });
    
    test('should analyze commit counts correctly', () => {
        const commits = [
            {
                commit: {
                    author: { name: 'rajbos' },
                    committer: { name: 'GitHub' },
                    message: 'Add new feature'
                },
                author: { login: 'rajbos' }
            },
            {
                commit: {
                    author: { name: 'GitHub Copilot' },
                    committer: { name: 'GitHub' },
                    message: 'Fix bug with copilot assistance'
                },
                author: { login: 'rajbos' }
            },
            {
                commit: {
                    author: { name: 'rajbos' },
                    committer: { name: 'GitHub' },
                    message: 'Update README\n\nCo-authored-by: GitHub Copilot <noreply@github.com>'
                },
                author: { login: 'rajbos' }
            },
            {
                commit: {
                    author: { name: 'rajbos' },
                    committer: { name: 'GitHub' },
                    message: 'Regular commit without assistance'
                },
                author: { login: 'rajbos' }
            }
        ];
        
        const result = analyzer.analyzeCommitCounts(commits);
        
        expect(result.totalCommits).toBe(4);
        expect(result.copilotCommits).toBe(2); // One with Copilot author, one with co-authored-by
        expect(result.userCommits).toBe(2); // Two regular commits
    });
    
    test('should handle empty commit list', () => {
        const result = analyzer.analyzeCommitCounts([]);
        
        expect(result.totalCommits).toBe(0);
        expect(result.userCommits).toBe(0);
        expect(result.copilotCommits).toBe(0);
    });
    
    test('should detect copilot commits by author name', () => {
        const commits = [
            {
                commit: {
                    author: { name: 'copilot[bot]' },
                    committer: { name: 'GitHub' },
                    message: 'Generated code'
                },
                author: { login: 'copilot[bot]' }
            }
        ];
        
        const result = analyzer.analyzeCommitCounts(commits);
        
        expect(result.totalCommits).toBe(1);
        expect(result.copilotCommits).toBe(1);
        expect(result.userCommits).toBe(0);
    });
    
    test('should analyze line changes correctly', () => {
        const files = [
            { additions: 50, deletions: 20, changes: 70 },
            { additions: 30, deletions: 10, changes: 40 },
            { additions: 0, deletions: 5, changes: 5 }
        ];
        
        const result = analyzer.analyzeLineChanges(files);
        
        expect(result.additions).toBe(80);
        expect(result.deletions).toBe(35);
        expect(result.changes).toBe(115);
        expect(result.filesChanged).toBe(3);
    });
    
    test('should handle empty files list for line changes', () => {
        const result = analyzer.analyzeLineChanges([]);
        
        expect(result.additions).toBe(0);
        expect(result.deletions).toBe(0);
        expect(result.changes).toBe(0);
        expect(result.filesChanged).toBe(0);
    });
});

describe('Commit Statistics Functions', () => {
    test('should calculate commit statistics per week correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 5, userCommits: 3, copilotCommits: 2 }
                    },
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 3, userCommits: 2, copilotCommits: 1 }
                    },
                    {
                        copilotAssisted: false,
                        commitCounts: { totalCommits: 2, userCommits: 2, copilotCommits: 0 }
                    }
                ]
            },
            '2024-W02': {
                pullRequests: [
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 7, userCommits: 4, copilotCommits: 3 }
                    }
                ]
            }
        };
        
        const result = calculateCommitStatsPerWeek(weeklyData);
        
        expect(result['2024-W01']).toEqual({
            prCount: 2,
            totalCommits: { min: 3, max: 5, avg: 4 },
            userCommits: { min: 2, max: 3, avg: 2.5 },
            copilotCommits: { min: 1, max: 2, avg: 1.5 }
        });
        
        expect(result['2024-W02']).toEqual({
            prCount: 1,
            totalCommits: { min: 7, max: 7, avg: 7 },
            userCommits: { min: 4, max: 4, avg: 4 },
            copilotCommits: { min: 3, max: 3, avg: 3 }
        });
    });
    
    test('should handle weeks with no copilot PRs', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        copilotAssisted: false,
                        commitCounts: { totalCommits: 2, userCommits: 2, copilotCommits: 0 }
                    }
                ]
            }
        };
        
        const result = calculateCommitStatsPerWeek(weeklyData);
        
        expect(result).toEqual({});
    });
    
    test('should generate commit stats chart correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 5, userCommits: 3, copilotCommits: 2 }
                    }
                ]
            }
        };
        
        const result = generateCommitStatsChart(weeklyData);
        
        expect(result).toContain('```mermaid');
        expect(result).toContain('xychart-beta');
        expect(result).toContain('title "Copilot PR Commit Count Statistics by Week"');
        expect(result).toContain('line "Min Commits" [5]');
        expect(result).toContain('line "Avg Commits" [5]');
        expect(result).toContain('line "Max Commits" [5]');
        expect(result).toContain('**Min Commits**');
        expect(result).toContain('**Avg Commits**');
        expect(result).toContain('**Max Commits**');
    });
    
    test('should handle empty data for commit stats chart', () => {
        const result = generateCommitStatsChart({});
        expect(result).toBe('No data available for commit statistics chart');
    });
    
    test('should generate commit stats data table correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 5, userCommits: 3, copilotCommits: 2 }
                    },
                    {
                        copilotAssisted: true,
                        commitCounts: { totalCommits: 3, userCommits: 2, copilotCommits: 1 }
                    }
                ]
            }
        };
        
        const result = generateCommitStatsDataTable(weeklyData);
        
        expect(result).toContain('| Week | PRs | Min Commits | Avg Commits | Max Commits |');
        expect(result).toContain('| 2024-W01 | 2 | 3 | 4 | 5 |');
    });
    
    test('should handle empty data for commit stats data table', () => {
        const result = generateCommitStatsDataTable({});
        expect(result).toBe('No Copilot PR commit data available for table');
    });
    
    test('should calculate line changes statistics per week correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        lineChanges: { additions: 50, deletions: 20, changes: 70, filesChanged: 3 }
                    },
                    {
                        lineChanges: { additions: 30, deletions: 10, changes: 40, filesChanged: 2 }
                    }
                ]
            },
            '2024-W02': {
                pullRequests: [
                    {
                        lineChanges: { additions: 100, deletions: 40, changes: 140, filesChanged: 5 }
                    }
                ]
            }
        };
        
        const result = calculateLineChangesStatsPerWeek(weeklyData);
        
        expect(result['2024-W01']).toEqual({
            prCount: 2,
            additions: { min: 30, max: 50, avg: 40 },
            deletions: { min: 10, max: 20, avg: 15 },
            changes: { min: 40, max: 70, avg: 55 },
            filesChanged: { min: 2, max: 3, avg: 2.5 }
        });
        
        expect(result['2024-W02']).toEqual({
            prCount: 1,
            additions: { min: 100, max: 100, avg: 100 },
            deletions: { min: 40, max: 40, avg: 40 },
            changes: { min: 140, max: 140, avg: 140 },
            filesChanged: { min: 5, max: 5, avg: 5 }
        });
    });
    
    test('should handle weeks with no PR line changes data', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        // PR without lineChanges data
                        copilotAssisted: false
                    }
                ]
            }
        };
        
        const result = calculateLineChangesStatsPerWeek(weeklyData);
        
        expect(result).toEqual({});
    });
    
    test('should generate line changes chart correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        lineChanges: { additions: 50, deletions: 20, changes: 70, filesChanged: 3 }
                    }
                ]
            }
        };
        
        const result = generateLineChangesChart(weeklyData);
        
        expect(result).toContain('```mermaid');
        expect(result).toContain('xychart-beta');
        expect(result).toContain('title "Lines of Code Changed per PR by Week"');
        expect(result).toContain('line "Min Lines Changed" [70]');
        expect(result).toContain('line "Avg Lines Changed" [70]');
        expect(result).toContain('line "Max Lines Changed" [70]');
        expect(result).toContain('**Min Lines Changed**');
        expect(result).toContain('**Avg Lines Changed**');
        expect(result).toContain('**Max Lines Changed**');
    });
    
    test('should handle empty data for line changes chart', () => {
        const result = generateLineChangesChart({});
        expect(result).toBe('No data available for line changes chart');
    });
    
    test('should generate line changes data table correctly', () => {
        const weeklyData = {
            '2024-W01': {
                pullRequests: [
                    {
                        lineChanges: { additions: 50, deletions: 20, changes: 70, filesChanged: 3 }
                    },
                    {
                        lineChanges: { additions: 30, deletions: 10, changes: 40, filesChanged: 2 }
                    }
                ]
            }
        };
        
        const result = generateLineChangesDataTable(weeklyData);
        
        expect(result).toContain('| Week | PRs | Min Changes | Avg Changes | Max Changes |');
        expect(result).toContain('| 2024-W01 | 2 | 40 | 55 | 70 |');
    });
    
    test('should handle empty data for line changes data table', () => {
        const result = generateLineChangesDataTable({});
        expect(result).toBe('No PR line changes data available for table');
    });
});