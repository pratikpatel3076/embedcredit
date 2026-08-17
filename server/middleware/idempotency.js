const idempotencyCache = new Map();

function idempotency(req, res, next) {
  const key = req.headers["idempotency-key"];
  if (!key) return next();

  if (idempotencyCache.has(key)) {
    const cached = idempotencyCache.get(key);
    res.setHeader("X-Cache", "HIT");
    return res.status(cached.status).json(cached.body);
  }

  // Intercept json response to cache
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(key, { status: res.statusCode, body });
      // Keep cache size bounded (max 500 entries)
      if (idempotencyCache.size > 500) {
        const firstKey = idempotencyCache.keys().next().value;
        idempotencyCache.delete(firstKey);
      }
    }
    return originalJson(body);
  };

  next();
}

module.exports = { idempotency };
