import { jest } from '@jest/globals';
import { GitHubPRAnalyzer } from '../src/pr-analyzer.js';

describe('GitHubPRAnalyzer - API Retry Mechanism', () => {
    let analyzer;
    
    beforeEach(() => {
        analyzer = new GitHubPRAnalyzer('test_token', 'test_owner', 'test_repo');
        
        // Mock the sleep function to speed up tests
        jest.spyOn(analyzer, '_sleep').mockImplementation(() => Promise.resolve());
    });

    describe('_shouldRetryError', () => {
        test('should retry on network errors (no response)', () => {
            const error = new Error('Network Error');
            expect(analyzer._shouldRetryError(error)).toBe(true);
        });

        test('should retry on 429 rate limit', () => {
            const error = { response: { status: 429 } };
            expect(analyzer._shouldRetryError(error)).toBe(true);
        });

        test('should retry on 5xx server errors', () => {
            const serverErrors = [500, 502, 503, 504];
            serverErrors.forEach(status => {
                const error = { response: { status } };
                expect(analyzer._shouldRetryError(error)).toBe(true);
            });
        });

        test('should retry on 408 timeout', () => {
            const error = { response: { status: 408 } };
            expect(analyzer._shouldRetryError(error)).toBe(true);
        });

        test('should retry on 409 conflict', () => {
            const error = { response: { status: 409 } };
            expect(analyzer._shouldRetryError(error)).toBe(true);
        });

        test('should not retry on 404 not found', () => {
            const error = { response: { status: 404 } };
            expect(analyzer._shouldRetryError(error)).toBe(false);
        });

        test('should not retry on 403 forbidden', () => {
            const error = { response: { status: 403 } };
            expect(analyzer._shouldRetryError(error)).toBe(false);
        });

        test('should not retry on 401 unauthorized', () => {
            const error = { response: { status: 401 } };
            expect(analyzer._shouldRetryError(error)).toBe(false);
        });
    });

    describe('_handleRateLimit', () => {
        test('should calculate wait time from x-ratelimit-reset header', async () => {
            const futureTimestamp = Math.floor(Date.now() / 1000) + 60; // 60 seconds from now
            const error = {
                response: {
                    headers: {
                        'x-ratelimit-remaining': '0',
                        'x-ratelimit-reset': futureTimestamp.toString()
                    }
                }
            };
            
            const waitTime = await analyzer._handleRateLimit(error, 'test');
            
            // Should be around 61000ms (60s + 1s buffer)
            expect(waitTime).toBeGreaterThan(50000);
            expect(waitTime).toBeLessThan(70000);
        });

        test('should use retry-after header when present', async () => {
            const error = {
                response: {
                    headers: {
                        'retry-after': '30'
                    }
                }
            };
            
            const waitTime = await analyzer._handleRateLimit(error, 'test');
            expect(waitTime).toBe(30000); // 30 seconds in milliseconds
        });

        test('should cap wait time at 5 minutes', async () => {
            const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
            const error = {
                response: {
                    headers: {
                        'x-ratelimit-reset': futureTimestamp.toString()
                    }
                }
            };
            
            const waitTime = await analyzer._handleRateLimit(error, 'test');
            expect(waitTime).toBe(300000); // 5 minutes max
        });

        test('should return default wait time when no headers present', async () => {
            const error = {
                response: {
                    headers: {}
                }
            };
            
            const waitTime = await analyzer._handleRateLimit(error, 'test');
            expect(waitTime).toBe(60000); // 1 minute default
        });
    });

    describe('_makeApiRequestWithRetry', () => {
        test('should return response on successful request', async () => {
            const mockResponse = { data: { test: 'data' } };
            const requestFn = jest.fn().mockResolvedValue(mockResponse);
            
            const result = await analyzer._makeApiRequestWithRetry(requestFn, 'test');
            
            expect(result).toBe(mockResponse.data);
            expect(requestFn).toHaveBeenCalledTimes(1);
        });

        test('should retry on retryable error and succeed', async () => {
            const mockResponse = { data: { test: 'data' } };
            const requestFn = jest.fn()
                .mockRejectedValueOnce({ response: { status: 500 } })
                .mockResolvedValue(mockResponse);
            
            const result = await analyzer._makeApiRequestWithRetry(requestFn, 'test');
            
            expect(result).toBe(mockResponse.data);
            expect(requestFn).toHaveBeenCalledTimes(2);
            expect(analyzer._sleep).toHaveBeenCalledTimes(1);
        });

        test('should not retry on non-retryable error', async () => {
            const error = { response: { status: 404 } };
            const requestFn = jest.fn().mockRejectedValue(error);
            
            await expect(analyzer._makeApiRequestWithRetry(requestFn, 'test')).rejects.toBe(error);
            
            expect(requestFn).toHaveBeenCalledTimes(1);
            expect(analyzer._sleep).not.toHaveBeenCalled();
        });

        test('should exhaust all retries and throw last error', async () => {
            const error = { response: { status: 500 } };
            const requestFn = jest.fn().mockRejectedValue(error);
            
            await expect(analyzer._makeApiRequestWithRetry(requestFn, 'test', 2)).rejects.toBe(error);
            
            expect(requestFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
            expect(analyzer._sleep).toHaveBeenCalledTimes(2);
        });

        test('should handle rate limit with custom wait time', async () => {
            const mockResponse = { data: { test: 'data' } };
            const rateError = {
                response: {
                    status: 429,
                    headers: { 'retry-after': '2' }
                }
            };
            
            const requestFn = jest.fn()
                .mockRejectedValueOnce(rateError)
                .mockResolvedValue(mockResponse);
            
            const result = await analyzer._makeApiRequestWithRetry(requestFn, 'test');
            
            expect(result).toBe(mockResponse.data);
            expect(requestFn).toHaveBeenCalledTimes(2);
            expect(analyzer._sleep).toHaveBeenCalledTimes(1);
        });
    });

    describe('Exponential backoff behavior', () => {
        test('should increase delay with each retry attempt', async () => {
            const error = { response: { status: 500 } };
            const requestFn = jest.fn().mockRejectedValue(error);
            
            // Restore the original _sleep to check actual delay values
            analyzer._sleep.mockRestore();
            const sleepSpy = jest.spyOn(analyzer, '_sleep').mockImplementation((ms) => {
                // Just resolve immediately but capture the delay
                return Promise.resolve();
            });
            
            await expect(analyzer._makeApiRequestWithRetry(requestFn, 'test', 2)).rejects.toBe(error);
            
            // Check that delays increase exponentially (with jitter)
            const calls = sleepSpy.mock.calls;
            expect(calls.length).toBe(2);
            
            // First retry should be around 1000ms + jitter
            expect(calls[0][0]).toBeGreaterThan(900);
            expect(calls[0][0]).toBeLessThan(1200);
            
            // Second retry should be around 2000ms + jitter
            expect(calls[1][0]).toBeGreaterThan(1800);
            expect(calls[1][0]).toBeLessThan(2400);
        });
    });
});