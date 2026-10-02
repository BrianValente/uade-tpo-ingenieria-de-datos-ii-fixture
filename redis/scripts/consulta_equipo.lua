-- Un Sorted Set sirve a la vez como contador por equipo y ranking por hora.
-- La clave vence al final de la hora, no una hora despues de cada consulta.
local fin = tonumber(ARGV[2])
if not fin or fin ~= math.floor(fin) then
    return redis.error_reply('Fin de ventana invalido')
end
local now = tonumber(redis.call('TIME')[1])
if now >= fin then return false end
local score = redis.call('ZINCRBY', KEYS[1], 1, ARGV[1])
redis.call('EXPIREAT', KEYS[1], fin)
return score
