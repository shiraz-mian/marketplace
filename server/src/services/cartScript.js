// One Redis hash is changed atomically. Metadata fields start with an underscore.
const CART_MUTATION_SCRIPT = `
local key = KEYS[1]
local action, id, amount, stock = ARGV[1], ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4])
local expected, revision, operation = ARGV[5], ARGV[6], ARGV[7]
local ttl, maxItems, maxQuantity, historyLimit = tonumber(ARGV[8]), tonumber(ARGV[9]), tonumber(ARGV[10]), tonumber(ARGV[11])
local current = redis.call('HGET', key, '_version') or '0'
local history = cjson.decode(redis.call('HGET', key, '_operations') or '[]')
local fingerprint = id .. ':' .. ARGV[3]
if action == 'add' then
  for _, entry in ipairs(history) do
    if entry.id == operation then
      if entry.fingerprint ~= fingerprint then return {'IDEMPOTENCY_CONFLICT'} end
      return {'OK', redis.call('HGETALL', key)}
    end
  end
elseif expected ~= current then return {'CART_CHANGED'} end
local oldQuantity = tonumber(redis.call('HGET', key, id) or '0')
if action == 'add' or action == 'set' then
  if action == 'set' and oldQuantity == 0 then return {'CART_ITEM_NOT_FOUND'} end
  local quantity = action == 'add' and oldQuantity + amount or amount
  if quantity > stock or quantity > maxQuantity then return {'CART_STOCK_LIMIT'} end
  if quantity < 1 then return {'CART_STOCK_LIMIT'} end
  if oldQuantity == 0 then
    local count = 0
    for _, field in ipairs(redis.call('HKEYS', key)) do
      if string.sub(field, 1, 1) ~= '_' then count = count + 1 end
    end
    if count >= maxItems then return {'CART_FULL'} end
  end
  redis.call('HSET', key, id, quantity)
elseif action == 'remove' then redis.call('HDEL', key, id)
elseif action == 'clear' then
  for _, field in ipairs(redis.call('HKEYS', key)) do
    if string.sub(field, 1, 1) ~= '_' then redis.call('HDEL', key, field) end
  end
else return {'INVALID_CART_ACTION'} end
if action == 'add' then
  table.insert(history, {id = operation, fingerprint = fingerprint})
  while #history > historyLimit do table.remove(history, 1) end
  redis.call('HSET', key, '_operations', cjson.encode(history))
end
redis.call('HSET', key, '_version', revision)
redis.call('EXPIRE', key, ttl)
return {'OK', redis.call('HGETALL', key)}
`;

export { CART_MUTATION_SCRIPT };
