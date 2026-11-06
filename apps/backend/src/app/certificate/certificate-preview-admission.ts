// Reserve space before BullMQ's separate add command. A short-lived
// reservation also covers duplicate requests arriving before that add.
export const RESERVE_CERTIFICATE_PREVIEW = `
local health, cooldown, budget, reservations, waiting, active, paused = unpack(KEYS)
local revision, jobPrefix = ARGV[1], ARGV[2]
local time = redis.call('TIME')
local now = time[1] * 1000 + math.floor(time[2] / 1000)

redis.call('ZREMRANGEBYSCORE', reservations, '-inf', now)
if redis.call('ZSCORE', reservations, revision) then
  return 2
end

if redis.call('EXISTS', health) == 0 or redis.call('EXISTS', cooldown) == 1 then
  return 0
end

local queued = redis.call('LLEN', waiting) + redis.call('LLEN', active) + redis.call('LLEN', paused)
for _, reserved in ipairs(redis.call('ZRANGE', reservations, 0, -1)) do
  if redis.call('EXISTS', jobPrefix .. reserved) == 0 then
    queued = queued + 1
  end
end
if queued >= 3 then
  redis.call('SET', cooldown, '1', 'PX', 30000)
  return 0
end

if tonumber(redis.call('GET', budget) or '0') >= 12 then
  return 0
end
if redis.call('INCR', budget) == 1 then
  redis.call('PEXPIRE', budget, 60000)
end

redis.call('ZADD', reservations, now + 30000, revision)
redis.call('PEXPIRE', reservations, 30000)
return 1
`;
