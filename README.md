# Reuniones Gecoas

Aplicación para gestionar reuniones, actas y tareas de los departamentos.

## Login de Google

La autenticación se realiza en el servidor mediante OAuth 2.0. En Google Cloud Console crea un cliente de tipo **Web application** y añade esta URL autorizada:

`https://reuniones.gecoas.es/auth/google/callback`

Configura las siguientes variables en el servidor, en un archivo `.env` que no se debe subir al repositorio:

```env
APP_URL=https://reuniones.gecoas.es
ADMIN_EMAIL=gbailly@alcaste-lasfuentes.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Solo se aceptan cuentas `@alcaste-lasfuentes.com`. La cuenta indicada en `ADMIN_EMAIL` obtiene permisos de administración.
