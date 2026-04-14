import { jest } from '@jest/globals';
import { generateSummaryStats, generateRepositoryDataTable, generateActionsMinutesChart, generateActionsMinutesDataTable, formatNumberMetric, writeToStepSummary, getActiveAgents, generateCodingAgentPieChart, generateCodingAgentWeeklyChart, generateCodingAgentDataTable } from '../src/mermaid-generator.js';

describe('Step Summary Integration', () => {
    describe('formatNumberMetric', () => {
        test('should format numbers with dot as thousand separator', () => {
            expect(formatNumberMetric(1000)).toBe('1.000');
            expect(formatNumberMetric(101891)).toBe('101.891');
            expect(formatNumberMetric(1000000)).toBe('1.000.000');
        });

        test('should handle small numbers without separators', () => {
            expect(formatNumberMetric(0)).toBe('0');
            expect(formatNumberMetric(100)).toBe('100');
            expect(formatNumberMetric(999)).toBe('999');
        });

        test('should handle null and undefined', () => {
            expect(formatNumberMetric(null)).toBe('0');
            expect(formatNumberMetric(undefined)).toBe('0');
        });

        test('should handle decimal numbers with comma as decimal separator', () => {
            expect(formatNumberMetric(1234.5)).toBe('1.234,5');
            expect(formatNumberMetric(125.8)).toBe('125,8');
        });
    });

    describe('generateSummaryStats', () => {
        test('should include GitHub Actions data in summary', () => {
            const results = {
                periodStart: '2023-01-01T00:00:00Z',
                periodEnd: '2023-01-31T23:59:59Z',
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 5,
                totalPRs: 50,
                totalCopilotPRs: 30,
                totalCopilotReviewPRs: 20,
                totalCopilotAgentPRs: 10,
                totalClaudePRs: 5,
                totalClaudeReviewPRs: 2,
                totalClaudeAgentPRs: 3,
                totalCodexPRs: 3,
                totalCodexReviewPRs: 1,
                totalCodexAgentPRs: 2,
                totalActionsRuns: 15,
                totalActionsMinutes: 120,
                weeklyAnalysis: {}
            };

            const summary = generateSummaryStats(results);

            // Verify Actions data is included
            expect(summary).toContain('**Copilot-triggered Actions runs**: 15');
            expect(summary).toContain('**Copilot Actions minutes used**: 120');
            
            // Verify other data is still there
            expect(summary).toContain('**Total PRs**: 50');
            expect(summary).toContain('**Copilot-Assisted PRs**: 30');
            expect(summary).toContain('**Copilot Review PRs**: 20');
            expect(summary).toContain('**Copilot Agent PRs**: 10');

            // Verify Claude data is included
            expect(summary).toContain('**Claude-Assisted PRs**: 5');
            expect(summary).toContain('**Claude Review PRs**: 2');
            expect(summary).toContain('**Claude Agent PRs**: 3');

            // Verify Codex data is included
            expect(summary).toContain('**Codex-Assisted PRs**: 3');
            expect(summary).toContain('**Codex Review PRs**: 1');
            expect(summary).toContain('**Codex Agent PRs**: 2');
        });

        test('should handle missing Actions data gracefully', () => {
            const results = {
                periodStart: '2023-01-01T00:00:00Z',
                periodEnd: '2023-01-31T23:59:59Z',
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 5,
                totalPRs: 50,
                totalCopilotPRs: 30,
                weeklyAnalysis: {}
            };

            const summary = generateSummaryStats(results);

            // Should not include Actions data when undefined
            expect(summary).not.toContain('Actions runs');
            expect(summary).not.toContain('Actions minutes');
            
            // Should still include other data
            expect(summary).toContain('**Total PRs**: 50');
            expect(summary).toContain('**Copilot-Assisted PRs**: 30');
        });
    });

    describe('generateRepositoryDataTable', () => {
        test('should include Actions columns in weekly data table', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10,
                    copilotAssistedPRs: 6,
                    copilotPercentage: 60,
                    uniqueCollaborators: 3,
                    repositories: ['repo1', 'repo2'],
                    actionsUsage: {
                        totalRuns: 5,
                        totalMinutes: 45
                    }
                },
                '2023-W02': {
                    totalPRs: 8,
                    copilotAssistedPRs: 4,
                    copilotPercentage: 50,
                    uniqueCollaborators: 2,
                    repositories: ['repo1'],
                    actionsUsage: {
                        totalRuns: 2,
                        totalMinutes: 20
                    }
                }
            };

            const table = generateRepositoryDataTable(weeklyData);

            // Verify header includes Actions columns
            expect(table).toContain('| Week | Total PRs | Copilot PRs | Copilot % | Actions Runs | Actions Minutes | Unique Collaborators | Repositories |');
            
            // Verify data rows include Actions data
            expect(table).toContain('| 2023-W01 | 10 | 6 | 60% | 5 | 45 | 3 | repo1, repo2 |');
            expect(table).toContain('| 2023-W02 | 8 | 4 | 50% | 2 | 20 | 2 | repo1 |');
        });

        test('should handle missing Actions data in weekly table', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10,
                    copilotAssistedPRs: 6,
                    copilotPercentage: 60,
                    uniqueCollaborators: 3,
                    repositories: ['repo1', 'repo2']
                    // No actionsUsage property
                }
            };

            const table = generateRepositoryDataTable(weeklyData);

            // Should show 0 for missing Actions data
            expect(table).toContain('| 2023-W01 | 10 | 6 | 60% | 0 | 0 | 3 | repo1, repo2 |');
        });
    });

    describe('generateActionsMinutesChart', () => {
        test('should generate chart with Actions minutes data', () => {
            const weeklyData = {
                '2023-W01': {
                    actionsUsage: {
                        totalRuns: 5,
                        totalMinutes: 45
                    }
                },
                '2023-W02': {
                    actionsUsage: {
                        totalRuns: 8,
                        totalMinutes: 120
                    }
                }
            };

            const chart = generateActionsMinutesChart(weeklyData);

            // Verify mermaid chart syntax
            expect(chart).toContain('```mermaid');
            expect(chart).toContain('xychart-beta');
            expect(chart).toContain('title "Copilot Actions Minutes Used by Week"');
            expect(chart).toContain('bar "Actions Minutes"');
            expect(chart).toContain('line "Actions Runs"');
            expect(chart).toContain('```');
            
            // Verify legend
            expect(chart).toContain('**Actions Minutes**');
            expect(chart).toContain('**Actions Runs**');
        });

        test('should handle empty weekly data', () => {
            const chart = generateActionsMinutesChart({});
            expect(chart).toBe('No data available for Actions minutes chart');
        });

        test('should handle null weekly data', () => {
            const chart = generateActionsMinutesChart(null);
            expect(chart).toBe('No data available for Actions minutes chart');
        });

        test('should handle weeks with no Actions data', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10
                    // No actionsUsage property
                }
            };

            const chart = generateActionsMinutesChart(weeklyData);
            expect(chart).toBe('No Copilot Actions data available for this period');
        });

        test('should handle weeks with zero Actions minutes', () => {
            const weeklyData = {
                '2023-W01': {
                    actionsUsage: {
                        totalRuns: 0,
                        totalMinutes: 0
                    }
                }
            };

            const chart = generateActionsMinutesChart(weeklyData);
            expect(chart).toBe('No Copilot Actions data available for this period');
        });
    });

    describe('generateActionsMinutesDataTable', () => {
        test('should generate table with Actions minutes data', () => {
            const weeklyData = {
                '2023-W01': {
                    actionsUsage: {
                        totalRuns: 5,
                        totalMinutes: 45
                    }
                },
                '2023-W02': {
                    actionsUsage: {
                        totalRuns: 8,
                        totalMinutes: 120
                    }
                }
            };

            const table = generateActionsMinutesDataTable(weeklyData);

            // Verify header
            expect(table).toContain('| Week | Actions Runs | Actions Minutes | Avg Minutes/Run |');
            
            // Verify data rows
            expect(table).toContain('| 2023-W01 | 5 | 45 | 9 |');
            expect(table).toContain('| 2023-W02 | 8 | 120 | 15 |');
            
            // Verify totals row
            expect(table).toContain('| **Total** | **13** | **165** |');
        });

        test('should handle empty weekly data', () => {
            const table = generateActionsMinutesDataTable({});
            expect(table).toBe('No data available for Actions minutes table');
        });

        test('should handle null weekly data', () => {
            const table = generateActionsMinutesDataTable(null);
            expect(table).toBe('No data available for Actions minutes table');
        });

        test('should handle weeks with no Actions data', () => {
            const weeklyData = {
                '2023-W01': {
                    totalPRs: 10
                    // No actionsUsage property
                }
            };

            const table = generateActionsMinutesDataTable(weeklyData);
            expect(table).toBe('No Copilot Actions data available for table');
        });

        test('should calculate average correctly', () => {
            const weeklyData = {
                '2023-W01': {
                    actionsUsage: {
                        totalRuns: 3,
                        totalMinutes: 100
                    }
                }
            };

            const table = generateActionsMinutesDataTable(weeklyData);
            
            // 100 / 3 = 33.333... should round to 33.3, displayed with comma as decimal separator
            expect(table).toContain('| 2023-W01 | 3 | 100 | 33,3 |');
        });

        test('should format large numbers with metric notation (dot separators)', () => {
            const weeklyData = {
                '2023-W01': {
                    actionsUsage: {
                        totalRuns: 810,
                        totalMinutes: 101891
                    }
                }
            };

            const table = generateActionsMinutesDataTable(weeklyData);
            
            // Verify metric notation with dot as thousand separator
            expect(table).toContain('| 2023-W01 | 810 | 101.891 |');
            expect(table).toContain('| **Total** | **810** | **101.891** |');
        });
    });

    describe('writeToStepSummary - output_to_step_summary control', () => {
        const originalEnv = process.env;

        afterEach(() => {
            process.env = { ...originalEnv };
        });

        test('should skip writing when OUTPUT_TO_STEP_SUMMARY is false', async () => {
            process.env.OUTPUT_TO_STEP_SUMMARY = 'false';
            process.env.GITHUB_STEP_SUMMARY = undefined;
            // Capture console output to verify nothing was written
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            
            await writeToStepSummary('test content');
            
            expect(consoleSpy).not.toHaveBeenCalledWith('test content');
            consoleSpy.mockRestore();
        });

        test('should write to console when GITHUB_STEP_SUMMARY is not set and OUTPUT_TO_STEP_SUMMARY is not false', async () => {
            delete process.env.OUTPUT_TO_STEP_SUMMARY;
            delete process.env.GITHUB_STEP_SUMMARY;
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            
            await writeToStepSummary('step summary content');
            
            expect(consoleSpy).toHaveBeenCalledWith('step summary content');
            consoleSpy.mockRestore();
        });
    });

    // ─── Coding-agent charts ───────────────────────────────────────────────

    describe('getActiveAgents', () => {
        test('returns only agents with PRs, sorted descending', () => {
            const results = { totalCopilotPRs: 318, totalClaudePRs: 3, totalCodexPRs: 0 };
            const agents = getActiveAgents(results);
            expect(agents).toHaveLength(2);
            expect(agents[0].name).toBe('GitHub Copilot');
            expect(agents[0].total).toBe(318);
            expect(agents[1].name).toBe('Claude');
        });

        test('returns empty array when no AI PRs exist', () => {
            expect(getActiveAgents({ totalCopilotPRs: 0 })).toHaveLength(0);
        });

        test('defaults missing fields to 0', () => {
            const agents = getActiveAgents({});
            expect(agents).toHaveLength(0);
        });
    });

    describe('generateCodingAgentPieChart', () => {
        test('returns fallback when fewer than 2 agents active', () => {
            const result = generateCodingAgentPieChart({ totalCopilotPRs: 10, totalClaudePRs: 0, totalCodexPRs: 0 });
            expect(result).toContain('No multi-agent data');
        });

        test('generates pie chart with active agents only', () => {
            const result = generateCodingAgentPieChart({ totalCopilotPRs: 318, totalClaudePRs: 3, totalCodexPRs: 0 });
            expect(result).toContain('```mermaid');
            expect(result).toContain('pie title');
            expect(result).toContain('"GitHub Copilot" : 318');
            expect(result).toContain('"Claude" : 3');
            expect(result).not.toContain('Codex');
        });

        test('handles all three agents', () => {
            const result = generateCodingAgentPieChart({ totalCopilotPRs: 50, totalClaudePRs: 3, totalCodexPRs: 2 });
            expect(result).toContain('"GitHub Copilot" : 50');
            expect(result).toContain('"Claude" : 3');
            expect(result).toContain('"Codex" : 2');
        });
    });

    describe('generateCodingAgentWeeklyChart', () => {
        const results = { totalCopilotPRs: 20, totalClaudePRs: 3, totalCodexPRs: 0 };

        const weeklyData = {
            '2025-W01': { copilotAssistedPRs: 10, claudeAssistedPRs: 2, codexAssistedPRs: 0, totalPRs: 15 },
            '2025-W02': { copilotAssistedPRs: 0,  claudeAssistedPRs: 0, codexAssistedPRs: 0, totalPRs: 5  },
            '2025-W03': { copilotAssistedPRs: 10, claudeAssistedPRs: 1, codexAssistedPRs: 0, totalPRs: 12 },
        };

        test('returns fallback when fewer than 2 agents active', () => {
            const r = generateCodingAgentWeeklyChart(weeklyData, { totalCopilotPRs: 5, totalClaudePRs: 0, totalCodexPRs: 0 });
            expect(r).toContain('No multi-agent data');
        });

        test('excludes all-zero weeks', () => {
            const result = generateCodingAgentWeeklyChart(weeklyData, results);
            expect(result).not.toContain('"25/02"');
        });

        test('includes weeks with AI-assisted PRs', () => {
            const result = generateCodingAgentWeeklyChart(weeklyData, results);
            expect(result).toContain('"25/01"');
            expect(result).toContain('"25/03"');
        });

        test('emits correct bar counts', () => {
            const result = generateCodingAgentWeeklyChart(weeklyData, results);
            expect(result).toContain('bar "GitHub Copilot" [10, 10]');
            expect(result).toContain('bar "Claude" [2, 1]');
        });

        test('includes single-attribution note in legend', () => {
            const result = generateCodingAgentWeeklyChart(weeklyData, results);
            expect(result).toContain('attributed to one AI tool only');
        });

        test('handles missing claude/codex fields gracefully', () => {
            const sparse = {
                '2025-W01': { copilotAssistedPRs: 5, totalPRs: 10 },
                '2025-W02': { copilotAssistedPRs: 3, totalPRs: 8  },
            };
            const r = { totalCopilotPRs: 8, totalClaudePRs: 2, totalCodexPRs: 0 };
            // Should not throw even though claudeAssistedPRs is undefined on each week
            expect(() => generateCodingAgentWeeklyChart(sparse, r)).not.toThrow();
        });
    });

    describe('generateCodingAgentDataTable', () => {
        const results = { totalCopilotPRs: 20, totalClaudePRs: 3, totalCodexPRs: 0 };

        const weeklyData = {
            '2025-W01': { copilotAssistedPRs: 10, claudeAssistedPRs: 2, codexAssistedPRs: 0, totalPRs: 15 },
            '2025-W02': { copilotAssistedPRs: 0,  claudeAssistedPRs: 0, codexAssistedPRs: 0, totalPRs: 5  },
        };

        test('returns fallback when fewer than 2 agents active', () => {
            const r = generateCodingAgentDataTable(weeklyData, { totalCopilotPRs: 5 });
            expect(r).toContain('No multi-agent data');
        });

        test('skips all-zero weeks from table', () => {
            const result = generateCodingAgentDataTable(weeklyData, results);
            expect(result).not.toContain('2025-W02');
        });

        test('includes header row with active agent names', () => {
            const result = generateCodingAgentDataTable(weeklyData, results);
            expect(result).toContain('GitHub Copilot');
            expect(result).toContain('Claude');
            expect(result).not.toContain('Codex');
        });

        test('shows count and percentage for each agent', () => {
            const result = generateCodingAgentDataTable(weeklyData, results);
            // Week 01: 10 Copilot + 2 Claude = 12 AI-assisted, Copilot ~83%, Claude ~17%
            expect(result).toContain('10 (83%)');
            expect(result).toContain('2 (17%)');
        });
    });
});