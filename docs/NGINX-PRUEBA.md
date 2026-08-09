# Nia sin DNS ni certificado propios

En el entorno de prueba no se puede dar de alta `nia-pruebas.infonif.es`. No hace
falta: el bloque 443 de `bbdd-api2.infonif.es.conf` tiene **`server_name _;`**, o
sea que ya atiende cualquier host que le llegue con ese certificado. Nia cuelga de
un prefijo de ruta, igual que `/api/buscador` y `/api/infocif`.

Queda en:

```
https://bbdd-api2.infonif.es/nia/
```

---

## Lo que hay que añadir

Dos bloques dentro del `server { listen 443 ssl; ... }` que ya existe. **No se
toca nada de lo que hay.**

```nginx
    # ── Nia ────────────────────────────────────────────────────────────────────
    upstream nia_api {
        server 192.168.210.XX:3000;   # la máquina donde corre el servicio
    }
```

(El `upstream` va **fuera** del `server`, junto a `buscador_api`.)

Y dentro del `server` de 443:

```nginx
    # /nia/internal/mint acuña un token para CUALQUIER usuario si conoces el
    # secreto. Este host SÍ está en internet, así que se cierra aquí y punto.
    # El IIS no pasa por aquí para acuñar: va directo a la IP interna del
    # servicio (NIA_BASE_INTERNA en el include del ASP).
    location /nia/internal/ {
        deny all;
        return 403;
    }

    location /nia/ {
        # La barra final del proxy_pass ES obligatoria: quita el prefijo /nia
        # antes de reenviar, así el API no necesita saber dónde está montado.
        #   /nia/v1/conversar  →  /v1/conversar
        proxy_pass http://nia_api/;

        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Server-Sent Events. Sin esto la respuesta llega de golpe al final y se
        # pierde justo lo que la demo tiene que enseñar: el progreso en vivo.
        # Los timeouts ya están puestos a 3600 a nivel de server.
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
```

nginx elige la ubicación por prefijo más largo, así que `/nia/internal/` gana a
`/nia/` y el bloqueo se aplica de verdad.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**SELinux.** Esa máquina es de la familia RHEL (su `ssl_ciphers PROFILE=SYSTEM`
lo delata) y por defecto SELinux no deja que nginx abra conexiones de salida.
Como ya hace `proxy_pass` a `192.168.210.31:9000` seguramente esté puesto, pero
si el bloque nuevo da **502** con «Permission denied» en el log, es esto:

```bash
getsebool httpd_can_network_connect
sudo setsebool -P httpd_can_network_connect 1
```

---

## Comprobar

Desde fuera:

```bash
curl -s https://bbdd-api2.infonif.es/nia/salud
# {"ok":true,"servicio":"nia-api",...}

curl -sI https://bbdd-api2.infonif.es/nia/widget.js | head -3
# HTTP/2 200 · application/javascript

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     https://bbdd-api2.infonif.es/nia/internal/mint
# 403 ← TIENE que dar esto
```

Ese último es el que importa. Si responde otra cosa, el puente de sesión está
abierto a internet y cualquiera puede acuñar un token para cualquier usuario.

Y que el streaming no se bufferice:

```bash
curl -N -s -X POST https://bbdd-api2.infonif.es/nia/v1/conversar \
     -H 'content-type: application/json' \
     -d '{"mensaje":"hola"}'
```

Los eventos tienen que ir apareciendo. Si salen todos juntos al final, falta el
`proxy_buffering off`.

---

## Lo que cambia en el resto de la instalación

Respecto a [INSTALACION-PRUEBA.md](INSTALACION-PRUEBA.md):

**Paso 3, el `.env`:**

```ini
ORIGENES_PERMITIDOS=https://infonif.economia3.com
```

Sin cambios — el origen es el del portal, no el del API.

**Paso 5, nginx:** se sustituye por este documento. No hay bloque `server` nuevo
ni certificado nuevo.

**Paso 6.2, el include del ASP:**

```vbscript
NIA_BASE_INTERNA = "http://192.168.210.XX:3000"           ' directo, sin nginx
NIA_BASE_PUBLICA = "https://bbdd-api2.infonif.es/nia"     ' con el prefijo
```

`NIA_BASE_PUBLICA` **lleva `/nia` y no lleva barra final**. El widget concatena
`/v1/conversar` detrás; con barra final saldría `//v1/conversar`.

El IIS acuña el token yendo **directo a la IP interna**, sin pasar por este
nginx — que es justo por lo que se puede cerrar `/nia/internal/` sin romper nada.

---

## Dos cosas que vi en tu configuración

**El nombre del redirect no coincide con el del certificado.** El bloque de 80
dice:

```nginx
server_name bbdd2-api.infonif.es;
```

pero el certificado está en `/var/www/conf.d/certs/bbdd-api2.infonif.es/`. Son
dos nombres distintos: `bbdd2-api` y `bbdd-api2`. Si el real es el del
certificado, ese `return 301` no se dispara nunca para él —lo recoge el bloque
por defecto, si lo hay— y una petición en claro no se redirige. No afecta a Nia,
pero conviene mirarlo.

**`server_name _;` en el 443 es lo que hace que esto funcione**, y también
significa que ese bloque atiende cualquier nombre que resuelva a esa IP. Está
bien para la prueba. Cuando Nia pase a producción, merece su propio `server` con
su nombre, aunque solo sea para poder darle límites y logs propios.
