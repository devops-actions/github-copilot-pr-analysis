import { 
    calculateWeeklyLineTotals, 
    calculateOverallLineTotals,
    generateWeeklyLineTotalsChart, 
    generateWeeklyLineTotalsDataTable,
    generateSummaryStats
} from '../src/mermaid-generator.js';

describe('Weekly Line Totals Functions', () => {
    const mockWeeklyData = {
        '2024-W01': {
            pullRequests: [
                {
                    lineChanges: {
                        additions: 100,
                        deletions: 50,
                        changes: 150,
                        filesChanged: 5
                    }
                },
                {
                    lineChanges: {
                        additions: 200,
                        deletions: 30,
                        changes: 230,
                        filesChanged: 8
                    }
                }
            ]
        },
        '2024-W02': {
            pullRequests: [
                {
                    lineChanges: {
                        additions: 75,
                        deletions: 25,
                        changes: 100,
                        filesChanged: 3
                    }
                }
            ]
        }
    };

    describe('calculateWeeklyLineTotals', () => {
        test('should calculate totals correctly for multiple weeks', () => {
            const result = calculateWeeklyLineTotals(mockWeeklyData);
            
            expect(result['2024-W01']).toEqual({
                prCount: 2,
                totalAdditions: 300,
                totalDeletions: 80,
                totalChanges: 380,
                totalFilesChanged: 13
            });
            
            expect(result['2024-W02']).toEqual({
                prCount: 1,
                totalAdditions: 75,
                totalDeletions: 25,
                totalChanges: 100,
                totalFilesChanged: 3
            });
        });

        test('should handle empty data', () => {
            const result = calculateWeeklyLineTotals({});
            expect(result).toEqual({});
        });

        test('should skip PRs without line changes', () => {
            const dataWithoutLineChanges = {
                '2024-W01': {
                    pullRequests: [
                        { title: 'PR without line changes' },
                        {
                            lineChanges: {
                                additions: 10,
                                deletions: 5,
                                changes: 15,
                                filesChanged: 2
                            }
                        }
                    ]
                }
            };
            
            const result = calculateWeeklyLineTotals(dataWithoutLineChanges);
            expect(result['2024-W01']).toEqual({
                prCount: 1,
                totalAdditions: 10,
                totalDeletions: 5,
                totalChanges: 15,
                totalFilesChanged: 2
            });
        });
    });

    describe('calculateOverallLineTotals', () => {
        test('should calculate totals correctly for all PRs and Copilot PRs', () => {
            const mockDataWithCopilot = {
                '2024-W01': {
                    pullRequests: [
                        {
                            lineChanges: {
                                additions: 100,
                                deletions: 50,
                                changes: 150,
                                filesChanged: 5
                            },
                            copilotAssisted: true
                        },
                        {
                            lineChanges: {
                                additions: 200,
                                deletions: 30,
                                changes: 230,
                                filesChanged: 8
                            },
                            copilotAssisted: false
                        }
                    ]
                },
                '2024-W02': {
                    pullRequests: [
                        {
                            lineChanges: {
                                additions: 75,
                                deletions: 25,
                                changes: 100,
                                filesChanged: 3
                            },
                            copilotAssisted: false
                        }
                    ]
                }
            };

            const result = calculateOverallLineTotals(mockDataWithCopilot);
            
            expect(result.allPRs).toEqual({
                totalAdditions: 375,
                totalDeletions: 105,
                totalChanges: 480,
                totalFilesChanged: 16
            });
            
            expect(result.copilotPRs).toEqual({
                totalAdditions: 100,
                totalDeletions: 50,
                totalChanges: 150,
                totalFilesChanged: 5
            });
        });

        test('should handle empty data', () => {
            const result = calculateOverallLineTotals({});
            
            expect(result.allPRs).toEqual({
                totalAdditions: 0,
                totalDeletions: 0,
                totalChanges: 0,
                totalFilesChanged: 0
            });
            
            expect(result.copilotPRs).toEqual({
                totalAdditions: 0,
                totalDeletions: 0,
                totalChanges: 0,
                totalFilesChanged: 0
            });
        });

        test('should handle data without line changes', () => {
            const dataWithoutLineChanges = {
                '2024-W01': {
                    pullRequests: [
                        { title: 'PR without line changes', copilotAssisted: true }
                    ]
                }
            };
            
            const result = calculateOverallLineTotals(dataWithoutLineChanges);
            
            expect(result.allPRs).toEqual({
                totalAdditions: 0,
                totalDeletions: 0,
                totalChanges: 0,
                totalFilesChanged: 0
            });
            
            expect(result.copilotPRs).toEqual({
                totalAdditions: 0,
                totalDeletions: 0,
                totalChanges: 0,
                totalFilesChanged: 0
            });
        });
    });

    describe('generateWeeklyLineTotalsChart', () => {
        test('should generate chart with correct structure', () => {
            const result = generateWeeklyLineTotalsChart(mockWeeklyData);
            
            expect(result).toContain('```mermaid');
            expect(result).toContain('xychart-beta');
            expect(result).toContain('Total Lines of Code Added/Deleted per Week');
            expect(result).toContain('line "Total Lines Added"');
            expect(result).toContain('line "Total Lines Deleted"');
            expect(result).toContain('24/01');
            expect(result).toContain('24/02');
        });

        test('should handle empty data', () => {
            const result = generateWeeklyLineTotalsChart({});
            expect(result).toBe('No data available for weekly line totals chart');
        });

        test('should handle data without line changes', () => {
            const emptyData = {
                '2024-W01': {
                    pullRequests: [{ title: 'PR without line changes' }]
                }
            };
            
            const result = generateWeeklyLineTotalsChart(emptyData);
            expect(result).toBe('No PR line changes data available for this period');
        });
    });

    describe('generateWeeklyLineTotalsDataTable', () => {
        test('should generate data table with correct structure', () => {
            const result = generateWeeklyLineTotalsDataTable(mockWeeklyData);
            
            expect(result).toContain('| Week | PRs | Total Lines Added | Total Lines Deleted | Total Lines Changed | Total Files Changed |');
            expect(result).toContain('| 2024-W01 | 2 | 300 | 80 | 380 | 13 |');
            expect(result).toContain('| 2024-W02 | 1 | 75 | 25 | 100 | 3 |');
        });

        test('should handle empty data', () => {
            const result = generateWeeklyLineTotalsDataTable({});
            expect(result).toBe('No PR line changes data available for table');
        });
    });

    describe('generateSummaryStats', () => {
        test('should include line totals in summary', () => {
            const mockResults = {
                periodStart: new Date('2024-01-01').toISOString(),
                periodEnd: new Date('2024-01-31').toISOString(),
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 1,
                totalPRs: 3,
                totalCopilotPRs: 1,
                weeklyAnalysis: {
                    '2024-W01': {
                        pullRequests: [
                            {
                                lineChanges: {
                                    additions: 100,
                                    deletions: 50,
                                    changes: 150,
                                    filesChanged: 5
                                },
                                copilotAssisted: true
                            },
                            {
                                lineChanges: {
                                    additions: 200,
                                    deletions: 30,
                                    changes: 230,
                                    filesChanged: 8
                                },
                                copilotAssisted: false
                            }
                        ]
                    },
                    '2024-W02': {
                        pullRequests: [
                            {
                                lineChanges: {
                                    additions: 75,
                                    deletions: 25,
                                    changes: 100,
                                    filesChanged: 3
                                },
                                copilotAssisted: false
                            }
                        ]
                    }
                }
            };
            
            const result = generateSummaryStats(mockResults);
            
            expect(result).toContain('📊 Analysis Summary');
            expect(result).toContain('📝 Lines of Code Metrics:');
            expect(result).toContain('| **Total Lines Added** | 375 | 100 | 26.67% |'); // 100/375 * 100 = 26.67%
            expect(result).toContain('| **Total Lines Deleted** | 105 | 50 | 47.62% |'); // 50/105 * 100 = 47.62%
            expect(result).toContain('| **Total Lines Changed** | 480 | 150 | 31.25% |'); // 150/480 * 100 = 31.25%
            expect(result).toContain('| **Total Files Changed** | 16 | 5 | 31.25% |'); // 5/16 * 100 = 31.25%
        });

        test('should handle results without weekly analysis', () => {
            const mockResults = {
                periodStart: new Date('2024-01-01').toISOString(),
                periodEnd: new Date('2024-01-31').toISOString(),
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 1,
                totalPRs: 0,
                totalCopilotPRs: 0
            };
            
            const result = generateSummaryStats(mockResults);
            
            expect(result).toContain('📊 Analysis Summary');
            expect(result).not.toContain('📝 Lines of Code Metrics:');
        });

        test('should handle zero division cases in percentage calculations', () => {
            const mockResults = {
                periodStart: new Date('2024-01-01').toISOString(),
                periodEnd: new Date('2024-01-31').toISOString(),
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 1,
                totalPRs: 1,
                totalCopilotPRs: 0,
                weeklyAnalysis: {
                    '2024-W01': {
                        pullRequests: [
                            {
                                lineChanges: {
                                    additions: 0,
                                    deletions: 0,
                                    changes: 0,
                                    filesChanged: 0
                                },
                                copilotAssisted: false
                            }
                        ]
                    }
                }
            };
            
            const result = generateSummaryStats(mockResults);
            
            expect(result).toContain('📊 Analysis Summary');
            // When all values are zero, the table should not be generated
            expect(result).not.toContain('📝 Lines of Code Metrics:');
        });

        test('should calculate percentages correctly with zero copilot values', () => {
            const mockResults = {
                periodStart: new Date('2024-01-01').toISOString(),
                periodEnd: new Date('2024-01-31').toISOString(),
                analyzedUser: 'testuser',
                analyzedRepository: 'testrepo',
                totalRepositories: 1,
                totalPRs: 1,
                totalCopilotPRs: 0,
                weeklyAnalysis: {
                    '2024-W01': {
                        pullRequests: [
                            {
                                lineChanges: {
                                    additions: 100,
                                    deletions: 50,
                                    changes: 150,
                                    filesChanged: 5
                                },
                                copilotAssisted: false
                            }
                        ]
                    }
                }
            };
            
            const result = generateSummaryStats(mockResults);
            
            expect(result).toContain('📊 Analysis Summary');
            expect(result).toContain('📝 Lines of Code Metrics:');
            expect(result).toContain('| **Total Lines Added** | 100 | 0 | 0% |');
            expect(result).toContain('| **Total Lines Deleted** | 50 | 0 | 0% |');
            expect(result).toContain('| **Total Lines Changed** | 150 | 0 | 0% |');
            expect(result).toContain('| **Total Files Changed** | 5 | 0 | 0% |');
        });
    });
});