import { describe, it, expect } from 'vitest';
import { LruCache, cacheKey } from '../../src/cache/cache.js';

describe('LruCache', () => {
  it('stores and retrieves values', () => {
    const c = new LruCache<number>(3, 1000);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    expect(c.get('missing')).toBeUndefined();
  });

  it('evicts the least-recently-used entry beyond capacity', () => {
    const c = new LruCache<number>(2, 1000);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a'); // touch a → b is now LRU
    c.set('c', 3); // evicts b
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });

  it('expires entries after the TTL', () => {
    let now = 0;
    const c = new LruCache<number>(5, 100, () => now);
    c.set('a', 1);
    now = 50;
    expect(c.get('a')).toBe(1);
    now = 101;
    expect(c.get('a')).toBeUndefined();
  });

  it('produces stable, non-reversible keys', () => {
    const k1 = cacheKey('prompt', 'fp');
    const k2 = cacheKey('prompt', 'fp');
    expect(k1).toBe(k2);
    expect(k1).not.toContain('prompt');
    expect(cacheKey('other', 'fp')).not.toBe(k1);
  });
});
