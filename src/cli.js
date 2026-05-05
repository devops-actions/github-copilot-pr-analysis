#!/usr/bin/env node

import { Command } from 'commander';
import { GitHubPRAnalyzer } from './pr-analyzer.js';

// Redirect console.log to stderr so stdout carries only JSON output
const originalLog = console.log;
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');

const program = new Command();

program
    .name('copilot-pr-analysis')
    .description('Analyze GitHub PRs for Copilot usage and output raw JSON')
    .version('1.0.0')
    .argument('<org>', 'GitHub organization or user name to analyze')
    .option('-t, --token <token>', 'GitHub personal access token (defaults to GH_PAT or GITHUB_TOKEN env var)')
    .option('-r, --repo <repo>', 'Analyze a single repository instead of all repos')
    .option('--type <type>', 'Account type: "org" or "user"', 'org')
    .action(async (org, options) => {
        const token = options.token || process.env.GH_PAT || process.env.GITHUB_TOKEN;

        if (!token) {
            process.stderr.write('Error: GitHub token is required. Provide --token or set GH_PAT / GITHUB_TOKEN.\n');
            process.exit(1);
        }

        const isOrg = options.type !== 'user';
        const analyzer = new GitHubPRAnalyzer(token, org, options.repo || null, isOrg);

        try {
            const results = await analyzer.analyzePullRequests();
            // Write clean JSON to stdout
            process.stdout.write(JSON.stringify(results, null, 2) + '\n');
        } catch (error) {
            process.stderr.write(`Error: ${error.message}\n`);
            process.exit(1);
        }
    });

program.parse();
