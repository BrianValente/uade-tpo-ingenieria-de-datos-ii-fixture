-- Consultar o renovar solo una sesion vigente. Nunca crearla por actividad.
local ttl = tonumber(ARGV[2])
if not ttl or ttl < 1 or ttl ~= math.floor(ttl) then
    return redis.error_reply('TTL invalido')
end
if redis.call('PTTL', KEYS[1]) <= 0 then return {} end
if redis.call('HGET', KEYS[1], 'estado_acceso') ~= 'autorizado' then return {} end
if ARGV[1] == 'renovar' then
    local t = redis.call('TIME')
    local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
    redis.call('HSET', KEYS[1], 'ultima_actividad', now)
    redis.call('EXPIRE', KEYS[1], ttl)
end
return redis.call('HGETALL', KEYS[1])
