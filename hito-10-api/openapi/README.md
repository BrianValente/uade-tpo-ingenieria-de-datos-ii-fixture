# Contrato generado

`openapi.yaml` se genera desde los esquemas de las rutas mediante
`pnpm openapi:export`, ejecutado en `hito-10-api/`.

No editar el YAML a mano. `pnpm openapi:check` compara el archivo versionado
con el contrato del servidor. Swagger UI lo expone en `/docs/yaml` y también
ofrece `/docs/json`.
