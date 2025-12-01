import { jest } from '@jest/globals';
import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';

describe('GitHubPRAnalyzer - Integration tests with retry', () => {
    let analyzer;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
        
        // Mock the sleep function to speed up tests
        jest.spyOn(analyzer, '_sleep').mockImplementation(() => Promise.resolve());
    });

    test('should handle network errors with retries in real method calls', async () => {
        // Mock the axios instance to simulate network errors then success
        const mockGetMethod = jest.fn()
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockRejectedValueOnce(new Error('Connection timeout'))
            .mockResolvedValue({ data: [] });
        
        analyzer.api.get = mockGetMethod;
        
        const result = await analyzer.getPRReviews('test/repo', 123);
        
        // Should succeed on third attempt and return empty array
        expect(result).toEqual([]);
        expect(mockGetMethod).toHaveBeenCalledTimes(3);
        expect(analyzer._sleep).toHaveBeenCalledTimes(2);
    });

    test('should respect cache and not retry when data is cached', async () => {
        // First, cache some data
        analyzer.cache.set('reviews_test/repo_123', [{ id: 1, user: { login: 'test' } }]);
        
        // Mock to verify no API call is made
        const mockGetMethod = jest.fn();
        analyzer.api.get = mockGetMethod;
        
        const result = await analyzer.getPRReviews('test/repo', 123);
        
        // Should return cached data without making API call
        expect(result).toEqual([{ id: 1, user: { login: 'test' } }]);
        expect(mockGetMethod).not.toHaveBeenCalled();
        expect(analyzer._sleep).not.toHaveBeenCalled();
    });

    test('should handle rate limiting correctly in real method calls', async () => {
        const rateLimitError = {
            response: {
                status: 429,
                headers: {
                    'x-ratelimit-remaining': '0',
                    'retry-after': '1'
                }
            }
        };
        
        const mockGetMethod = jest.fn()
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue({ data: [{ id: 1 }] });
        
        analyzer.api.get = mockGetMethod;
        
        const result = await analyzer.getPRCommits('test/repo', 456);
        
        // Should succeed after rate limit wait
        expect(result).toEqual([{ id: 1 }]);
        expect(mockGetMethod).toHaveBeenCalledTimes(2);
        expect(analyzer._sleep).toHaveBeenCalledTimes(1);
        // Should have waited for 1 second (1000ms) based on retry-after header
        expect(analyzer._sleep).toHaveBeenCalledWith(1000);
    });

    test('should not retry on 404 errors and return appropriate response', async () => {
        const notFoundError = {
            response: { status: 404 },
            message: 'Not Found'
        };
        
        const mockGetMethod = jest.fn().mockRejectedValue(notFoundError);
        analyzer.api.get = mockGetMethod;
        
        // Mock console.log to suppress warning
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        
        const result = await analyzer.getRepositoryPullRequests('test/repo', new Date());
        
        // Should return empty array for 404 without retry
        expect(result).toEqual([]);
        expect(mockGetMethod).toHaveBeenCalledTimes(1);
        expect(analyzer._sleep).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Repository test/repo not found or not accessible');
        
        consoleSpy.mockRestore();
    });

    test('should retry on 500 errors and fail after max retries', async () => {
        const serverError = {
            response: { status: 500 },
            message: 'Internal Server Error'
        };
        
        const mockGetMethod = jest.fn().mockRejectedValue(serverError);
        analyzer.api.get = mockGetMethod;
        
        await expect(analyzer.getUserRepositories()).rejects.toThrow('Failed to fetch repositories for test_owner: Internal Server Error');
        
        // Should have tried 4 times (initial + 3 retries)
        expect(mockGetMethod).toHaveBeenCalledTimes(4);
        expect(analyzer._sleep).toHaveBeenCalledTimes(3);
    });
});