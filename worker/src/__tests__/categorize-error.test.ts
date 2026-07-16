import { describe, it, expect } from 'vitest';
import { categorizeError } from '../pipeline/categorize-error';

describe('categorizeError', () => {
  it('returns AI_PROVIDER_TIMEOUT for ECONNABORTED', () => {
    const error = { code: 'ECONNABORTED', message: 'timeout' };
    const result = categorizeError(error);
    expect(result.code).toBe('AI_PROVIDER_TIMEOUT');
    expect(result.message).toContain('timed out');
  });

  it('returns AI_PROVIDER_TIMEOUT for ETIMEDOUT', () => {
    const error = { code: 'ETIMEDOUT', message: 'timeout' };
    const result = categorizeError(error);
    expect(result.code).toBe('AI_PROVIDER_TIMEOUT');
  });

  it('returns AI_PROVIDER_RATE_LIMITED for 429 status', () => {
    const error = { response: { status: 429 }, message: 'rate limited' };
    const result = categorizeError(error);
    expect(result.code).toBe('AI_PROVIDER_RATE_LIMITED');
    expect(result.message).toContain('rate limited');
  });

  it('returns AI_PROVIDER_ERROR for 5xx status', () => {
    const error = { response: { status: 502 }, message: 'bad gateway' };
    const result = categorizeError(error);
    expect(result.code).toBe('AI_PROVIDER_ERROR');
    expect(result.message).toContain('502');
  });

  it('returns NETWORK_ERROR for DNS resolution failure (ENOTFOUND)', () => {
    const error = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api-inference.huggingface.co' };
    const result = categorizeError(error);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.message).toContain('network or DNS');
  });

  it('returns NETWORK_ERROR for EAI_AGAIN', () => {
    const error = { code: 'EAI_AGAIN', message: 'temporary failure in name resolution' };
    const result = categorizeError(error);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('returns NETWORK_ERROR for connection refused', () => {
    const error = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
    const result = categorizeError(error);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('returns INVALID_FILE for ENOENT', () => {
    const error = { code: 'ENOENT', message: 'file not found' };
    const result = categorizeError(error);
    expect(result.code).toBe('INVALID_FILE');
    expect(result.message).toContain('Could not read');
  });

  it('returns INVALID_FILE for sharp input errors', () => {
    const error = { message: 'Input file is missing or unreadable' };
    const result = categorizeError(error);
    expect(result.code).toBe('INVALID_FILE');
  });

  it('returns INTERNAL_ERROR for unknown errors', () => {
    const error = { message: 'something broke' };
    const result = categorizeError(error);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('something broke');
  });

  it('returns INTERNAL_ERROR for non-object errors', () => {
    const result = categorizeError('string error');
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toContain('Unexpected');
  });

  it('returns INTERNAL_ERROR for null', () => {
    const result = categorizeError(null);
    expect(result.code).toBe('INTERNAL_ERROR');
  });

  it('returns NETWORK_ERROR for wrapped HuggingFace all hosts unreachable error with code property', () => {
    const error = new Error('HuggingFace request failed (ENOTFOUND): all inference hosts unreachable');
    (error as any).code = 'ENOTFOUND';
    const result = categorizeError(error);
    expect(result.code).toBe('NETWORK_ERROR');
  });
});
