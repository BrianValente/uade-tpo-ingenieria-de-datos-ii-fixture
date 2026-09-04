const uuidCrypto = require("crypto");
const uuidNamespace = "d650d6d8-e518-5f7d-8917-7ff4cc50bc94";

/**
 * Genera un UUID v5 deterministico para una clave logica del dominio.
 *
 * UUID v5 combina un namespace fijo con `logicalKey`. Por eso una clave como
 * `equipo:ARG` siempre produce el mismo identificador. Los prefijos `equipo:`
 * y `jugador:` evitan colisiones entre tipos de entidad. SHA-1 forma parte del
 * estandar UUID v5; no se usa aqui como mecanismo de seguridad.
 *
 * @param {string} logicalKey Clave estable, por ejemplo `jugador:ARG:10`.
 * @returns {string} UUID v5 en formato canonico.
 */
function uuidV5(logicalKey) {
  const namespaceBytes = Buffer.from(uuidNamespace.replaceAll("-", ""), "hex");
  const hash = uuidCrypto
    .createHash("sha1")
    .update(Buffer.concat([namespaceBytes, Buffer.from(logicalKey, "utf8")]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hexadecimal = hash.subarray(0, 16).toString("hex");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}
