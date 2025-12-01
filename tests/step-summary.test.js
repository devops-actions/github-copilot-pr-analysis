import { generateSummaryStats, generateRepositoryDataTable, generateActionsMinutesChart, generateActionsMinutesDataTable, formatNumberMetric } from '../src/mermaid-generator.js';

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
});