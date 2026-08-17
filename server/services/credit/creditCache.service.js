/**
 * CreditBalanceCache Interface & In-Memory Implementation
 *
 * Provides a modular cache abstraction for high-throughput balance queries.
 * IMPORTANT: The cache is strictly an accelerator. MongoDB remains the
 * authoritative source of truth.
 *
 * Future scalability: This class can be swapped with a RedisBalanceCache
 * without modifying domain service logic.
 */
class CreditBalanceCache {
  constructor(ttlMs = 5000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached balance object
   * @param {string} accountId
   * @returns {Object|null}
   */
  getBalance(accountId) {
    const entry = this.cache.get(accountId);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(accountId);
      return null;
    }
    return entry.balance;
  }

  /**
   * Set cached balance object with TTL
   * @param {string} accountId
   * @param {Object} balance
   */
  setBalance(accountId, balance) {
    this.cache.set(accountId, {
      balance: { ...balance },
      expiry: Date.now() + this.ttlMs,
    });
    // Keep memory cache bounded
    if (this.cache.size > 2000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Invalidate cache entry on account mutation
   * @param {string} accountId
   */
  invalidate(accountId) {
    this.cache.delete(accountId);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }
}

const creditCache = new CreditBalanceCache();

module.exports = creditCache;
