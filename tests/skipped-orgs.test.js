import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';

describe('GitHubPRAnalyzer - Skipped Organizations', () => {
    let analyzer;
    let originalEnv;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
        originalEnv = process.env.SKIPPED_ORGS;
    });

    afterEach(() => {
        // Restore original environment
        if (originalEnv === undefined) {
            delete process.env.SKIPPED_ORGS;
        } else {
            process.env.SKIPPED_ORGS = originalEnv;
        }
    });

    describe('loadSkippedOrganizations', () => {
        test('should load simple skipped orgs from environment variable', async () => {
            process.env.SKIPPED_ORGS = 'org1\norg2\norg3';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual(['org1', 'org2', 'org3']);
            expect(config.partiallySkipped).toEqual({});
        });

        test('should load selective skipped orgs from environment variable', async () => {
            process.env.SKIPPED_ORGS = 'org1:include:repo1,repo2\norg2';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual(['org2']);
            expect(config.partiallySkipped).toEqual({
                'org1': ['repo1', 'repo2']
            });
        });

        test('should ignore comments in environment variable', async () => {
            process.env.SKIPPED_ORGS = '# This is a comment\norg1\n# Another comment\norg2';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual(['org1', 'org2']);
        });

        test('should handle empty lines in environment variable', async () => {
            process.env.SKIPPED_ORGS = 'org1\n\norg2\n\n';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual(['org1', 'org2']);
        });

        test('should return empty config when no environment variable or file', async () => {
            delete process.env.SKIPPED_ORGS;
            
            // Mock fs.readFile to throw an error (file not found)
            const originalCwd = process.cwd;
            process.cwd = () => '/nonexistent';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual([]);
            expect(config.partiallySkipped).toEqual({});
            
            process.cwd = originalCwd;
        });

        test('should handle multiline format with Windows line endings', async () => {
            process.env.SKIPPED_ORGS = 'org1\r\norg2\r\norg3';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            // Note: split('\n') will leave \r on each line, but trim() removes it
            expect(config.fullySkipped).toContain('org1');
            expect(config.fullySkipped).toContain('org2');
            expect(config.fullySkipped).toContain('org3');
        });

        test('should handle complex selective format', async () => {
            process.env.SKIPPED_ORGS = 'simple-org\ncomplex-org:include:repo1,repo2,repo3';
            
            const config = await analyzer.loadSkippedOrganizations();
            
            expect(config.fullySkipped).toEqual(['simple-org']);
            expect(config.partiallySkipped).toEqual({
                'complex-org': ['repo1', 'repo2', 'repo3']
            });
        });
    });

    describe('shouldSkipRepositoryByOrg', () => {
        test('should skip repository if org is fully skipped', () => {
            const skippedOrgs = {
                fullySkipped: ['skip-org'],
                partiallySkipped: {}
            };
            
            expect(analyzer.shouldSkipRepositoryByOrg('skip-org/repo1', skippedOrgs)).toBe(true);
        });

        test('should not skip repository if org is not in skip list', () => {
            const skippedOrgs = {
                fullySkipped: ['other-org'],
                partiallySkipped: {}
            };
            
            expect(analyzer.shouldSkipRepositoryByOrg('allowed-org/repo1', skippedOrgs)).toBe(false);
        });

        test('should skip repository if org is partially skipped and repo not included', () => {
            const skippedOrgs = {
                fullySkipped: [],
                partiallySkipped: {
                    'partial-org': ['included-repo']
                }
            };
            
            expect(analyzer.shouldSkipRepositoryByOrg('partial-org/other-repo', skippedOrgs)).toBe(true);
        });

        test('should not skip repository if org is partially skipped and repo is included', () => {
            const skippedOrgs = {
                fullySkipped: [],
                partiallySkipped: {
                    'partial-org': ['included-repo']
                }
            };
            
            expect(analyzer.shouldSkipRepositoryByOrg('partial-org/included-repo', skippedOrgs)).toBe(false);
        });

        test('should handle repository name without org prefix', () => {
            const skippedOrgs = {
                fullySkipped: ['some-org'],
                partiallySkipped: {}
            };
            
            // When repo name doesn't include /, orgName will be empty
            expect(analyzer.shouldSkipRepositoryByOrg('just-repo-name', skippedOrgs)).toBe(false);
        });
    });
});
