#!/usr/bin/env node

import { Command } from 'commander';
import { GitHubPRAnalyzer } from './pr-analyzer.js';
import { generateMermaidCharts } from './mermaid-generator.js';

const program = new Command();

/**
 * Print rate limit information.
 */
async function printRateLimitInfo(analyzer) {
    try {
        const rateLimitInfo = await analyzer.getRateLimitInfo();
        console.log('\n=== RATE LIMIT INFO ===');
        console.log(`Remaining requests: [${rateLimitInfo.remaining}]`);
        console.log(`Total limit: [${rateLimitInfo.limit}]`);
        console.log(`Reset time: [${rateLimitInfo.resetDatetime}]`);
        console.log(`Time until reset: [${rateLimitInfo.timeUntilResetMinutes}m ${rateLimitInfo.timeUntilResetSeconds}s]`);
    } catch (error) {
        console.error(`Failed to get rate limit info: ${error.message}`);
    }
}

/**
 * Run PR analysis.
 */
async function runAnalysis(options) {
    const startTime = new Date();

    // Get environment variables
    const githubToken = process.env.GH_PAT || process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_REPOSITORY_OWNER || 'rajbos';
    let repo = process.env.GITHUB_REPOSITORY_NAME;
    const outputFormat = process.env.OUTPUT_FORMAT || 'json';
    const analyzeAll = (process.env.ANALYZE_ALL_REPOS || 'true').toLowerCase() === 'true';
    const cleanCache = (process.env.CLEAN_CACHE || 'false').toLowerCase() === 'true';
    
    if (!githubToken) {
        console.error('Error: GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }
    
    // If running in GitHub Actions, extract owner/repo from GITHUB_REPOSITORY
    if (process.env.GITHUB_REPOSITORY) {
        const fullRepo = process.env.GITHUB_REPOSITORY;
        const [ghOwner, currentRepo] = fullRepo.split('/');
        const finalOwner = ghOwner || owner;
        if (!analyzeAll) {
            repo = currentRepo;
        }
        
        console.log(`Using owner: [${finalOwner}], repo: [${repo || 'all'}]`);
    }
    
    if (analyzeAll) {
        console.log(`Analyzing all repositories for user: [${owner}]`);
        repo = null; // Set to null to analyze all repos
    } else if (repo) {
        console.log(`Analyzing single repository: [${owner}/${repo}]`);
    } else {
        console.error('Error: No repository specified and ANALYZE_ALL_REPOS is not true');
        process.exit(1);
    }
    
    if (cleanCache) {
        console.log('Cache cleaning mode enabled - starting with fresh cache');
    }
    
    try {
        const analyzer = new GitHubPRAnalyzer(githubToken, owner, repo);
        
        // Print rate limit info before starting
        await printRateLimitInfo(analyzer);
        
        // Print cache info
        const cacheInfo = analyzer.getCacheInfo();
        console.log('\n=== CACHE INFO ===');
        console.log(`Cache enabled: [${cacheInfo.cacheEnabled}]`);
        console.log(`Cache size: [${cacheInfo.cacheSize}]`);
        console.log(`Cache location: [${cacheInfo.cacheLocation}]`);
        
        const results = await analyzer.analyzePullRequests();
        
        // Save results
        const filename = await analyzer.saveResults(results, outputFormat);
        console.log(`Analysis complete! Results saved to: [${filename}]`);
        
        // Print summary
        console.log('\n=== SUMMARY ===');
        console.log(`Total repositories analyzed: [${results.totalRepositories}]`);
        console.log(`Total PRs analyzed: [${results.totalPRs}]`);
        console.log(`Copilot-assisted PRs: [${results.totalCopilotPRs}]`);
        console.log(`Copilot-triggered Actions runs: [${results.totalActionsRuns}]`);
        console.log(`Copilot Actions minutes used: [${results.totalActionsMinutes}]`);
        if (results.totalPRs > 0) {
            const overallCopilotPercentage = Math.round(results.totalCopilotPRs / results.totalPRs * 100 * 100) / 100;
            console.log(`Overall Copilot Usage on PRs: [${overallCopilotPercentage}]%`);
        }
        
        console.log('\n=== WEEKLY BREAKDOWN ===');
        const sortedWeeks = Object.keys(results.weeklyAnalysis).sort();
        for (const week of sortedWeeks) {
            const data = results.weeklyAnalysis[week];
            console.log(`Week ${week}: ${data.totalPRs} PRs (${data.copilotAssistedPRs} Copilot-assisted, ${data.copilotPercentage}%)`);
            if (data.copilotReviewPRs !== undefined && data.copilotAgentPRs !== undefined) {
                console.log(`  - Review: ${data.copilotReviewPRs} PRs (${data.copilotReviewPercentage}%)`);
                console.log(`  - Agent: ${data.copilotAgentPRs} PRs (${data.copilotAgentPercentage}%)`);
            }
            console.log(`  - Collaborators: ${data.uniqueCollaborators} (${data.collaborators.join(', ')})`);
            if (data.actionsUsage && data.actionsUsage.totalRuns > 0) {
                console.log(`  - Actions: ${data.actionsUsage.totalRuns} runs (${data.actionsUsage.totalMinutes} minutes)`);
            }
        }
        
        // Print commit count summary for Copilot PRs
        console.log('\n=== COPILOT PR COMMIT COUNTS ===');
        let totalCopilotPRsWithCommits = 0;
        let totalUserCommits = 0;
        let totalCopilotCommits = 0;
        let totalCommitsInCopilotPRs = 0;
        
        for (const week of sortedWeeks) {
            const data = results.weeklyAnalysis[week];
            const copilotPRs = data.pullRequests.filter(pr => pr.copilotAssisted && pr.commitCounts);
            
            if (copilotPRs.length > 0) {
                console.log(`\nWeek ${week} - Copilot PRs with commit details:`);
                for (const pr of copilotPRs) {
                    const { totalCommits, userCommits, copilotCommits } = pr.commitCounts;
                    console.log(`  PR #${pr.number}: ${totalCommits} total commits (${userCommits} by user, ${copilotCommits} by/with Copilot)`);
                    
                    totalCopilotPRsWithCommits++;
                    totalUserCommits += userCommits;
                    totalCopilotCommits += copilotCommits;
                    totalCommitsInCopilotPRs += totalCommits;
                }
            }
        }
        
        if (totalCopilotPRsWithCommits > 0) {
            console.log('\nOverall Copilot PR Commit Summary:');
            console.log(`- Copilot PRs analyzed: [${totalCopilotPRsWithCommits}]`);
            console.log(`- Total commits in Copilot PRs: [${totalCommitsInCopilotPRs}]`);
            console.log(`- User commits: [${totalUserCommits}] (${Math.round(totalUserCommits / totalCommitsInCopilotPRs * 100)}%)`);
            console.log(`- Copilot commits: [${totalCopilotCommits}] (${Math.round(totalCopilotCommits / totalCommitsInCopilotPRs * 100)}%)`);
        } else {
            console.log('No Copilot PRs found with commit data in the analysis period.');
        }
        
        // Print rate limit info after completion
        await printRateLimitInfo(analyzer);
        
        // Calculate and log run duration
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        const minutes = Math.floor(duration / 60);
        const seconds = Math.round(duration % 60);
        console.log(`\n=== RUN DURATION ===`);
        console.log(`Total run time: [${minutes}m ${seconds}s]`);

    } catch (error) {
        console.error(`Error during analysis: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Run mermaid chart generation.
 */
async function runChartGeneration(options) {
    try {
        await generateMermaidCharts();
    } catch (error) {
        console.error(`Error generating charts: ${error.message}`);
        process.exit(1);
    }
}

// Configure CLI
program
    .name('pr-analysis-tool')
    .description('GitHub Pull Request Analysis Tool for Copilot Usage Tracking')
    .version('1.0.0');

program
    .command('analyze')
    .description('Analyze pull requests for Copilot usage')
    .option('--format <format>', 'Output format (json or csv)', 'json')
    .option('--all-repos', 'Analyze all repositories for the user')
    .option('--repo <repo>', 'Specific repository to analyze')
    .option('--clean-cache', 'Start with fresh cache')
    .action(runAnalysis);

program
    .command('charts')
    .description('Generate mermaid charts from analysis results')
    .action(runChartGeneration);

// Default behavior based on mode parameter
program
    .option('--mode <mode>', 'Execution mode: analyze or charts')
    .action((options) => {
        if (options.mode === 'analyze') {
            runAnalysis(options);
        } else if (options.mode === 'charts') {
            runChartGeneration(options);
        } else {
            console.error('Error: Please specify --mode=analyze or --mode=charts, or use specific commands');
            console.log('\nAvailable commands:');
            console.log('  analyze  - Analyze pull requests for Copilot usage');
            console.log('  charts   - Generate mermaid charts from analysis results');
            console.log('\nExamples:');
            console.log('  npm run analyze');
            console.log('  npm run charts');
            console.log('  node src/index.js --mode=analyze');
            console.log('  node src/index.js --mode=charts');
            process.exit(1);
        }
    });

// Parse command line arguments
program.parse();