import fs from 'fs/promises';
import { glob } from 'glob';
import { REPORT_FOLDER } from './constants.js';

/**
 * Check if the script is running in a CI environment (GitHub Actions).
 */
export function isRunningInCI() {
    return process.env.GITHUB_ACTIONS?.toLowerCase() === 'true' || 
           process.env.CI?.toLowerCase() === 'true';
}

/**
 * Mask sensitive information for display when running in CI.
 */
export function maskPrivateInfoForDisplay(value) {
    if (isRunningInCI()) {
        if (value && !['all_repositories', 'N/A', 'unknown'].includes(value)) {
            // Check if this looks like it could be private info
            if (value.includes('<private-repo>') || value.startsWith('<private')) {
                return value; // Already masked
            }
            // For analyzed_user, we keep it but could mask if needed
            return value;
        }
    }
    return value;
}

/**
 * Format a number with European metric notation (dot as thousand separator, comma for decimals).
 * Example: 101891 -> "101.891", 125.8 -> "125,8"
 */
export function formatNumberMetric(num) {
    if (num === null || num === undefined) {
        return '0';
    }
    // Convert to string and handle decimals
    const parts = num.toString().split('.');
    // Add dots as thousand separators for the integer part
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    // Join with comma if there's a decimal part
    return parts.length > 1 ? parts.join(',') : parts[0];
}

/**
 * Find the latest analysis JSON file.
 */
export async function findLatestAnalysisFile() {
    const jsonFiles = await glob(`${REPORT_FOLDER}pr_analysis_*.json`);
    if (jsonFiles.length === 0) {
        throw new Error('No analysis JSON files found in report folder');
    }
    
    // Sort by filename (which includes timestamp)
    jsonFiles.sort().reverse();
    return jsonFiles[0];
}

/**
 * Parse week key format YYYY-WXX into year and week number.
 */
export function parseWeekKey(weekKey) {
    const [yearStr, weekStr] = weekKey.split('-W');
    return [parseInt(yearStr), parseInt(weekStr)];
}

/**
 * Convert week key from YYYY-WXX format to YY/XX for display.
 */
export function formatWeekForDisplay(weekKey) {
    const [yearStr, weekStr] = weekKey.split('-W');
    const shortYear = yearStr.slice(-2); // Get last 2 digits of year
    return `${shortYear}/${weekStr}`;
}

/**
 * Generate mermaid line chart showing PR trends over time.
 */
export function generateTrendChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for trend chart';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "Pull Requests total vs GitHub Copilot Assisted"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    const maxPRs = Math.max(...Object.values(weeklyData).map(data => data.totalPRs));
    chartLines.push('    y-axis "Number of PRs" 0 --> ' + (maxPRs + 5));
    
    // Total PRs line
    const totalPrs = sortedWeeks.map(week => weeklyData[week].totalPRs);
    chartLines.push('    line "Total Pull Requests" [' + totalPrs.join(', ') + ']');
    
    // Copilot PRs line
    const copilotPrs = sortedWeeks.map(week => weeklyData[week].copilotAssistedPRs);
    chartLines.push('    line "GitHub Copilot Assisted" [' + copilotPrs.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📈 **Total Pull Requests**: All PRs created during each week',
        '- 🤖 **GitHub Copilot Assisted**: PRs that included AI-generated code contributions',
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate stacked bar chart showing Copilot assistance types over time.
 */
export function generateCopilotTypesChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for Copilot types chart';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any Copilot data
    const hasCopilotData = sortedWeeks.some(week => 
        (weeklyData[week].copilotReviewPRs || 0) > 0 || 
        (weeklyData[week].copilotAgentPRs || 0) > 0
    );
    
    if (!hasCopilotData) {
        return 'No Copilot assistance data available for this period';
    }
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "GitHub Copilot Assistance Types by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(...sortedWeeks.map(week => 
        (weeklyData[week].copilotReviewPRs || 0) + (weeklyData[week].copilotAgentPRs || 0)
    ));
    chartLines.push('    y-axis "Number of PRs" 0 --> ' + (maxValue + 2));
    
    // Coding Review data
    const reviewPrs = sortedWeeks.map(week => weeklyData[week].copilotReviewPRs || 0);
    chartLines.push('    bar "Coding Review" [' + reviewPrs.join(', ') + ']');
    
    // Coding Agent data
    const agentPrs = sortedWeeks.map(week => weeklyData[week].copilotAgentPRs || 0);
    chartLines.push('    bar "Coding Agent" [' + agentPrs.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📝 **Coding Review**: PRs where Copilot was used for code review assistance',
        '- 🤖 **Coding Agent**: PRs where Copilot was used for code generation/development',
        '- **Stacked View**: Each bar shows the breakdown of Copilot assistance types per week'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate mermaid line chart showing Copilot percentage trends.
 */
export function generatePercentageChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for percentage chart';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any data
    const hasData = sortedWeeks.some(week => weeklyData[week].totalPRs > 0);
    if (!hasData) {
        return 'No PR data available for this period';
    }
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "GitHub Copilot Usage Percentage Over Time"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    chartLines.push('    y-axis "Percentage %" 0 --> 100');
    
    // Copilot percentage line
    const copilotPercentages = sortedWeeks.map(week => 
        Math.round((weeklyData[week].copilotPercentage || 0) * 100) / 100
    );
    chartLines.push('    line "Copilot Usage %" [' + copilotPercentages.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 🤖 **Copilot Usage %**: Percentage of PRs that used GitHub Copilot assistance',
        '- **Higher percentages indicate increased adoption of AI-assisted development**'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing repository activity data.
 */
export function generateRepositoryDataTable(weeklyData) {
    const lines = [];
    lines.push('| Week | Total PRs | Copilot PRs | Copilot % | Actions Runs | Actions Minutes | Unique Collaborators | Repositories |');
    lines.push('|------|-----------|-------------|-----------|--------------|-----------------|---------------------|--------------|');
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const repositories = Array.isArray(data.repositories) ? data.repositories.slice(0, 3) : [];
        const repoDisplay = repositories.length > 3 ? 
            repositories.join(', ') + ` (+${repositories.length - 3} more)` : 
            repositories.join(', ');
        
        const actionsRuns = data.actionsUsage ? data.actionsUsage.totalRuns : 0;
        const actionsMinutes = data.actionsUsage ? data.actionsUsage.totalMinutes : 0;
        
        lines.push(`| ${week} | ${formatNumberMetric(data.totalPRs)} | ${formatNumberMetric(data.copilotAssistedPRs)} | ${formatNumberMetric(data.copilotPercentage)}% | ${formatNumberMetric(actionsRuns)} | ${formatNumberMetric(actionsMinutes)} | ${formatNumberMetric(data.uniqueCollaborators)} | ${repoDisplay} |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate markdown table showing percentage data.
 */
export function generatePercentageDataTable(weeklyData) {
    const lines = [];
    lines.push('| Week | Total PRs | Copilot % | Review % | Agent % |');
    lines.push('|------|-----------|-----------|----------|---------|');
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const copilotPct = Math.round((data.copilotPercentage || 0) * 100) / 100;
        const reviewPct = Math.round((data.copilotReviewPercentage || 0) * 100) / 100;
        const agentPct = Math.round((data.copilotAgentPercentage || 0) * 100) / 100;
        
        lines.push(`| ${week} | ${data.totalPRs} | ${copilotPct}% | ${reviewPct}% | ${agentPct}% |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate markdown table showing Copilot assistance types data.
 */
export function generateCopilotTypesDataTable(weeklyData) {
    const lines = [];
    lines.push('| Week | Total PRs | Review PRs | Agent PRs | Review % | Agent % |');
    lines.push('|------|-----------|------------|-----------|----------|---------|');
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const data = weeklyData[week];
        const totalPrs = data.totalPRs;
        const reviewPrs = data.copilotReviewPRs || 0;
        const agentPrs = data.copilotAgentPRs || 0;
        const reviewPct = Math.round((data.copilotReviewPercentage || 0) * 100) / 100;
        const agentPct = Math.round((data.copilotAgentPercentage || 0) * 100) / 100;
        
        lines.push(`| ${week} | ${totalPrs} | ${reviewPrs} | ${agentPrs} | ${reviewPct}% | ${agentPct}% |`);
    }
    
    return lines.join('\n');
}

/**
 * Calculate commit count statistics per week for Copilot PRs.
 */
export function calculateCommitStatsPerWeek(weeklyData) {
    const weeklyCommitStats = {};
    
    for (const [week, data] of Object.entries(weeklyData)) {
        const copilotPRs = data.pullRequests.filter(pr => pr.copilotAssisted && pr.commitCounts);
        
        if (copilotPRs.length > 0) {
            const totalCommitCounts = copilotPRs.map(pr => pr.commitCounts.totalCommits);
            const userCommitCounts = copilotPRs.map(pr => pr.commitCounts.userCommits);
            const copilotCommitCounts = copilotPRs.map(pr => pr.commitCounts.copilotCommits);
            
            weeklyCommitStats[week] = {
                prCount: copilotPRs.length,
                totalCommits: {
                    min: Math.min(...totalCommitCounts),
                    max: Math.max(...totalCommitCounts),
                    avg: Math.round(totalCommitCounts.reduce((a, b) => a + b, 0) / totalCommitCounts.length * 10) / 10
                },
                userCommits: {
                    min: Math.min(...userCommitCounts),
                    max: Math.max(...userCommitCounts),
                    avg: Math.round(userCommitCounts.reduce((a, b) => a + b, 0) / userCommitCounts.length * 10) / 10
                },
                copilotCommits: {
                    min: Math.min(...copilotCommitCounts),
                    max: Math.max(...copilotCommitCounts),
                    avg: Math.round(copilotCommitCounts.reduce((a, b) => a + b, 0) / copilotCommitCounts.length * 10) / 10
                }
            };
        }
    }
    
    return weeklyCommitStats;
}

/**
 * Generate mermaid chart showing commit count statistics for Copilot PRs.
 */
export function generateCommitStatsChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for commit statistics chart';
    }
    
    const commitStats = calculateCommitStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(commitStats);
    
    if (statsWeeks.length === 0) {
        return 'No Copilot PR commit data available for this period';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "Copilot PR Commit Count Statistics by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(...sortedWeeks.map(week => commitStats[week].totalCommits.max));
    chartLines.push('    y-axis "Number of Commits" 0 --> ' + (maxValue + 2));
    
    // Min commits line
    const minCommits = sortedWeeks.map(week => commitStats[week].totalCommits.min);
    chartLines.push('    line "Min Commits" [' + minCommits.join(', ') + ']');
    
    // Average commits line
    const avgCommits = sortedWeeks.map(week => commitStats[week].totalCommits.avg);
    chartLines.push('    line "Avg Commits" [' + avgCommits.join(', ') + ']');
    
    // Max commits line
    const maxCommits = sortedWeeks.map(week => commitStats[week].totalCommits.max);
    chartLines.push('    line "Max Commits" [' + maxCommits.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📉 **Min Commits**: Minimum commits per PR in Copilot PRs for each week',
        '- 📊 **Avg Commits**: Average commits per PR in Copilot PRs for each week', 
        '- 📈 **Max Commits**: Maximum commits per PR in Copilot PRs for each week',
        '- **Higher averages may indicate more complex AI-assisted development**'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing commit statistics data.
 */
export function generateCommitStatsDataTable(weeklyData) {
    const commitStats = calculateCommitStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(commitStats);
    
    if (statsWeeks.length === 0) {
        return 'No Copilot PR commit data available for table';
    }
    
    const lines = [];
    lines.push('| Week | PRs | Min Commits | Avg Commits | Max Commits | Min User | Avg User | Max User | Min Copilot | Avg Copilot | Max Copilot |');
    lines.push('|------|-----|-------------|-------------|-------------|----------|----------|----------|-------------|-------------|-------------|');
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const stats = commitStats[week];
        lines.push(`| ${week} | ${stats.prCount} | ${stats.totalCommits.min} | ${stats.totalCommits.avg} | ${stats.totalCommits.max} | ${stats.userCommits.min} | ${stats.userCommits.avg} | ${stats.userCommits.max} | ${stats.copilotCommits.min} | ${stats.copilotCommits.avg} | ${stats.copilotCommits.max} |`);
    }
    
    return lines.join('\n');
}

/**
 * Calculate line changes statistics per week for all PRs.
 */
export function calculateLineChangesStatsPerWeek(weeklyData) {
    const weeklyLineStats = {};
    
    for (const [week, data] of Object.entries(weeklyData)) {
        const prsWithLineChanges = data.pullRequests.filter(pr => pr.lineChanges);
        
        if (prsWithLineChanges.length > 0) {
            const additions = prsWithLineChanges.map(pr => pr.lineChanges.additions);
            const deletions = prsWithLineChanges.map(pr => pr.lineChanges.deletions);
            const changes = prsWithLineChanges.map(pr => pr.lineChanges.changes);
            const filesChanged = prsWithLineChanges.map(pr => pr.lineChanges.filesChanged);
            
            weeklyLineStats[week] = {
                prCount: prsWithLineChanges.length,
                additions: {
                    min: Math.min(...additions),
                    max: Math.max(...additions),
                    avg: Math.round(additions.reduce((a, b) => a + b, 0) / additions.length * 10) / 10
                },
                deletions: {
                    min: Math.min(...deletions),
                    max: Math.max(...deletions),
                    avg: Math.round(deletions.reduce((a, b) => a + b, 0) / deletions.length * 10) / 10
                },
                changes: {
                    min: Math.min(...changes),
                    max: Math.max(...changes),
                    avg: Math.round(changes.reduce((a, b) => a + b, 0) / changes.length * 10) / 10
                },
                filesChanged: {
                    min: Math.min(...filesChanged),
                    max: Math.max(...filesChanged),
                    avg: Math.round(filesChanged.reduce((a, b) => a + b, 0) / filesChanged.length * 10) / 10
                }
            };
        }
    }
    
    return weeklyLineStats;
}

/**
 * Generate mermaid chart showing lines of code statistics for PRs.
 */
export function generateLineChangesChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for line changes chart';
    }
    
    const lineStats = calculateLineChangesStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(lineStats);
    
    if (statsWeeks.length === 0) {
        return 'No PR line changes data available for this period';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "Lines of Code Changed per PR by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(...sortedWeeks.map(week => lineStats[week].changes.max));
    chartLines.push('    y-axis "Lines of Code" 0 --> ' + (maxValue + 50));
    
    // Min changes line
    const minChanges = sortedWeeks.map(week => lineStats[week].changes.min);
    chartLines.push('    line "Min Lines Changed" [' + minChanges.join(', ') + ']');
    
    // Average changes line
    const avgChanges = sortedWeeks.map(week => lineStats[week].changes.avg);
    chartLines.push('    line "Avg Lines Changed" [' + avgChanges.join(', ') + ']');
    
    // Max changes line
    const maxChanges = sortedWeeks.map(week => lineStats[week].changes.max);
    chartLines.push('    line "Max Lines Changed" [' + maxChanges.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📉 **Min Lines Changed**: Minimum lines of code changed per PR for each week',
        '- 📊 **Avg Lines Changed**: Average lines of code changed per PR for each week',
        '- 📈 **Max Lines Changed**: Maximum lines of code changed per PR for each week',
        '- **Higher averages may indicate more significant code changes per PR**'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing line changes statistics data.
 */
export function generateLineChangesDataTable(weeklyData) {
    const lineStats = calculateLineChangesStatsPerWeek(weeklyData);
    const statsWeeks = Object.keys(lineStats);
    
    if (statsWeeks.length === 0) {
        return 'No PR line changes data available for table';
    }
    
    const lines = [];
    lines.push('| Week | PRs | Min Changes | Avg Changes | Max Changes | Min Additions | Avg Additions | Max Additions | Min Deletions | Avg Deletions | Max Deletions |');
    lines.push('|------|-----|-------------|-------------|-------------|---------------|---------------|---------------|---------------|---------------|---------------|');
    
    // Sort weeks chronologically
    const sortedWeeks = statsWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const stats = lineStats[week];
        lines.push(`| ${week} | ${formatNumberMetric(stats.prCount)} | ${formatNumberMetric(stats.changes.min)} | ${formatNumberMetric(stats.changes.avg)} | ${formatNumberMetric(stats.changes.max)} | ${formatNumberMetric(stats.additions.min)} | ${formatNumberMetric(stats.additions.avg)} | ${formatNumberMetric(stats.additions.max)} | ${formatNumberMetric(stats.deletions.min)} | ${formatNumberMetric(stats.deletions.avg)} | ${formatNumberMetric(stats.deletions.max)} |`);
    }
    
    return lines.join('\n');
}

/**
 * Calculate weekly line totals across all PRs.
 */
export function calculateWeeklyLineTotals(weeklyData) {
    const weeklyTotals = {};
    
    for (const [week, data] of Object.entries(weeklyData)) {
        const prsWithLineChanges = data.pullRequests.filter(pr => pr.lineChanges);
        
        if (prsWithLineChanges.length > 0) {
            const totalAdditions = prsWithLineChanges.reduce((sum, pr) => sum + (pr.lineChanges.additions || 0), 0);
            const totalDeletions = prsWithLineChanges.reduce((sum, pr) => sum + (pr.lineChanges.deletions || 0), 0);
            const totalChanges = prsWithLineChanges.reduce((sum, pr) => sum + (pr.lineChanges.changes || 0), 0);
            const totalFilesChanged = prsWithLineChanges.reduce((sum, pr) => sum + (pr.lineChanges.filesChanged || 0), 0);
            
            weeklyTotals[week] = {
                prCount: prsWithLineChanges.length,
                totalAdditions,
                totalDeletions,
                totalChanges,
                totalFilesChanged
            };
        }
    }
    
    return weeklyTotals;
}

/**
 * Calculate overall line totals for both all PRs and Copilot-assisted PRs.
 */
export function calculateOverallLineTotals(weeklyData) {
    let allPRs = {
        totalAdditions: 0,
        totalDeletions: 0,
        totalChanges: 0,
        totalFilesChanged: 0
    };
    
    let copilotPRs = {
        totalAdditions: 0,
        totalDeletions: 0,
        totalChanges: 0,
        totalFilesChanged: 0
    };
    
    for (const [week, data] of Object.entries(weeklyData)) {
        const prsWithLineChanges = data.pullRequests.filter(pr => pr.lineChanges);
        const copilotPRsWithLineChanges = data.pullRequests.filter(pr => pr.lineChanges && pr.copilotAssisted);
        
        // Calculate totals for all PRs
        for (const pr of prsWithLineChanges) {
            allPRs.totalAdditions += pr.lineChanges.additions || 0;
            allPRs.totalDeletions += pr.lineChanges.deletions || 0;
            allPRs.totalChanges += pr.lineChanges.changes || 0;
            allPRs.totalFilesChanged += pr.lineChanges.filesChanged || 0;
        }
        
        // Calculate totals for Copilot-assisted PRs
        for (const pr of copilotPRsWithLineChanges) {
            copilotPRs.totalAdditions += pr.lineChanges.additions || 0;
            copilotPRs.totalDeletions += pr.lineChanges.deletions || 0;
            copilotPRs.totalChanges += pr.lineChanges.changes || 0;
            copilotPRs.totalFilesChanged += pr.lineChanges.filesChanged || 0;
        }
    }
    
    return { allPRs, copilotPRs };
}

/**
 * Generate mermaid chart showing total lines of code added/deleted per week.
 */
export function generateWeeklyLineTotalsChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for weekly line totals chart';
    }
    
    const lineTotals = calculateWeeklyLineTotals(weeklyData);
    const totalWeeks = Object.keys(lineTotals);
    
    if (totalWeeks.length === 0) {
        return 'No PR line changes data available for this period';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = totalWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "Total Lines of Code Added/Deleted per Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxValue = Math.max(
        ...sortedWeeks.map(week => lineTotals[week].totalAdditions),
        ...sortedWeeks.map(week => lineTotals[week].totalDeletions)
    );
    chartLines.push('    y-axis "Lines of Code" 0 --> ' + (maxValue + 100));
    
    // Total additions line
    const totalAdditions = sortedWeeks.map(week => lineTotals[week].totalAdditions);
    chartLines.push('    line "Total Lines Added" [' + totalAdditions.join(', ') + ']');
    
    // Total deletions line
    const totalDeletions = sortedWeeks.map(week => lineTotals[week].totalDeletions);
    chartLines.push('    line "Total Lines Deleted" [' + totalDeletions.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📈 **Total Lines Added**: Total lines of code added across all PRs for each week',
        '- 📉 **Total Lines Deleted**: Total lines of code deleted across all PRs for each week',
        '- **Higher values indicate more significant development activity**'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing weekly line totals data.
 */
export function generateWeeklyLineTotalsDataTable(weeklyData) {
    const lineTotals = calculateWeeklyLineTotals(weeklyData);
    const totalWeeks = Object.keys(lineTotals);
    
    if (totalWeeks.length === 0) {
        return 'No PR line changes data available for table';
    }
    
    const lines = [];
    lines.push('| Week | PRs | Total Lines Added | Total Lines Deleted | Total Lines Changed | Total Files Changed |');
    lines.push('|------|-----|-------------------|---------------------|---------------------|---------------------|');
    
    // Sort weeks chronologically
    const sortedWeeks = totalWeeks.sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    for (const week of sortedWeeks) {
        const totals = lineTotals[week];
        lines.push(`| ${week} | ${formatNumberMetric(totals.prCount)} | ${formatNumberMetric(totals.totalAdditions)} | ${formatNumberMetric(totals.totalDeletions)} | ${formatNumberMetric(totals.totalChanges)} | ${formatNumberMetric(totals.totalFilesChanged)} |`);
    }
    
    return lines.join('\n');
}

/**
 * Generate mermaid chart showing Copilot Actions minutes over time.
 */
export function generateActionsMinutesChart(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for Actions minutes chart';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any Actions data
    const hasActionsData = sortedWeeks.some(week => 
        weeklyData[week].actionsUsage && weeklyData[week].actionsUsage.totalMinutes > 0
    );
    
    if (!hasActionsData) {
        return 'No Copilot Actions data available for this period';
    }
    
    // Generate chart data
    const chartLines = [];
    chartLines.push('```mermaid');
    chartLines.push('xychart-beta');
    chartLines.push('    title "Copilot Actions Minutes Used by Week"');
    chartLines.push('    x-axis [' + sortedWeeks.map(week => `"${formatWeekForDisplay(week)}"`).join(', ') + ']');
    
    // Calculate max value for y-axis
    const maxMinutes = Math.max(...sortedWeeks.map(week => 
        weeklyData[week].actionsUsage ? weeklyData[week].actionsUsage.totalMinutes : 0
    ));
    chartLines.push('    y-axis "Minutes" 0 --> ' + (maxMinutes + Math.ceil(maxMinutes * 0.1)));
    
    // Actions minutes bar
    const actionsMinutes = sortedWeeks.map(week => 
        weeklyData[week].actionsUsage ? weeklyData[week].actionsUsage.totalMinutes : 0
    );
    chartLines.push('    bar "Actions Minutes" [' + actionsMinutes.join(', ') + ']');
    
    // Actions runs line
    const actionsRuns = sortedWeeks.map(week => 
        weeklyData[week].actionsUsage ? weeklyData[week].actionsUsage.totalRuns : 0
    );
    chartLines.push('    line "Actions Runs" [' + actionsRuns.join(', ') + ']');
    
    chartLines.push('```');
    
    // Add legend explanation
    const legendExplanation = [
        '',
        '**Legend:**',
        '- 📊 **Actions Minutes**: Total minutes used by Copilot-triggered workflow runs per week',
        '- 📈 **Actions Runs**: Number of Copilot-triggered workflow runs per week',
        '- **Higher values indicate more CI/CD activity from Copilot-assisted development**'
    ];
    
    return chartLines.concat(legendExplanation).join('\n');
}

/**
 * Generate markdown table showing Copilot Actions minutes data.
 */
export function generateActionsMinutesDataTable(weeklyData) {
    if (!weeklyData || Object.keys(weeklyData).length === 0) {
        return 'No data available for Actions minutes table';
    }
    
    // Sort weeks chronologically
    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
        const [yearA, weekA] = parseWeekKey(a);
        const [yearB, weekB] = parseWeekKey(b);
        return yearA !== yearB ? yearA - yearB : weekA - weekB;
    });
    
    // Check if there's any Actions data
    const hasActionsData = sortedWeeks.some(week => 
        weeklyData[week].actionsUsage && weeklyData[week].actionsUsage.totalMinutes > 0
    );
    
    if (!hasActionsData) {
        return 'No Copilot Actions data available for table';
    }
    
    const lines = [];
    lines.push('| Week | Actions Runs | Actions Minutes | Avg Minutes/Run |');
    lines.push('|------|--------------|-----------------|-----------------|');
    
    let totalRuns = 0;
    let totalMinutes = 0;
    
    for (const week of sortedWeeks) {
        const actionsUsage = weeklyData[week].actionsUsage;
        const runs = actionsUsage ? actionsUsage.totalRuns : 0;
        const minutes = actionsUsage ? actionsUsage.totalMinutes : 0;
        const avgMinutes = runs > 0 ? Math.round(minutes / runs * 10) / 10 : 0;
        
        totalRuns += runs;
        totalMinutes += minutes;
        
        lines.push(`| ${week} | ${formatNumberMetric(runs)} | ${formatNumberMetric(minutes)} | ${formatNumberMetric(avgMinutes)} |`);
    }
    
    // Add totals row
    const totalAvg = totalRuns > 0 ? Math.round(totalMinutes / totalRuns * 10) / 10 : 0;
    lines.push(`| **Total** | **${formatNumberMetric(totalRuns)}** | **${formatNumberMetric(totalMinutes)}** | **${formatNumberMetric(totalAvg)}** |`);
    
    return lines.join('\n');
}

/**
 * Generate summary statistics in markdown format.
 */
export function generateSummaryStats(results) {
    const lines = [];
    lines.push('### 📊 Analysis Summary');
    lines.push('');
    lines.push(`- **Analysis Period**: ${new Date(results.periodStart).toLocaleDateString()} to ${new Date(results.periodEnd).toLocaleDateString()}`);
    lines.push(`- **Analyzed User**: ${maskPrivateInfoForDisplay(results.analyzedUser)}`);
    lines.push(`- **Analyzed Repository**: ${maskPrivateInfoForDisplay(results.analyzedRepository)}`);
    lines.push(`- **Total Repositories**: ${formatNumberMetric(results.totalRepositories)}`);
    lines.push(`- **Total PRs**: ${formatNumberMetric(results.totalPRs)}`);
    lines.push(`- **Copilot-Assisted PRs**: ${formatNumberMetric(results.totalCopilotPRs)}`);
    
    if (results.totalPRs > 0) {
        const overallCopilotPercentage = Math.round(results.totalCopilotPRs / results.totalPRs * 100 * 100) / 100;
        lines.push(`- **Overall Copilot Usage**: ${formatNumberMetric(overallCopilotPercentage)}%`);
    }
    
    if (results.totalCopilotReviewPRs !== undefined) {
        lines.push(`- **Copilot Review PRs**: ${formatNumberMetric(results.totalCopilotReviewPRs)}`);
    }
    
    if (results.totalCopilotAgentPRs !== undefined) {
        lines.push(`- **Copilot Agent PRs**: ${formatNumberMetric(results.totalCopilotAgentPRs)}`);
    }
    
    if (results.totalActionsRuns !== undefined) {
        lines.push(`- **Copilot-triggered Actions runs**: ${formatNumberMetric(results.totalActionsRuns)}`);
    }
    
    if (results.totalActionsMinutes !== undefined) {
        lines.push(`- **Copilot Actions minutes used**: ${formatNumberMetric(results.totalActionsMinutes)}`);
    }
    
    // Calculate total lines of code added/deleted across all weeks
    if (results.weeklyAnalysis && Object.keys(results.weeklyAnalysis).length > 0) {
        const overallTotals = calculateOverallLineTotals(results.weeklyAnalysis);
        
        if (overallTotals.allPRs.totalAdditions > 0 || overallTotals.allPRs.totalDeletions > 0) {
            lines.push('');
            lines.push('**📝 Lines of Code Metrics:**');
            lines.push('');
            lines.push('| Metric | All PRs | Copilot-Assisted PRs | Percentage |');
            lines.push('|--------|---------|---------------------|------------|');
            
            // Calculate and format percentages
            const additionsPercentage = overallTotals.allPRs.totalAdditions > 0 
                ? Math.round(overallTotals.copilotPRs.totalAdditions / overallTotals.allPRs.totalAdditions * 100 * 100) / 100
                : 0;
            const deletionsPercentage = overallTotals.allPRs.totalDeletions > 0 
                ? Math.round(overallTotals.copilotPRs.totalDeletions / overallTotals.allPRs.totalDeletions * 100 * 100) / 100
                : 0;
            const changesPercentage = overallTotals.allPRs.totalChanges > 0 
                ? Math.round(overallTotals.copilotPRs.totalChanges / overallTotals.allPRs.totalChanges * 100 * 100) / 100
                : 0;
            const filesPercentage = overallTotals.allPRs.totalFilesChanged > 0 
                ? Math.round(overallTotals.copilotPRs.totalFilesChanged / overallTotals.allPRs.totalFilesChanged * 100 * 100) / 100
                : 0;
            
            lines.push(`| **Total Lines Added** | ${formatNumberMetric(overallTotals.allPRs.totalAdditions)} | ${formatNumberMetric(overallTotals.copilotPRs.totalAdditions)} | ${additionsPercentage}% |`);
            lines.push(`| **Total Lines Deleted** | ${formatNumberMetric(overallTotals.allPRs.totalDeletions)} | ${formatNumberMetric(overallTotals.copilotPRs.totalDeletions)} | ${deletionsPercentage}% |`);
            lines.push(`| **Total Lines Changed** | ${formatNumberMetric(overallTotals.allPRs.totalChanges)} | ${formatNumberMetric(overallTotals.copilotPRs.totalChanges)} | ${changesPercentage}% |`);
            lines.push(`| **Total Files Changed** | ${formatNumberMetric(overallTotals.allPRs.totalFilesChanged)} | ${formatNumberMetric(overallTotals.copilotPRs.totalFilesChanged)} | ${filesPercentage}% |`);
        }
    }
    
    return lines.join('\n');
}

/**
 * Write content to GitHub step summary.
 */
export async function writeToStepSummary(content) {
    const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummaryFile) {
        try {
            await fs.appendFile(stepSummaryFile, content + '\n');
        } catch (error) {
            console.error(`Failed to write to step summary: ${error.message}`);
        }
    } else {
        // If not in GitHub Actions, write to console
        console.log(content);
    }
}

/**
 * Main function to generate and display mermaid charts.
 */
export async function generateMermaidCharts() {
    try {
        // Find and load the latest analysis file
        const analysisFile = await findLatestAnalysisFile();
        console.log(`Using analysis file: ${analysisFile}`);
        
        const fileContent = await fs.readFile(analysisFile, 'utf8');
        const results = JSON.parse(fileContent);
        
        const weeklyData = results.weeklyAnalysis;
        const analyzedUser = results.analyzedUser || 'unknown';
        
        if (!weeklyData || Object.keys(weeklyData).length === 0) {
            await writeToStepSummary('## ⚠️ No Data Available');
            await writeToStepSummary('No pull request data found for the analysis period.');
            return;
        }
        
        // Generate summary statistics
        const summaryStats = generateSummaryStats(results);
        await writeToStepSummary(summaryStats);
        await writeToStepSummary('');
        
        // Generate trend chart
        const trendChart = generateTrendChart(weeklyData);
        await writeToStepSummary('## 📈 Pull Request Trends');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays both total PR volume and Copilot-assisted PRs over time.*');
        await writeToStepSummary(trendChart);
        
        // Generate trend data table
        const trendTable = generateRepositoryDataTable(weeklyData);
        await writeToStepSummary('<details>');
        await writeToStepSummary('<summary>📊 Weekly PR Data</summary>');
        await writeToStepSummary('');
        await writeToStepSummary(trendTable);
        await writeToStepSummary('');
        await writeToStepSummary('</details>');
        
        // Generate percentage chart
        const percentageChart = generatePercentageChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## 🤖 GitHub Copilot Usage Trends');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays the adoption rate as percentage of total PRs over time.*');
        await writeToStepSummary(percentageChart);
        
        // Generate percentage data table
        const percentageTable = generatePercentageDataTable(weeklyData);
        await writeToStepSummary('<details>');
        await writeToStepSummary('<summary>📊 Copilot Usage Percentage Data</summary>');
        await writeToStepSummary('');
        await writeToStepSummary(percentageTable);
        await writeToStepSummary('');
        await writeToStepSummary('</details>');
        
        // Generate Copilot assistance types chart
        const copilotTypesChart = generateCopilotTypesChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## 🤖📝 GitHub Copilot Assistance Types');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart breaks down Copilot usage by assistance type: coding review vs. coding agent.*');
        await writeToStepSummary(copilotTypesChart);
        
        // Generate Copilot types data table
        const copilotTypesTable = generateCopilotTypesDataTable(weeklyData);
        await writeToStepSummary('<details>');
        await writeToStepSummary('<summary>📊 Copilot Assistance Types Data</summary>');
        await writeToStepSummary('');
        await writeToStepSummary(copilotTypesTable);
        await writeToStepSummary('');
        await writeToStepSummary('</details>');
        
        // Generate commit statistics chart and table
        const commitStatsChart = generateCommitStatsChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## 📊 Copilot PR Commit Count Statistics');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays min/average/max commit counts per Copilot PR for each week.*');
        await writeToStepSummary(commitStatsChart);
        
        // Generate commit statistics data table
        const commitStatsTable = generateCommitStatsDataTable(weeklyData);
        if (commitStatsTable !== 'No Copilot PR commit data available for table') {
            await writeToStepSummary('<details>');
            await writeToStepSummary('<summary>📊 Commit Count Statistics Data</summary>');
            await writeToStepSummary('');
            await writeToStepSummary(commitStatsTable);
            await writeToStepSummary('');
            await writeToStepSummary('</details>');
        }
        
        // Generate line changes statistics chart and table
        const lineChangesChart = generateLineChangesChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## 📈 Lines of Code Changed per PR');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays min/average/max lines of code changed per PR for each week.*');
        await writeToStepSummary(lineChangesChart);
        
        // Generate line changes statistics data table
        const lineChangesTable = generateLineChangesDataTable(weeklyData);
        if (lineChangesTable !== 'No PR line changes data available for table') {
            await writeToStepSummary('<details>');
            await writeToStepSummary('<summary>📊 Lines of Code Statistics Data</summary>');
            await writeToStepSummary('');
            await writeToStepSummary(lineChangesTable);
            await writeToStepSummary('');
            await writeToStepSummary('</details>');
        }
        
        // Generate weekly line totals chart and table
        const weeklyLineTotalsChart = generateWeeklyLineTotalsChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## 📊 Total Lines of Code Added/Deleted per Week');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays total lines of code added and deleted across all PRs for each week.*');
        await writeToStepSummary(weeklyLineTotalsChart);
        
        // Generate weekly line totals statistics data table
        const weeklyLineTotalsTable = generateWeeklyLineTotalsDataTable(weeklyData);
        if (weeklyLineTotalsTable !== 'No PR line changes data available for table') {
            await writeToStepSummary('<details>');
            await writeToStepSummary('<summary>📊 Weekly Line Totals Data</summary>');
            await writeToStepSummary('');
            await writeToStepSummary(weeklyLineTotalsTable);
            await writeToStepSummary('');
            await writeToStepSummary('</details>');
        }
        
        // Generate Actions minutes chart and table
        const actionsMinutesChart = generateActionsMinutesChart(weeklyData);
        await writeToStepSummary('');
        await writeToStepSummary('## ⏱️ Copilot Actions Minutes Usage');
        await writeToStepSummary('');
        await writeToStepSummary('*This chart displays Copilot-triggered GitHub Actions workflow minutes by week.*');
        await writeToStepSummary(actionsMinutesChart);
        
        // Generate Actions minutes data table
        const actionsMinutesTable = generateActionsMinutesDataTable(weeklyData);
        if (actionsMinutesTable !== 'No Copilot Actions data available for table') {
            await writeToStepSummary('<details>');
            await writeToStepSummary('<summary>📊 Actions Minutes Data</summary>');
            await writeToStepSummary('');
            await writeToStepSummary(actionsMinutesTable);
            await writeToStepSummary('');
            await writeToStepSummary('</details>');
        }
        
        console.log('Mermaid charts generated successfully!');
        
    } catch (error) {
        console.error(`Error generating mermaid charts: ${error.message}`);
        await writeToStepSummary('');
        await writeToStepSummary('## ❌ Error');
        await writeToStepSummary(`Failed to generate charts: ${error.message}`);
        process.exit(1);
    }
}