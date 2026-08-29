# Fixture 2030

Repositorio del TPO de Ingeniería de Datos II. Por ahora contiene una instancia local de MongoDB para desarrollar el módulo documental de equipos y jugadores.

## Requisitos

- Docker con Docker Compose.
- MongoDB Compass o `mongosh` son opcionales.

## Inicio

1. Crear el archivo local de variables:

   ```bash
   cp .env.example .env
   ```

2. Cambiar `MONGO_ROOT_PASSWORD` en `.env`.

3. Iniciar MongoDB:

   ```bash
   docker compose up -d
   ```

4. Comprobar el estado:

   ```bash
   docker compose ps
   ```

El servicio está listo cuando su estado muestra `healthy`.

En la primera ejecución con un volumen nuevo, el script de inicialización crea la base configurada en `MONGO_DATABASE` y las colecciones vacías `equipos` y `jugadores`.

## Conexión

MongoDB escucha solamente en `localhost`. La URI para MongoDB Compass es:

```text
mongodb://admin:<password>@localhost:27017/?authSource=admin
```

Reemplazar `admin`, `<password>` y el puerto si se modificaron en `.env`.

Para abrir `mongosh` dentro del contenedor sin escribir la contraseña en el historial:

```bash
docker compose exec mongodb mongosh \
  --username admin \
  --authenticationDatabase admin \
  --password
```

## Detención

```bash
docker compose down
```

Este comando conserva el volumen `mongodb_data`. No eliminar el volumen salvo que se quiera borrar toda la información local.
