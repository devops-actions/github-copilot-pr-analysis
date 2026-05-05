import axios from 'axios';
import NodeCache from 'node-cache';
import fs from 'fs/promises';
import path from 'path';
import createCsvWriter from 'csv-writer';
import { REPORT_FOLDER } from './constants.js';

/**
 * Check if the script is running in a CI environment (GitHub Actions).
 */
export function isRunningInCI() {
    return process.env.GITHUB_ACTIONS?.toLowerCase() === 'true' || 
           process.env.CI?.toLowerCase() === 'true';
}

/**
 * Check if a repository is private based on the repository data from GitHub API.
 */
export function isPrivateRepository(repoData) {
    return repoData.private || false;
}

/**
 * Mask private repository name if running in CI, otherwise return original name.
 */
export function maskPrivateRepoName(repoName, isPrivate) {
    if (isRunningInCI() && isPrivate) {
        return '<private-repo>';
    }
    return repoName;
}

/**
 * Determine if we should show repository analysis messages.
 * Returns false for private repositories when running in CI to protect privacy.
 */
export function shouldShowAnalysisMessage(isPrivate) {
    if (isRunningInCI() && isPrivate) {
        return false;
    }
    return true;
}

/**
 * Check if a repository should be skipped from analysis.
 * Returns true if the repository is archived or disabled (deleted).
 */
export function shouldSkipRepository(repoData) {
    const isArchived = repoData.archived || false;
    const isDisabled = repoData.disabled || false;
    return isArchived || isDisabled;
}

/**
 * GitHub Pull Request Analyzer for detecting Copilot collaboration.
 */
export class GitHubPRAnalyzer {
    constructor(token, owner, repo = null, isOrg = false) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.isOrg = isOrg;
        this.headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
        this.baseUrl = 'https://api.github.com';
        
        // Cache for repository privacy information
        this.repoPrivacyCache = new Map();
        
        // Set up HTTP caching with 20-hour expiration
        this.cache = new NodeCache({ stdTTL: 20 * 60 * 60 }); // 20 hours in seconds
        
        // Set up axios instance
        this.api = axios.create({
            baseURL: this.baseUrl,
            headers: this.headers,
            timeout: 30000 // 30 second timeout
        });
    }

    /**
     * Get information about the HTTP cache.
     */
    getCacheInfo() {
        const keys = this.cache.keys();
        return {
            cacheEnabled: true,
            cacheSize: keys.length,
            cacheLocation: 'memory'
        };
    }

    /**
     * Make an API request with retry logic and rate limit handling.
     * @param {Function} requestFn - Function that makes the actual API request
     * @param {string} context - Context description for logging
     * @param {number} maxRetries - Maximum number of retries (default: 3)
     * @param {boolean} useCache - Whether to use cache (default: true)
     * @param {string} cacheKey - Key to use for caching (required if useCache is true)
     * @returns {Promise} - Promise that resolves to the API response data
     */
    async _makeApiRequestWithRetry(requestFn, context = 'API request', maxRetries = 3, useCache = true, cacheKey = null) {
        // Check cache if enabled and cache key is provided
        if (useCache && cacheKey) {
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                console.log(`Using cached data for [${requestFn.toString()}]`);
                return cachedData;
            }
        }

        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await requestFn();
                // Store in cache if enabled and cache key is provided
                if (useCache && cacheKey) {
                    this.cache.set(cacheKey, response.data);
                }
                return response.data;
            } catch (error) {
                lastError = error;
                
                // Don't retry on final attempt
                if (attempt === maxRetries) {
                    break;
                }
                
                // Check if this is a retryable error
                const shouldRetry = this._shouldRetryError(error);
                if (!shouldRetry) {
                    break;
                }
                
                // Handle rate limiting specifically
                if (error.response?.status === 429) {
                    const waitTime = await this._handleRateLimit(error, context);
                    console.log(`Rate limit hit for [${context}]. Waiting [${waitTime}ms] before retry [${attempt + 1}/${maxRetries}]`);
                    await this._sleep(waitTime);
                } else {
                    // Use exponential backoff with jitter for other retryable errors
                    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000); // Cap at 30 seconds
                    const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
                    const delay = baseDelay + jitter;
                    
                    console.log(`Retrying [${context}] after error: [${error.message}]. Attempt [${attempt + 1}/${maxRetries}] in [${Math.round(delay)}ms]`);
                    await this._sleep(delay);
                }
            }
        }
        
        // All retries exhausted, throw the last error
        throw lastError;
    }

    /**
     * Determine if an error should trigger a retry.
     * @param {Error} error - The error to check
     * @returns {boolean} - True if the error is retryable
     */
    _shouldRetryError(error) {
        // Network errors (no response)
        if (!error.response) {
            return true;
        }
        
        const status = error.response.status;
        
        // Retryable HTTP status codes
        if (status === 429) { // Rate limit
            return true;
        }
        if (status >= 500) { // Server errors
            return true;
        }
        if (status === 408) { // Request timeout
            return true;
        }
        if (status === 409) { // Conflict (may be temporary)
            return true;
        }
        
        // Don't retry client errors (4xx except the above)
        if (status >= 400 && status < 500) {
            return false;
        }
        
        return false;
    }

    /**
     * Handle rate limiting by reading response headers.
     * @param {Error} error - The rate limit error
     * @param {string} context - Context for logging
     * @returns {number} - Time to wait in milliseconds
     */
    async _handleRateLimit(error, context) {
        const headers = error.response?.headers || {};
        
        // Check for GitHub's rate limit headers
        const remaining = parseInt(headers['x-ratelimit-remaining'] || '0');
        const resetTimestamp = parseInt(headers['x-ratelimit-reset'] || '0');
        
        if (resetTimestamp > 0) {
            const now = Math.floor(Date.now() / 1000);
            const waitTime = Math.max(0, (resetTimestamp - now) * 1000) + 1000; // Add 1 second buffer
            
            console.log(`Rate limit info for [${context}]: remaining=[${remaining}], reset=[${new Date(resetTimestamp * 1000).toISOString()}]`);
            return Math.min(waitTime, 300000); // Cap at 5 minutes
        }
        
        // Check for Retry-After header
        const retryAfter = headers['retry-after'];
        if (retryAfter) {
            const waitTime = parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
            return Math.min(waitTime, 300000); // Cap at 5 minutes
        }
        
        // Default backoff if no specific headers
        return 60000; // 1 minute default
    }

    /**
     * Sleep for the specified number of milliseconds.
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} - Promise that resolves after the delay
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current rate limit information from GitHub API (non-cached call).
     */
    async getRateLimitInfo() {
        try {
            const cacheKey = 'rate_limit_info';
            const response = await this._makeApiRequestWithRetry(
                () => this.api.get('/rate_limit'),
                'rate limit info',
                3, // maxRetries
                true, // useCache
                cacheKey
            );
            
            const rateLimitData = response;
            const resetTimestamp = rateLimitData.rate.reset;
            const resetDateTime = new Date(resetTimestamp * 1000);
            const currentTime = new Date();
            const timeUntilReset = Math.max(0, resetDateTime.getTime() - currentTime.getTime());
            
            const totalSeconds = Math.floor(timeUntilReset / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            return {
                remaining: rateLimitData.rate.remaining,
                limit: rateLimitData.rate.limit,
                resetTimestamp: resetTimestamp,
                resetDatetime: resetDateTime.toISOString(),
                timeUntilResetMinutes: minutes,
                timeUntilResetSeconds: seconds,
                timeUntilResetTotalSeconds: totalSeconds
            };
        } catch (error) {
            throw new Error(`Failed to get rate limit info: ${error.message}`);
        }
    }

    /**
     * Fetch all repositories for the user.
     */
    async getUserRepositories() {
        const repos = [];
        let page = 1;
        const perPage = 100;
        const endpoint = this.isOrg ? `/orgs/${this.owner}/repos` : `/users/${this.owner}/repos`;
        
        while (true) {
            const cacheKey = `repos_${this.owner}_${page}`;
            try {
                const response = await this._makeApiRequestWithRetry(
                    () => this.api.get(endpoint, {
                        params: {
                            type: 'all',
                            sort: 'updated',
                            per_page: perPage,
                            page: page
                        }
                    }),
                    `repositories for ${this.owner} (page ${page})`,
                    3,  // maxRetries
                    true, // useCache
                    cacheKey
                );

                if (!response || response.length === 0) {
                    break;
                }

                repos.push(...response);
                page++;
            } catch (error) {
                // Enhanced error logging
                console.error(`Error fetching repositories for ${this.owner}:`);
                console.error(`Status code: ${error.response?.status}`);
                console.error(`Status text: ${error.response?.statusText}`);

                // Log rate limit information if available
                if (error.response?.headers) {
                    const rateLimit = {
                        limit: error.response.headers['x-ratelimit-limit'],
                        remaining: error.response.headers['x-ratelimit-remaining'],
                        reset: error.response.headers['x-ratelimit-reset'],
                        used: error.response.headers['x-ratelimit-used']
                    };
                    console.error('Rate limit information:', rateLimit);

                    // If rate limit is exhausted, provide more specific information
                    if (rateLimit.remaining === '0') {
                        const resetTime = new Date(rateLimit.reset * 1000).toISOString();
                        console.error(`Rate limit exceeded. Resets at: ${resetTime}`);
                    }
                }

                throw new Error(`Failed to fetch repositories for ${this.owner}: ${error.message}`);
            }
        }
        
        return repos;
    }

    /**
     * Load the organization filtering configuration from environment variable or file.
     * Priority: SKIPPED_ORGS environment variable > skipped_orgs.txt file
     */
    async loadSkippedOrganizations() {
        const config = {
            fullySkipped: [],
            partiallySkipped: {}
        };
        
        let content = '';
        
        // Check environment variable first (from workflow input)
        if (process.env.SKIPPED_ORGS) {
            content = process.env.SKIPPED_ORGS;
            console.log('Loading skipped organizations from SKIPPED_ORGS environment variable');
        } else {
            // Fallback to file-based configuration
            try {
                const configFile = path.join(process.cwd(), 'skipped_orgs.txt');
                content = await fs.readFile(configFile, 'utf8');
                console.log('Loading skipped organizations from skipped_orgs.txt file');
            } catch (error) {
                // File doesn't exist or other error, use empty config
                console.log(`Note: Could not load skipped organizations config: ${error.message}`);
                return config;
            }
        }
        
        // Parse the content (same format for both input and file)
        for (const line of content.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }
            
            if (trimmedLine.includes(':include:')) {
                const [orgName, , repoList] = trimmedLine.split(':');
                const repos = repoList.split(',').map(r => r.trim());
                config.partiallySkipped[orgName] = repos;
            } else {
                config.fullySkipped.push(trimmedLine);
            }
        }
        
        return config;
    }

    /**
     * Check if a repository should be skipped based on organization filtering.
     */
    shouldSkipRepositoryByOrg(repoName, skippedOrgs) {
        const [orgName, repoShortName] = repoName.includes('/') ? repoName.split('/') : ['', repoName];
        
        // Check if organization is fully skipped
        if (skippedOrgs.fullySkipped.includes(orgName)) {
            return true;
        }
        
        // Check if organization is partially skipped and this repo is not included
        if (skippedOrgs.partiallySkipped[orgName]) {
            return !skippedOrgs.partiallySkipped[orgName].includes(repoShortName);
        }
        
        return false;
    }

    /**
     * Fetch pull requests for a repository.
     */
    async getRepositoryPullRequests(repo, since) {
        const pulls = [];
        let page = 1;
        const perPage = 100;
        
        while (true) {
            const cacheKey = `pulls_${repo}_${since.toISOString()}_${page}`;
            try {
                const response = await this._makeApiRequestWithRetry(
                    () => this.api.get(`/repos/${repo}/pulls`, {
                        params: {
                            state: 'all',
                            since: since.toISOString(),
                            per_page: perPage,
                            page: page,
                            sort: 'updated',
                            direction: 'desc'
                        }
                    }),
                    `pull requests for ${repo} (page ${page})`,
                    3, // maxRetries
                    true, // useCache
                    cacheKey
                );

                if (!response || response.length === 0) {
                    break;
                }

                // Filter PRs that are actually within our date range
                const filteredPRs = response.filter(pr => {
                    const createdAt = new Date(pr.created_at);
                    return createdAt >= since;
                });

                pulls.push(...filteredPRs);

                // If we got fewer results than requested or the last PR is older than our cutoff, we're done
                if (response.length < perPage || filteredPRs.length < response.length) {
                    break;
                }

                page++;
            } catch (error) {
                if (error.response?.status === 404) {
                    const isPrivate = repo.includes('/') ? isPrivateRepository({ private: true }) : false;
                    const maskedName = maskPrivateRepoName(repo, isPrivate);
                    console.log(`Repository [${maskedName}] not found or not accessible`);
                    return [];
                }
                throw new Error(`Failed to fetch pull requests for ${repo}: ${error.message}`);
            }
        }
        
        return pulls;
    }

    /**
     * Get reviews for a pull request.
     */
    async getPRReviews(repo, prNumber) {
        const cacheKey = `reviews_${repo}_${prNumber}`;
        try {
            const reviews = await this._makeApiRequestWithRetry(
                () => this.api.get(`/repos/${repo}/pulls/${prNumber}/reviews`),
                `reviews for PR #${prNumber} in ${repo}`,
                3, // maxRetries
                true, // useCache
                cacheKey
            );
            return reviews || [];
        } catch (error) {
            console.log(`Warning: Could not fetch reviews for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    /**
     * Get commits for a pull request.
     */
    async getPRCommits(repo, prNumber) {
        const cacheKey = `commits_${repo}_${prNumber}`;
        try {
            const commits = await this._makeApiRequestWithRetry(
                () => this.api.get(`/repos/${repo}/pulls/${prNumber}/commits`),
                `commits for PR #${prNumber} in ${repo}`,
                3, // maxRetries
                true, // useCache
                cacheKey
            );
            return commits || [];
        } catch (error) {
            console.log(`Warning: Could not fetch commits for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    /**
     * Get files changed in a pull request.
     */
    async getPRFiles(repo, prNumber) {
        const cacheKey = `files_${repo}_${prNumber}`;
        try {
            const files = await this._makeApiRequestWithRetry(
                () => this.api.get(`/repos/${repo}/pulls/${prNumber}/files`),
                `files for PR #${prNumber} in ${repo}`,
                3, // maxRetries
                true, // useCache
                cacheKey
            );
            return files || [];
        } catch (error) {
            console.log(`Warning: Could not fetch files for PR #${prNumber}: ${error.message}`);
            return [];
        }
    }

    /**
     * Analyze commits in a PR to count commits by user vs AI tool.
     */
    analyzeCommitCounts(commits) {
        let totalCommits = commits.length;
        let userCommits = 0;
        let copilotCommits = 0;
        let claudeCommits = 0;
        let codexCommits = 0;
        
        for (const commit of commits) {
            const author = (commit.commit?.author?.name || '').toLowerCase();
            const committer = (commit.commit?.committer?.name || '').toLowerCase();
            const authorLogin = (commit.author?.login || '').toLowerCase();
            const message = (commit.commit?.message || '').toLowerCase();
            
            const isCopilotCommit = 
                (message.includes('co-authored-by:') && message.includes('copilot')) ||
                author.includes('copilot') ||
                committer.includes('copilot') ||
                authorLogin.includes('copilot');

            // Strong-evidence detection: co-author trailer or bot login (not broad name matching)
            const isClaudeCommit = !isCopilotCommit && (
                (message.includes('co-authored-by:') && message.includes('claude')) ||
                (authorLogin.includes('claude') && authorLogin.includes('[bot]'))
            );

            const isCodexCommit = !isCopilotCommit && !isClaudeCommit && (
                (message.includes('co-authored-by:') && message.includes('codex')) ||
                (authorLogin.includes('codex') && authorLogin.includes('[bot]'))
            );
            
            if (isCopilotCommit) {
                copilotCommits++;
            } else if (isClaudeCommit) {
                claudeCommits++;
            } else if (isCodexCommit) {
                codexCommits++;
            } else {
                userCommits++;
            }
        }
        
        return {
            totalCommits,
            userCommits,
            copilotCommits,
            claudeCommits,
            codexCommits
        };
    }

    /**
     * Analyze files in a PR to count lines of code changes.
     */
    analyzeLineChanges(files) {
        let totalAdditions = 0;
        let totalDeletions = 0;
        let totalChanges = 0;
        let filesChanged = files.length;
        
        for (const file of files) {
            const additions = file.additions || 0;
            const deletions = file.deletions || 0;
            const changes = file.changes || 0;
            
            totalAdditions += additions;
            totalDeletions += deletions;
            totalChanges += changes;
        }
        
        return {
            additions: totalAdditions,
            deletions: totalDeletions,
            changes: totalChanges,
            filesChanged: filesChanged
        };
    }

    /**
     * Detect AI agent collaboration and categorize by tool and assistance type.
     * Returns { tool: 'copilot'|'claude'|'codex'|'none', type: 'agent'|'review'|'none' }
     */
    async detectCopilotCollaboration(pr) {
        const title = (pr.title || '').toLowerCase();
        const body = (pr.body || '').toLowerCase();

        // Helpers: strong-evidence bot identity checks (bot username or [bot] suffix)
        const isClaudeLogin = (login) => {
            const l = login.toLowerCase();
            return l === 'claude' || (l.includes('claude') && l.includes('[bot]'));
        };
        const isCodexLogin = (login) => {
            const l = login.toLowerCase();
            return l === 'codex' || (l.includes('codex') && l.includes('[bot]'));
        };

        // Priority 1: Check if author is a known AI bot (highest priority)
        if (pr.user && pr.user.login) {
            const authorLogin = pr.user.login.toLowerCase();
            if (authorLogin === 'copilot') {
                return { tool: 'copilot', type: 'agent' };
            }
            if (isClaudeLogin(pr.user.login)) {
                return { tool: 'claude', type: 'agent' };
            }
            if (isCodexLogin(pr.user.login)) {
                return { tool: 'codex', type: 'agent' };
            }
        }
        
        // Priority 2: Check assignees for known AI bots
        if (pr.assignees && Array.isArray(pr.assignees)) {
            for (const assignee of pr.assignees) {
                if (assignee.login) {
                    const assigneeLogin = assignee.login.toLowerCase();
                    if (assigneeLogin === 'copilot') {
                        return { tool: 'copilot', type: 'agent' };
                    }
                    if (isClaudeLogin(assignee.login)) {
                        return { tool: 'claude', type: 'agent' };
                    }
                    if (isCodexLogin(assignee.login)) {
                        return { tool: 'codex', type: 'agent' };
                    }
                }
            }
        }
        
        // Priority 3: Check reviewers for AI-related bots
        try {
            const reviews = await this.getPRReviews(pr.base.repo.full_name, pr.number);
            for (const review of reviews) {
                if (review.user && review.user.login) {
                    const reviewerLogin = review.user.login.toLowerCase();
                    
                    // Copilot reviewer detection
                    if (reviewerLogin === 'copilot-pull-request-reviewer[bot]') {
                        return { tool: 'copilot', type: 'review' };
                    }
                    if (reviewerLogin.includes('copilot') && reviewerLogin.includes('review')) {
                        return { tool: 'copilot', type: 'review' };
                    }
                    if (reviewerLogin === 'copilot') {
                        return { tool: 'copilot', type: 'review' };
                    }

                    // Claude reviewer detection
                    if (isClaudeLogin(review.user.login)) {
                        return { tool: 'claude', type: 'review' };
                    }

                    // Codex reviewer detection
                    if (isCodexLogin(review.user.login)) {
                        return { tool: 'codex', type: 'review' };
                    }
                }
            }
        } catch (error) {
            console.log(`Warning: Could not fetch reviews for PR #${pr.number}: ${error.message}`);
        }
        
        // Priority 4: Check commits for AI co-author trailers
        try {
            const commits = await this.getPRCommits(pr.base.repo.full_name, pr.number);
            for (const commit of commits) {
                const message = (commit.commit.message || '').toLowerCase();
                
                // Copilot co-author or mention
                if (message.includes('co-authored-by:') && message.includes('copilot')) {
                    return { tool: 'copilot', type: 'agent' };
                }
                if (message.includes('copilot')) {
                    const reviewPatterns = ['review', 'feedback', 'suggestion', 'comment', 'approve'];
                    if (reviewPatterns.some(pattern => message.includes(pattern))) {
                        return { tool: 'copilot', type: 'review' };
                    } else {
                        return { tool: 'copilot', type: 'agent' };
                    }
                }

                // Claude co-author trailer (strong evidence only)
                if (message.includes('co-authored-by:') && message.includes('claude')) {
                    return { tool: 'claude', type: 'agent' };
                }

                // Codex co-author trailer (strong evidence only)
                if (message.includes('co-authored-by:') && message.includes('codex')) {
                    return { tool: 'codex', type: 'agent' };
                }
            }
        } catch (error) {
            console.log(`Warning: Could not fetch commits for PR #${pr.number}: ${error.message}`);
        }
        
        // Priority 5: Check title/body for Copilot keywords (Copilot only – avoids false positives for Claude/Codex)
        const copilotKeywords = ['copilot', 'co-pilot', 'github copilot', 'ai-assisted', 'ai assisted'];
        const reviewPatterns = ['review', 'feedback', 'suggestion', 'comment', 'approve'];
        const agentPatterns = ['generate', 'create', 'implement', 'code', 'develop', 'write'];
        
        const copilotMentioned = copilotKeywords.some(keyword => 
            title.includes(keyword) || body.includes(keyword)
        );
        
        if (copilotMentioned) {
            if (reviewPatterns.some(pattern => title.includes(pattern) || body.includes(pattern))) {
                return { tool: 'copilot', type: 'review' };
            } else if (agentPatterns.some(pattern => title.includes(pattern) || body.includes(pattern))) {
                return { tool: 'copilot', type: 'agent' };
            } else {
                return { tool: 'copilot', type: 'agent' };
            }
        }
        
        return { tool: 'none', type: 'none' };
    }

    /**
     * Detect if a PR is from Dependabot.
     */
    detectDependabotPR(pr) {
        if (pr.user && pr.user.login) {
            const author = pr.user.login.toLowerCase();
            if (author === 'dependabot' || author === 'dependabot[bot]') {
                return true;
            }
        }
        
        const title = (pr.title || '').toLowerCase();
        const dependabotPatterns = ['bump', 'update', 'build(deps)'];
        
        return dependabotPatterns.some(pattern => title.includes(pattern));
    }

    /**
     * Get week key from date in format YYYY-WXX.
     */
    getWeekKey(date) {
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const daysSinceStart = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
        return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    }

    /**
     * Analyze pull requests from the last 3 months.
     */
    async analyzePullRequests() {
        const now = new Date();
        const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
        
        console.log(`Starting PR analysis for ${this.owner}${this.repo ? `/${this.repo}` : ' (all repos)'}`);
        console.log(`Analysis period: ${since.toISOString()} to ${now.toISOString()}`);
        
        const weeklyData = {};
        const skippedOrgs = await this.loadSkippedOrganizations();
        
        let repositories;
        if (this.repo) {
            // Analyze single repository
            repositories = [{ full_name: `${this.owner}/${this.repo}`, name: this.repo }];
        } else {
            // Analyze all user repositories
            repositories = await this.getUserRepositories();
        }
        
        let totalPRs = 0;
        let totalCopilotPRs = 0;
        let totalCopilotReviewPRs = 0;
        let totalCopilotAgentPRs = 0;
        let totalClaudePRs = 0;
        let totalClaudeReviewPRs = 0;
        let totalClaudeAgentPRs = 0;
        let totalCodexPRs = 0;
        let totalCodexReviewPRs = 0;
        let totalCodexAgentPRs = 0;
        let totalAIAssistedPRs = 0;
        let totalDependabotPRs = 0;
        let totalRepositories = 0;
        
        const allCollaborators = new Set();
        const repositoryNames = new Set();
        
        for (const repo of repositories) {
            const repoFullName = repo.full_name;
            
            // Skip repository if it's in the skip list
            if (this.shouldSkipRepositoryByOrg(repoFullName, skippedOrgs)) {
                const skipIsPrivate = isPrivateRepository(repo);
                const maskedSkipName = maskPrivateRepoName(repoFullName, skipIsPrivate);
                if (shouldShowAnalysisMessage(skipIsPrivate)) {
                    console.log(`Skipping repository [${maskedSkipName}] due to organization filtering`);
                }
                continue;
            }
            
            // Skip archived or disabled repositories
            if (shouldSkipRepository(repo)) {
                const archiveIsPrivate = isPrivateRepository(repo);
                const maskedArchiveName = maskPrivateRepoName(repoFullName, archiveIsPrivate);
                if (shouldShowAnalysisMessage(archiveIsPrivate)) {
                    console.log(`Skipping repository [${maskedArchiveName}] because it is archived or disabled`);
                }
                continue;
            }
            
            const isPrivate = isPrivateRepository(repo);
            const maskedRepoName = maskPrivateRepoName(repoFullName, isPrivate);
            
            if (shouldShowAnalysisMessage(isPrivate)) {
                console.log(`Analyzing repository: [${maskedRepoName}]`);
            }
            
            try {
                const pulls = await this.getRepositoryPullRequests(repoFullName, since);
                
                if (pulls.length > 0) {
                    totalRepositories++;
                    repositoryNames.add(maskedRepoName);
                    
                    if (shouldShowAnalysisMessage(isPrivate)) {
                        console.log(`  Found ${pulls.length} PRs to analyze in [${maskedRepoName}]`);
                    }
                }
                
                for (const pr of pulls) {
                    // Skip Dependabot PRs from analysis
                    const isDependabot = this.detectDependabotPR(pr);
                    if (isDependabot) {
                        totalDependabotPRs++;
                        continue;
                    }

                    // Check if authenticated user is involved in the PR
                    let isUserInvolved = false;

                    // Check author
                    if (pr.user && pr.user.login === this.owner) {
                        isUserInvolved = true;
                    }

                    // Check assignees
                    if (!isUserInvolved && pr.assignees && Array.isArray(pr.assignees)) {
                        isUserInvolved = pr.assignees.some(assignee => assignee.login === this.owner);
                    }

                    // Check reviewers
                    if (!isUserInvolved) {
                        try {
                            const reviews = await this.getPRReviews(pr.base.repo.full_name, pr.number);
                            isUserInvolved = reviews.some(review => review.user && review.user.login === this.owner);
                        } catch (error) {
                            console.log(`Warning: Could not fetch reviews for PR #${pr.number}: ${error.message}`);
                        }
                    }

                    // Skip PR if authenticated user is not involved
                    if (!isUserInvolved) {
                        continue;
                    }
                    
                    const createdAt = new Date(pr.created_at);
                    const weekKey = this.getWeekKey(createdAt);
                    
                    if (!weeklyData[weekKey]) {
                        weeklyData[weekKey] = {
                            totalPRs: 0,
                            copilotAssistedPRs: 0,
                            copilotReviewPRs: 0,
                            copilotAgentPRs: 0,
                            claudeAssistedPRs: 0,
                            claudeReviewPRs: 0,
                            claudeAgentPRs: 0,
                            codexAssistedPRs: 0,
                            codexReviewPRs: 0,
                            codexAgentPRs: 0,
                            aiAssistedPRs: 0,
                            collaborators: new Set(),
                            repositories: new Set(),
                            pullRequests: []
                        };
                    }
                    
                    weeklyData[weekKey].totalPRs++;
                    totalPRs++;

                    // Add author to collaborators
                    if (pr.user && pr.user.login) {
                        allCollaborators.add(pr.user.login);
                        weeklyData[weekKey].collaborators.add(pr.user.login);
                    }
                    
                    // Add assignees to collaborators
                    if (pr.assignees && Array.isArray(pr.assignees)) {
                        for (const assignee of pr.assignees) {
                            if (assignee.login) {
                                allCollaborators.add(assignee.login);
                                weeklyData[weekKey].collaborators.add(assignee.login);
                            }
                        }
                    }

                    // Add reviewers to collaborators
                    try {
                        const reviews = await this.getPRReviews(pr.base.repo.full_name, pr.number);
                        for (const review of reviews) {
                            if (review.user && review.user.login) {
                                allCollaborators.add(review.user.login);
                                weeklyData[weekKey].collaborators.add(review.user.login);
                            }
                        }
                    } catch (error) {
                        console.log(`Warning: Could not fetch reviews for PR #${pr.number}: ${error.message}`);
                    }

                    weeklyData[weekKey].repositories.add(maskedRepoName);

                    // Detect AI agent collaboration
                    const aiCollaboration = await this.detectCopilotCollaboration(pr);
                    const { tool: aiTool, type: aiType } = aiCollaboration;
                    const aiAssisted = aiType !== 'none';
                    const copilotAssisted = aiAssisted && aiTool === 'copilot';

                    if (aiType === 'review') {
                        if (aiTool === 'copilot') {
                            weeklyData[weekKey].copilotReviewPRs++;
                            totalCopilotReviewPRs++;
                        } else if (aiTool === 'claude') {
                            weeklyData[weekKey].claudeReviewPRs++;
                            totalClaudeReviewPRs++;
                        } else if (aiTool === 'codex') {
                            weeklyData[weekKey].codexReviewPRs++;
                            totalCodexReviewPRs++;
                        }
                    } else if (aiType === 'agent') {
                        if (aiTool === 'copilot') {
                            weeklyData[weekKey].copilotAgentPRs++;
                            totalCopilotAgentPRs++;
                        } else if (aiTool === 'claude') {
                            weeklyData[weekKey].claudeAgentPRs++;
                            totalClaudeAgentPRs++;
                        } else if (aiTool === 'codex') {
                            weeklyData[weekKey].codexAgentPRs++;
                            totalCodexAgentPRs++;
                        }
                    }
                    
                    if (copilotAssisted) {
                        weeklyData[weekKey].copilotAssistedPRs++;
                        totalCopilotPRs++;
                    }
                    if (aiTool === 'claude') {
                        weeklyData[weekKey].claudeAssistedPRs++;
                        totalClaudePRs++;
                    }
                    if (aiTool === 'codex') {
                        weeklyData[weekKey].codexAssistedPRs++;
                        totalCodexPRs++;
                    }
                    if (aiAssisted) {
                        weeklyData[weekKey].aiAssistedPRs++;
                        totalAIAssistedPRs++;
                    }
                    
                    // Analyze commit counts for AI-assisted PRs
                    let commitCounts = null;
                    if (aiAssisted) {
                        try {
                            const commits = await this.getPRCommits(pr.base.repo.full_name, pr.number);
                            commitCounts = this.analyzeCommitCounts(commits);
                        } catch (error) {
                            console.log(`Warning: Could not analyze commits for AI-assisted PR #${pr.number}: ${error.message}`);
                        }
                    }
                    
                    // Analyze line changes for all PRs
                    let lineChanges = null;
                    try {
                        const files = await this.getPRFiles(pr.base.repo.full_name, pr.number);
                        lineChanges = this.analyzeLineChanges(files);
                    } catch (error) {
                        console.log(`Warning: Could not analyze line changes for PR #${pr.number}: ${error.message}`);
                    }
                    
                    // Store PR details (Dependabot PRs are excluded)
                    const prDetails = {
                        number: pr.number,
                        title: pr.title,
                        author: pr.user ? pr.user.login : 'unknown',
                        repository: maskedRepoName,
                        createdAt: pr.created_at,
                        copilotAssisted: copilotAssisted,
                        copilotType: copilotAssisted ? aiType : undefined,
                        aiAssisted: aiAssisted,
                        aiTool: aiTool,
                        aiType: aiType,
                        dependabotPr: false, // Always false since we exclude Dependabot PRs
                        url: pr.html_url,
                        collaborators: new Set([
                            // Add author
                            pr.user ? pr.user.login : null,
                            // Add assignees
                            ...(pr.assignees || []).map(assignee => assignee.login)
                        ])
                    };
                    
                    // Add reviewers to PR collaborators
                    try {
                        const reviews = await this.getPRReviews(pr.base.repo.full_name, pr.number);
                        for (const review of reviews) {
                            if (review.user && review.user.login) {
                                prDetails.collaborators.add(review.user.login);
                            }
                        }
                    } catch (error) {
                        console.log(`Warning: Could not fetch reviews for PR #${pr.number}: ${error.message}`);
                    }

                    // Convert collaborators Set to Array and remove nulls
                    prDetails.collaborators = Array.from(prDetails.collaborators).filter(Boolean);

                    // Add commit counts for Copilot PRs
                    if (commitCounts) {
                        prDetails.commitCounts = commitCounts;
                    }
                    
                    // Add line changes for all PRs
                    if (lineChanges) {
                        prDetails.lineChanges = lineChanges;
                    }
                    
                    weeklyData[weekKey].pullRequests.push(prDetails);
                }
                
                // Analyze GitHub Actions usage for Copilot-triggered runs
                if (shouldShowAnalysisMessage(isPrivate)) {
                    console.log(`  Analyzing GitHub Actions usage for [${maskedRepoName}]`);
                }
                
                try {
                    const actionsUsage = await this.analyzeActionsUsage(repoFullName, since);
                    
                    if (actionsUsage.totalRuns > 0) {
                        if (shouldShowAnalysisMessage(isPrivate)) {
                            console.log(`  Found ${actionsUsage.totalRuns} Copilot-triggered workflow runs using ${actionsUsage.totalMinutes} minutes in [${maskedRepoName}]`);
                        }
                        
                        // Add actions usage to weekly data
                        for (const runDetail of actionsUsage.runDetails) {
                            const runCreatedAt = new Date(runDetail.createdAt);
                            const runWeekKey = this.getWeekKey(runCreatedAt);
                            
                            if (!weeklyData[runWeekKey]) {
                                weeklyData[runWeekKey] = {
                                    totalPRs: 0,
                                    copilotAssistedPRs: 0,
                                    copilotReviewPRs: 0,
                                    copilotAgentPRs: 0,
                                    claudeAssistedPRs: 0,
                                    claudeReviewPRs: 0,
                                    claudeAgentPRs: 0,
                                    codexAssistedPRs: 0,
                                    codexReviewPRs: 0,
                                    codexAgentPRs: 0,
                                    aiAssistedPRs: 0,
                                    collaborators: new Set(),
                                    repositories: new Set(),
                                    pullRequests: [],
                                    actionsUsage: {
                                        totalMinutes: 0,
                                        totalRuns: 0,
                                        runDetails: []
                                    }
                                };
                            }
                            
                            // Initialize actions usage if not present
                            if (!weeklyData[runWeekKey].actionsUsage) {
                                weeklyData[runWeekKey].actionsUsage = {
                                    totalMinutes: 0,
                                    totalRuns: 0,
                                    runDetails: []
                                };
                            }
                            
                            weeklyData[runWeekKey].actionsUsage.totalMinutes += runDetail.minutes;
                            weeklyData[runWeekKey].actionsUsage.totalRuns++;
                            weeklyData[runWeekKey].actionsUsage.runDetails.push({
                                ...runDetail,
                                repository: maskedRepoName
                            });
                        }
                    }
                } catch (error) {
                    console.log(`Warning: Could not analyze GitHub Actions for ${maskedRepoName}: ${error.message}`);
                }
            } catch (error) {
                console.error(`Error analyzing repository [${maskedRepoName}]: ${error.message}`);
            }
        }
        
        // Calculate totals for Actions usage
        let totalActionsMinutes = 0;
        let totalActionsRuns = 0;
        
        for (const [, data] of Object.entries(weeklyData)) {
            if (data.actionsUsage) {
                totalActionsMinutes += data.actionsUsage.totalMinutes;
                totalActionsRuns += data.actionsUsage.totalRuns;
            }
        }
        
        // Log summary including Dependabot exclusions
        console.log('\nAnalysis complete:');
        console.log(`- Total PRs analyzed: ${totalPRs}`);
        console.log(`- Dependabot PRs excluded: ${totalDependabotPRs}`);
        console.log(`- AI-assisted PRs (total): ${totalAIAssistedPRs}`);
        console.log(`  - Copilot: ${totalCopilotPRs}`);
        if (totalClaudePRs > 0) console.log(`  - Claude: ${totalClaudePRs}`);
        if (totalCodexPRs > 0) console.log(`  - Codex: ${totalCodexPRs}`);
        console.log(`- Repositories analyzed: ${totalRepositories}`);
        console.log(`- Copilot-triggered Actions runs: ${totalActionsRuns}`);
        console.log(`- Copilot Actions minutes used: ${totalActionsMinutes}`);
        
        // Calculate percentages and prepare final data
        const finalWeeklyData = {};
        for (const [weekKey, data] of Object.entries(weeklyData)) {
            const copilotPercentage = data.totalPRs > 0 ? (data.copilotAssistedPRs / data.totalPRs * 100) : 0;
            const copilotReviewPercentage = data.totalPRs > 0 ? (data.copilotReviewPRs / data.totalPRs * 100) : 0;
            const copilotAgentPercentage = data.totalPRs > 0 ? (data.copilotAgentPRs / data.totalPRs * 100) : 0;
            const claudePercentage = data.totalPRs > 0 ? ((data.claudeAssistedPRs || 0) / data.totalPRs * 100) : 0;
            const claudeReviewPercentage = data.totalPRs > 0 ? ((data.claudeReviewPRs || 0) / data.totalPRs * 100) : 0;
            const claudeAgentPercentage = data.totalPRs > 0 ? ((data.claudeAgentPRs || 0) / data.totalPRs * 100) : 0;
            const codexPercentage = data.totalPRs > 0 ? ((data.codexAssistedPRs || 0) / data.totalPRs * 100) : 0;
            const codexReviewPercentage = data.totalPRs > 0 ? ((data.codexReviewPRs || 0) / data.totalPRs * 100) : 0;
            const codexAgentPercentage = data.totalPRs > 0 ? ((data.codexAgentPRs || 0) / data.totalPRs * 100) : 0;
            const aiPercentage = data.totalPRs > 0 ? ((data.aiAssistedPRs || 0) / data.totalPRs * 100) : 0;
            
            finalWeeklyData[weekKey] = {
                totalPRs: data.totalPRs,
                copilotAssistedPRs: data.copilotAssistedPRs,
                copilotReviewPRs: data.copilotReviewPRs,
                copilotAgentPRs: data.copilotAgentPRs,
                copilotPercentage: Math.round(copilotPercentage * 100) / 100,
                copilotReviewPercentage: Math.round(copilotReviewPercentage * 100) / 100,
                copilotAgentPercentage: Math.round(copilotAgentPercentage * 100) / 100,
                claudeAssistedPRs: data.claudeAssistedPRs || 0,
                claudeReviewPRs: data.claudeReviewPRs || 0,
                claudeAgentPRs: data.claudeAgentPRs || 0,
                claudePercentage: Math.round(claudePercentage * 100) / 100,
                claudeReviewPercentage: Math.round(claudeReviewPercentage * 100) / 100,
                claudeAgentPercentage: Math.round(claudeAgentPercentage * 100) / 100,
                codexAssistedPRs: data.codexAssistedPRs || 0,
                codexReviewPRs: data.codexReviewPRs || 0,
                codexAgentPRs: data.codexAgentPRs || 0,
                codexPercentage: Math.round(codexPercentage * 100) / 100,
                codexReviewPercentage: Math.round(codexReviewPercentage * 100) / 100,
                codexAgentPercentage: Math.round(codexAgentPercentage * 100) / 100,
                aiAssistedPRs: data.aiAssistedPRs || 0,
                aiPercentage: Math.round(aiPercentage * 100) / 100,
                uniqueCollaborators: data.collaborators.size,
                collaborators: Array.from(data.collaborators),
                repositories: Array.from(data.repositories),
                pullRequests: data.pullRequests,
                actionsUsage: data.actionsUsage || {
                    totalMinutes: 0,
                    totalRuns: 0,
                    runDetails: []
                }
            };
        }
        
        return {
            analysisDate: now.toISOString(),
            periodStart: since.toISOString(),
            periodEnd: now.toISOString(),
            analyzedUser: this.owner,
            analyzedRepository: this.repo || 'all_repositories',
            totalPRs: totalPRs,
            totalCopilotPRs: totalCopilotPRs,
            totalCopilotReviewPRs: totalCopilotReviewPRs,
            totalCopilotAgentPRs: totalCopilotAgentPRs,
            totalClaudePRs: totalClaudePRs,
            totalClaudeReviewPRs: totalClaudeReviewPRs,
            totalClaudeAgentPRs: totalClaudeAgentPRs,
            totalCodexPRs: totalCodexPRs,
            totalCodexReviewPRs: totalCodexReviewPRs,
            totalCodexAgentPRs: totalCodexAgentPRs,
            totalAIAssistedPRs: totalAIAssistedPRs,
            totalDependabotPRs: totalDependabotPRs,
            totalRepositories: totalRepositories,
            totalActionsMinutes: totalActionsMinutes,
            totalActionsRuns: totalActionsRuns,
            weeklyAnalysis: finalWeeklyData
        };
    }

    /**
     * Create a text summary of the analysis results.
     * @param {Object} results - The analysis results
     * @returns {string} The formatted text summary
     */    createTextSummary(results) {
        let textContent = `# Pull Request Analysis\n\n`;
        textContent += `Found ${results.totalPRs} pull requests`;
        if (results.totalCopilotPRs > 0) {
            const copilotPercentage = Math.round((results.totalCopilotPRs / results.totalPRs) * 100);
            textContent += ` (${results.totalCopilotPRs} with Copilot assistance, ${copilotPercentage}%)\n\n`;
        } else {
            textContent += `\n\n`;
        }

        textContent += `| Week | Copilot | Pull Request | Comments | Lines Changed | Action Minutes |\n`;
        textContent += `|------|----------|--------------|-----------|---------------|----------------|\n`;

        // Sort weeks chronologically
        const sortedWeeks = Object.keys(results.weeklyAnalysis).sort();

        for (const week of sortedWeeks) {
            const weekData = results.weeklyAnalysis[week];
            if (weekData.pullRequests && weekData.pullRequests.length > 0) {
                for (const pr of weekData.pullRequests) {
                    const prLink = `[#${pr.number} ${pr.title}](${pr.url})`;
                    const aiDisplay = pr.aiAssisted ? `${pr.aiTool}-${pr.aiType}` : 'none';
                    
                    // Calculate line changes
                    const linesChanged = pr.lineChanges ? 
                        `+${pr.lineChanges.additions}/-${pr.lineChanges.deletions}` : 
                        'n/a';
                    
                    // Get comments count - using collaborators (excluding the author) as a proxy since we have that data
                    const commentsCount = pr.collaborators ? pr.collaborators.length - 1 : 0; // Subtract 1 for author
                    
                    // Get action minutes if available (this might need to be added to the data structure)
                    const actionMinutes = pr.actionMinutes || 'n/a';
                    
                    textContent += `| ${week} | ${aiDisplay} | ${prLink} | ${commentsCount} | ${linesChanged} | ${actionMinutes} |\n`;
                }
            }
        }

        return textContent;
    }

    /**
     * Save results to file in specified format.
     */
    async saveResults(results, outputFormat = 'json') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        
        try {
            // Ensure the report directory exists
            await fs.mkdir(REPORT_FOLDER, { recursive: true });
            
            if (outputFormat.toLowerCase() === 'json') {
                const filename = `${REPORT_FOLDER}pr_analysis_${timestamp}.json`;
                await fs.writeFile(filename, JSON.stringify(results, null, 2));

                // If not running in CI, also create a readable text summary
                if (!isRunningInCI()) {
                    const textFilename = `${REPORT_FOLDER}pr_analysis_${timestamp}.txt`;
                    const textContent = this.createTextSummary(results);
                    await fs.writeFile(textFilename, textContent);
                    console.log(`Text summary saved to: ${textFilename}`);
                }

                return filename;
            } else if (outputFormat.toLowerCase() === 'csv') {
                const filename = `${REPORT_FOLDER}pr_analysis_${timestamp}.csv`;
                const csvWriter = createCsvWriter.createObjectCsvWriter;
                
                // Prepare CSV data
                const records = [];
                for (const [week, data] of Object.entries(results.weeklyAnalysis)) {
                    records.push({
                        Week: week,
                        'Total PRs': data.totalPRs,
                        'Copilot Assisted PRs': data.copilotAssistedPRs,
                        'Copilot Review PRs': data.copilotReviewPRs,
                        'Copilot Agent PRs': data.copilotAgentPRs,
                        'Copilot Percentage': data.copilotPercentage,
                        'Copilot Review Percentage': data.copilotReviewPercentage,
                        'Copilot Agent Percentage': data.copilotAgentPercentage,
                        'Unique Collaborators': data.uniqueCollaborators,
                        'Collaborators': data.collaborators.join(', '),
                        'Actions Minutes': data.actionsUsage.totalMinutes,
                        'Actions Runs': data.actionsUsage.totalRuns
                    });
                }
                
                const writer = csvWriter({
                    path: filename,
                    header: [
                        {id: 'Week', title: 'Week'},
                        {id: 'Total PRs', title: 'Total PRs'},
                        {id: 'Copilot Assisted PRs', title: 'Copilot Assisted PRs'},
                        {id: 'Copilot Review PRs', title: 'Copilot Review PRs'},
                        {id: 'Copilot Agent PRs', title: 'Copilot Agent PRs'},
                        {id: 'Copilot Percentage', title: 'Copilot Percentage'},
                        {id: 'Copilot Review Percentage', title: 'Copilot Review Percentage'},
                        {id: 'Copilot Agent Percentage', title: 'Copilot Agent Percentage'},
                        {id: 'Unique Collaborators', title: 'Unique Collaborators'},
                        {id: 'Collaborators', title: 'Collaborators'},
                        {id: 'Actions Minutes', title: 'Actions Minutes'},
                        {id: 'Actions Runs', title: 'Actions Runs'}
                    ]
                });
                
                await writer.writeRecords(records);
                return filename;
            } else {
                throw new Error(`Unsupported output format: ${outputFormat}`);
            }
        } catch (error) {
            throw new Error(`Failed to save results: ${error.message}`);
        }
    }

    /**
     * Fetch workflow runs for a repository.
     */
    async getRepositoryWorkflowRuns(repoFullName, since) {
        const runs = [];
        let page = 1;
        const perPage = 100;
        
        while (true) {
            const cacheKey = `workflow_runs_${repoFullName}_${since.toISOString()}_${page}`;
            
            try {
                const response = await this._makeApiRequestWithRetry(
                    () => this.api.get(`/repos/${repoFullName}/actions/runs`, {
                        params: {
                            per_page: perPage,
                            page: page,
                            created: `>=${since.toISOString()}`
                        }
                    }),
                    `workflow runs for ${repoFullName} (page ${page})`,
                    3, // maxRetries
                    true, // useCache
                    cacheKey
                );
                
                if (response.workflow_runs.length === 0) {
                    break;
                }
                
                runs.push(...response.workflow_runs);
                page++;
            } catch (error) {
                console.log(`Warning: Could not fetch workflow runs for ${repoFullName}: ${error.message}`);
                break;
            }
        }
        
        return runs;
    }

    /**
     * Fetch jobs for a specific workflow run.
     */
    async getWorkflowRunJobs(repoFullName, runId) {
        const cacheKey = `workflow_jobs_${repoFullName}_${runId}`;
        
        try {
            const response = await this._makeApiRequestWithRetry(
                () => this.api.get(`/repos/${repoFullName}/actions/runs/${runId}/jobs`),
                `jobs for workflow run ${runId} in ${repoFullName}`,
                3, // maxRetries
                true, // useCache
                cacheKey
            );
            return response;
        } catch (error) {
            console.log(`Warning: Could not fetch jobs for workflow run ${runId} in ${repoFullName}: ${error.message}`);
            return { jobs: [] };
        }
    }

    /**
     * Check if a workflow run was triggered by Copilot.
     */
    isCopilotTriggeredRun(workflowRun) {
        const actor = workflowRun.actor?.login?.toLowerCase() || '';
        const triggeringActor = workflowRun.triggering_actor?.login?.toLowerCase() || '';
        
        // Check for known Copilot actor names
        const copilotActors = [
            'copilot',
            'copilot-swe-agent',
            'github-copilot[bot]',
            'copilot[bot]',
            'copilot-pull-request-reviewer[bot]'
        ];
        
        // Check actors first
        const isCopilotActor = copilotActors.some(copilotActor => 
            actor === copilotActor || triggeringActor === copilotActor
        );
        
        if (isCopilotActor) {
            return true;
        }
        
        // Check workflow run title/name for Copilot references
        const workflowName = workflowRun.name?.toLowerCase() || '';
        const displayTitle = workflowRun.display_title?.toLowerCase() || '';
        const commitMessage = workflowRun.head_commit?.message?.toLowerCase() || '';
        
        const copilotKeywords = ['copilot'];
        
        return copilotKeywords.some(keyword => 
            workflowName.includes(keyword) || 
            displayTitle.includes(keyword) || 
            commitMessage.includes(keyword)
        );
    }

    /**
     * Calculate action minutes for a workflow run.
     */
    calculateActionMinutes(jobs) {
        let totalMinutes = 0;
        
        for (const job of jobs) {
            if (job.started_at && job.completed_at) {
                const startTime = new Date(job.started_at);
                const endTime = new Date(job.completed_at);
                const durationMs = endTime - startTime;
                const durationMinutes = Math.ceil(durationMs / (1000 * 60)); // Round up to nearest minute
                totalMinutes += durationMinutes;
            }
        }
        
        return totalMinutes;
    }

    /**
     * Analyze GitHub Actions usage for Copilot-triggered runs.
     */
    async analyzeActionsUsage(repoFullName, since) {
        const workflowRuns = await this.getRepositoryWorkflowRuns(repoFullName, since);
        
        // Debug logging to understand what runs we're analyzing
        if (process.env.DEBUG_ACTIONS) {
            console.log(`\nDebug: Analyzing ${workflowRuns.length} workflow runs for ${repoFullName}`);
            workflowRuns.forEach((run, index) => {
                console.log(`  Run ${index + 1}:`);
                console.log(`    Name: ${run.name}`);
                console.log(`    Display Title: ${run.display_title}`);
                console.log(`    Actor: ${run.actor?.login}`);
                console.log(`    Triggering Actor: ${run.triggering_actor?.login}`);
                console.log(`    Head Commit Message: ${run.head_commit?.message?.substring(0, 100)}...`);
                console.log(`    Is Copilot: ${this.isCopilotTriggeredRun(run)}`);
                console.log('');
            });
        }
        
        const copilotRuns = workflowRuns.filter(run => this.isCopilotTriggeredRun(run));
        
        let totalMinutes = 0;
        let totalRuns = 0;
        const runDetails = [];
        
        for (const run of copilotRuns) {
            const jobsResponse = await this.getWorkflowRunJobs(repoFullName, run.id);
            const jobs = jobsResponse.jobs || [];
            const runMinutes = this.calculateActionMinutes(jobs);
            
            totalMinutes += runMinutes;
            totalRuns++;
            
            runDetails.push({
                id: run.id,
                name: run.name,
                actor: run.actor?.login,
                triggeringActor: run.triggering_actor?.login,
                createdAt: run.created_at,
                minutes: runMinutes,
                status: run.status,
                conclusion: run.conclusion
            });
        }
        
        return {
            totalMinutes,
            totalRuns,
            runDetails
        };
    }

    /**
     * Create a text summary of the analysis results.
     * @param {Object} results - The analysis results
     * @returns {string} The formatted text summary
     */
    createTextSummary(results) {
        let textContent = `# Pull Request Analysis\n\n`;
        textContent += `Found ${results.totalPRs} pull requests`;
        if (results.totalCopilotPRs > 0) {
            const copilotPercentage = Math.round((results.totalCopilotPRs / results.totalPRs) * 100);
            textContent += ` (${results.totalCopilotPRs} with Copilot assistance, ${copilotPercentage}%)\n\n`;
        } else {
            textContent += `\n\n`;
        }

        // Add repository count information
        if (isRunningInCI()) {
            textContent += `Analyzed ${results.totalRepositories} repositories\n\n`;
        } else {
            // Only show repository names when not in CI
            const repoList = new Set();
            Object.values(results.weeklyAnalysis).forEach(week => {
                week.repositories.forEach(repo => repoList.add(repo));
            });
            textContent += `Analyzed repositories: ${Array.from(repoList).join(', ')}\n\n`;
        }

        textContent += `| Week | Copilot | Pull Request | Lines Changed | Files |\n`;
        textContent += `|------|----------|--------------|---------------|--------|\n`;

        // Sort weeks chronologically
        const sortedWeeks = Object.keys(results.weeklyAnalysis).sort();

        for (const week of sortedWeeks) {
            const weekData = results.weeklyAnalysis[week];
            if (weekData.pullRequests && weekData.pullRequests.length > 0) {
                for (const pr of weekData.pullRequests) {
                    // Handle PR title with privacy in mind
                    let prTitle = pr.title;
                    if (isRunningInCI() && pr.repository.includes('/')) {
                        // In CI, only show PR number for private repos
                        prTitle = `PR #${pr.number}`;
                    }

                    const prLink = `[${prTitle}](${pr.url})`;
                    const aiDisplay = pr.aiAssisted ? `${pr.aiTool}-${pr.aiType}` : 'none';

                    // Add lines of code changed info
                    let linesChanged = '';
                    let filesChanged = '';
                    if (pr.lineChanges) {
                        linesChanged = `+${pr.lineChanges.additions}/-${pr.lineChanges.deletions}`;
                        filesChanged = pr.lineChanges.filesChanged.toString();
                    }

                    textContent += `| ${week} | ${aiDisplay} | ${prLink} | ${linesChanged} | ${filesChanged} |\n`;
                }
            }
        }

        return textContent;
    }
}