-- Crear atributos y TTL sin permitir una sesion intermedia sin vencimiento.
local ttl = tonumber(ARGV[4])
if not ttl or ttl < 1 or ttl ~= math.floor(ttl) then
    return redis.error_reply('TTL invalido')
end
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local t = redis.call('TIME')
local now = t[1] .. '.' .. string.format('%06d', tonumber(t[2]))
redis.call('HSET', KEYS[1],
    'sesion_id', ARGV[1], 'usuario_id', ARGV[2], 'dispositivo', ARGV[3],
    'estado_acceso', 'autorizado', 'rol', 'fan',
    'creada_en', now, 'ultima_actividad', now)
redis.call('EXPIRE', KEYS[1], ttl)
return 1
