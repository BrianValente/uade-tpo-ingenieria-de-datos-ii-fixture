# Modelo clave/valor

**Estado: pendiente de derivar de los patrones de acceso.**

Todavía no fijamos namespace, estructuras ni atributos. El diseño debe permitir localizar cada clave desde la entrada que conoce el consumidor.

Para una sesión podemos comparar Hash, que permite modificar campos, con String serializado, que permite guardar valor y TTL en un solo `SET`. La elección debe explicar cómo se crean y renuevan los atributos junto con su vencimiento.

La sesión debe identificar sesión, usuario, última actividad y estado de acceso. No necesita contener contraseñas ni tokens reales en la muestra.

Para cada clave debemos registrar: patrón que resuelve, prefijo, alcance, identificador, tipo Redis, atributos, operaciones y regla temporal. Un usuario puede tener varias sesiones; debemos decidir si lo permitimos antes de elegir el identificador.

Conservamos los identificadores del dato elegido en MongoDB o Neo4j. Esto permite localizar la copia sin cambiar los modelos anteriores. No implica conectar físicamente los servicios en este hito.
