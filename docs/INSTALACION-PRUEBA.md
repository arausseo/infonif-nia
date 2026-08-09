# Instalación en el entorno de prueba del cliente

Prueba de concepto: **Nia solo en `/bases-de-datos`**. No se toca ninguna otra
sección del portal.

Son dos piezas y van en dos máquinas distintas:

| Pieza | Dónde | Qué es |
|---|---|---|
| API de Nia | servidor **Fedora** | Node 22, escucha en `:3000` |
| Inclusión en el ASP | el IIS que ya existe | tres ficheros, ninguno nuevo en producción |

El widget **no se instala**: lo sirve el propio API en `/widget.js`, así que
desplegar el API mueve las dos cosas a la vez.

---

## 0. Antes de empezar: lo que hay que pedir

Sin esto no se puede arrancar. Conviene reclamarlo el primer día.

- [ ] **Clave de la API de Anthropic** (`ANTHROPIC_API_KEY`). La paga Infonif o
      Gedesco: hay que decidirlo antes, no el día del despliegue.
- [ ] **`apikey` de `bbdd-api.infonif.es`**. No es un secreto —viaja en el bundle
      público del buscador actual— pero hay que tenerla.
- [ ] **Una máquina Linux** alcanzable desde el IIS, con salida a internet
      (habla con `api.anthropic.com` y con `bbdd-api.infonif.es`).
- [ ] **Acceso al nginx** de `bbdd-api2.infonif.es`. **No hace falta DNS ni
      certificado nuevos**: Nia cuelga de un prefijo de ese host, que ya tiene
      HTTPS (paso 5). Sí hace falta HTTPS: el portal va por HTTPS y un navegador
      no deja que una página segura hable con un origen que no lo sea.
- [ ] **Quién toca el IIS.** Los cambios en el ASP son de tres ficheros, pero
      alguien con acceso tiene que aplicarlos.

Lo que **no** hace falta todavía: SQL Server (la prueba de concepto no lo usa) ni
Stripe (la compra es la fase 5).

---

## 1. La máquina del API (Fedora)

2 vCPU y 2 GB llegan de sobra para una demo. Solo hay una cosa que pida
más: regenerar los embeddings del CNAE, que necesita ~4 GB — y no hace falta
hacerlo, van versionados en el repositorio (ver paso 2).

```bash
# Node 22. Fedora 40+ ya lo trae; si no, NodeSource tiene repositorio RPM.
sudo dnf install -y nodejs npm redis git
node -v          # tiene que decir v22.x

# Si la versión del repo es anterior a la 22:
#   curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
#   sudo dnf install -y nodejs

# OJO: el servicio se llama `redis`, no `redis-server` como en Debian.
sudo systemctl enable --now redis
redis-cli ping   # PONG
```

Redis guarda las conversaciones, la caché del resumen y el catálogo de campos.
Es local: no hace falta exponerlo.

### 1.1 SELinux y firewalld

Esto es lo que más quebraderos da en Fedora y no existe en Debian. **Hazlo ahora,
no cuando algo falle sin decir por qué.**

```bash
# ¿Está activo?
getenforce        # normalmente: Enforcing
```

**Abrir el puerto 3000** para que el nginx y el IIS lleguen al servicio. Lo
suyo es limitarlo a las IP que de verdad lo necesitan, no abrirlo a la red:

```bash
sudo firewall-cmd --permanent --new-zone=nia 2>/dev/null || true
sudo firewall-cmd --permanent --zone=nia --add-source=192.168.210.0/24
sudo firewall-cmd --permanent --zone=nia --add-port=3000/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --zone=nia --list-all
```

**En la máquina del nginx** (que también es RHEL/Fedora — su
`ssl_ciphers PROFILE=SYSTEM` lo delata), SELinux bloquea por defecto que nginx
abra conexiones de salida. Como ya hace `proxy_pass` a `192.168.210.31:9000`,
seguramente esté puesto; conviene confirmarlo:

```bash
getsebool httpd_can_network_connect
# si dice --> off:
sudo setsebool -P httpd_can_network_connect 1
```

Sin eso, el `proxy_pass` a Nia da **502** y en el log de nginx aparece
«Permission denied» — que parece un problema de red y no lo es.

---

## 2. Desplegar el código

Se clona y se compila como root, y al final se cede la propiedad. Hacerlo «como
el usuario `nia`» no funciona: tiene `nologin` como shell y `sudo -u` la usa para
lanzar el comando.

```bash
sudo useradd -r -m -d /opt/nia -s /usr/sbin/nologin nia

# El código en /opt/nia/app. Con git clone si la máquina llega al repositorio;
# si no, cualquier copia sirve (ver 2.1).
cd /opt/nia/app

# pnpm. OJO: el RPM de Node de Fedora NO trae corepack, va en su propio
# paquete. `corepack: command not found` es esto, no que falte Node.
sudo npm install -g pnpm@11
#   alternativa:  sudo dnf install -y nodejs-corepack && sudo corepack enable
pnpm -v

sudo pnpm install --frozen-lockfile
sudo pnpm build

sudo chown -R nia:nia /opt/nia
```

**`sudo su nia` no funciona y no tiene que funcionar.** Ese usuario tiene
`nologin` como shell a propósito; «This account is currently not available» es la
respuesta correcta. Se compila como root y se cede la propiedad al final.

### 2.1 Si la máquina no llega al repositorio

Da igual cómo lleguen los ficheros mientras lleguen todos. El árbol de fuentes
sin `node_modules` ni compilados son **4,6 MB**:

```bash
# En una máquina que sí tenga el repositorio:
tar --exclude=node_modules --exclude=.git --exclude=dist \
    --exclude=dist-biblioteca --exclude=ds-bundle --exclude=.ds-sync \
    -czf nia.tgz -C /ruta/al/repo .

scp nia.tgz root@iciftools:/tmp/
```

```bash
# En Fedora:
sudo mkdir -p /opt/nia/app && sudo tar -xzf /tmp/nia.tgz -C /opt/nia/app
```

Y seguir con `pnpm install` normalmente. **Los embeddings del CNAE van dentro**
(`packages/semantica/artefactos/*.bin`, 1 MB): están versionados y no hay que
regenerarlos, así que esa parte del build no necesita red.

Lo que sí necesita red es `pnpm install`, que baja de `registry.npmjs.org`. Si
tampoco hay acceso ahí, hay que llevar el `node_modules` ya montado — y entonces
**tiene que compilarse en Linux**, no en Windows: `@huggingface/transformers`
trae binarios nativos por plataforma.

### 2.2 Los 477 MB del modelo semántico

`@huggingface/transformers` ocupa **477 MB** instalado y es, con diferencia, lo
más pesado de todo. Está declarado como **dependencia opcional** a propósito: si
falta, `prepararSemantica()` falla, el API se traga el error y `resolver_actividad`
sigue funcionando con los términos curados. Se pierde la resolución semántica de
sectores dichos de forma rara, no el producto.

Si el disco o el ancho de banda aprietan:

```bash
sudo pnpm install --frozen-lockfile --no-optional
```

Además, el modelo en sí (~120 MB) se descarga de `huggingface.co` **la primera
vez que hace falta**, no en el build. Si esa salida está cortada, el efecto es el
mismo: se registra `no se pudo cargar el modelo semántico` y se sigue con el
léxico. Conviene saberlo antes de la demo, no durante.

`pnpm build` compila el API y el widget, y **no regenera los embeddings** salvo
que hagan falta de verdad. Los vectores del CNAE van versionados en el
repositorio (1 MB), así que en un despliegue normal el paso se salta solo y el
build entero tarda unos segundos:

```
Los artefactos están al día; no se regenera nada.
```

Solo se rehacen si cambia el corpus, el modelo o las dimensiones — o si se pide
con `pnpm embeddings --forzar`. Y eso **necesita ~4 GB de memoria**: con menos, el
kernel mata el proceso a mitad y `pnpm` devuelve un escueto `Exit status 137`.
Para una demo no hay ningún motivo para tocarlo.

**El widget tiene que compilarse**: si `packages/widget/dist/widget.js` no
existe, el API arranca igual pero registra un error y el `<script>` del portal
dará 404.

Comprobación:

```bash
ls -la packages/widget/dist/widget.js    # ~167 KB
```

---

## 3. Configurar

```bash
sudo cp /opt/nia/app/.env.example /opt/nia/app/.env
sudo nano /opt/nia/app/.env
```

Lo que hay que rellenar para la prueba de concepto:

```ini
ANTHROPIC_API_KEY=sk-ant-...
INFONIF_API_KEY=...
REDIS_URL=redis://localhost:6379

# El secreto del puente. GENÉRALO, no lo escribas a mano:
#   openssl rand -hex 32
# Este mismo valor va en el IIS (paso 6). Si no coinciden, /internal/mint
# devuelve 403 y Nia funciona en modo anónimo sin decir por qué.
AGENT_SHARED_SECRET=<el que hayas generado>
TOKEN_TTL_SEGUNDOS=900

# De dónde se aceptan peticiones del navegador. Sin esto el widget carga pero
# la conversación falla con un error de CORS que en la consola parece otra cosa.
ORIGENES_PERMITIDOS=https://infonif.economia3.com

NODE_ENV=production
PUERTO=3000
LOG_NIVEL=info
```

Lo que se deja **vacío** en esta fase: `MSSQL_*`, `STRIPE_*`, `LANGFUSE_*`.

```bash
sudo chmod 600 /opt/nia/app/.env
sudo chown nia:nia /opt/nia/app/.env
```

---

## 4. Servicio systemd

`/etc/systemd/system/nia-api.service`:

```ini
[Unit]
Description=Nia API
After=network-online.target redis.service
Wants=network-online.target

[Service]
Type=simple
User=nia
WorkingDirectory=/opt/nia/app
EnvironmentFile=/opt/nia/app/.env
ExecStart=/usr/bin/node packages/api/dist/servidor.js
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/nia/app

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nia-api
sudo systemctl status nia-api
```

Comprobar:

```bash
curl -s localhost:3000/salud
curl -s localhost:3000/salud/dependencias | python3 -m json.tool
curl -sI localhost:3000/widget.js | head -3
```

`/salud/dependencias` tiene que decir `"ok": true` con `infonif.disponible` y
`redis.disponible` en `true`. El `cacheResumen` tarda unos 30 segundos en
llenarse tras el arranque: es normal que salga `"cargado": false` al principio.

---

## 5. Nginx: Nia en el dominio que ya existe

**No hay que dar de alta ningún DNS ni pedir certificado.** El bloque de 443 de
`/etc/nginx/conf.d/bbdd-api2.infonif.es.conf` tiene `server_name _;`, o sea que
ya atiende cualquier host que llegue con ese certificado. Nia cuelga de un
prefijo de ruta, igual que `/api/buscador` y `/api/infocif`, y queda en:

```
https://bbdd-api2.infonif.es/nia/
```

Se edita **ese fichero**, y no se toca nada de lo que ya hay dentro.

### 5.1 El upstream

Junto al `upstream buscador_api` que ya está, **fuera** de los bloques `server`:

```nginx
upstream nia_api {
    server 192.168.210.XX:3000;   # la máquina Fedora del paso 1
}
```

### 5.2 Los dos `location`

Dentro del `server { listen 443 ssl; ... }` que ya existe:

```nginx
    # /nia/internal/mint acuña un token para CUALQUIER usuario si conoces el
    # secreto. Este host SÍ está publicado en internet, así que se cierra aquí.
    # El IIS no pasa por este nginx para acuñar: va directo a la IP interna del
    # servicio (NIA_BASE_INTERNA en el include del ASP), y por eso cerrarlo no
    # rompe el puente de sesión.
    location /nia/internal/ {
        deny all;
        return 403;
    }

    location /nia/ {
        # La barra final del proxy_pass ES obligatoria: quita el prefijo /nia
        # antes de reenviar, así el API no necesita saber dónde está montado.
        #   /nia/v1/conversar  →  /v1/conversar
        # Sin ella, 404 en todo.
        proxy_pass http://nia_api/;

        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Server-Sent Events. Sin esto la respuesta llega de golpe al final y se
        # pierde justo lo que la demo tiene que enseñar: el progreso en vivo.
        # Los proxy_*_timeout ya están a 3600 a nivel de server.
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

### 5.3 Comprobar desde fuera

```bash
curl -s https://bbdd-api2.infonif.es/nia/salud
# {"ok":true,"servicio":"nia-api",...}

curl -sI https://bbdd-api2.infonif.es/nia/widget.js | head -3
# HTTP/2 200 · application/javascript

curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     https://bbdd-api2.infonif.es/nia/internal/mint
# 403 ← TIENE que dar esto
```

Ese último es el que importa. Si responde otra cosa, cualquiera desde internet
puede acuñar un token para cualquier usuario del portal.

Y que el streaming no se bufferice:

```bash
curl -N -s -X POST https://bbdd-api2.infonif.es/nia/v1/conversar \
     -H 'content-type: application/json' -d '{"mensaje":"hola"}'
```

Los eventos tienen que ir apareciendo poco a poco. Si salen todos juntos al
final, falta el `proxy_buffering off`.

### 5.4 Cuando Nia pase a producción

Entonces sí merece su propio `server` con su nombre y su certificado, aunque solo
sea para tener límites y logs separados. La forma sería la de siempre —un bloque
`server` con `server_name nia.infonif.es`, `location /` en vez de `location /nia/`
(y sin la barra final del `proxy_pass`, que ya no habría prefijo que quitar) y
`/internal/` restringido por IP en lugar de denegado del todo—. Para la prueba de
concepto no hace falta.

---

## 6. El IIS

Tres ficheros. Uno nuevo y dos modificados.

### 6.1 El secreto compartido

En `/includes/config.asp` (que no está en el repositorio, es donde viven los
secretos) o en el `Global.asa`:

```vbscript
Application("NIA_AGENT_SHARED_SECRET") = "<el mismo del paso 3>"
```

Tiene que ser **idéntico** al del `.env`. Si no coinciden, `/internal/mint`
devuelve 403, el token no se acuña y Nia sale en modo anónimo — sin error
visible, que es lo traicionero.

### 6.2 Subir el include

Copiar `bases-de-datos/includes/nia.asp` y ajustar las dos URLs de arriba:

```vbscript
NIA_BASE_INTERNA = "http://192.168.210.XX:3000"           ' la IP del paso 1
NIA_BASE_PUBLICA = "https://bbdd-api2.infonif.es/nia"     ' con el prefijo
```

`INTERNA` la usa el IIS para acuñar el token, servidor a servidor y **sin pasar
por nginx**. `PUBLICA` la usa el navegador. **No son la misma**, y confundirlas es
el fallo más probable de todo este documento.

Dos detalles de `PUBLICA`:

- Lleva **`/nia`**. Es el prefijo del paso 5.
- **No lleva barra final.** El widget concatena `/v1/conversar` detrás; con barra
  saldría `//v1/conversar`.

### 6.3 Las dos páginas

Ya están modificadas en el repositorio:

- `bases-de-datos/index.asp` — antes de `</body>`, con `NiaPosAbajo = 96` para
  no solaparse con el chat de Zendesk que ya flota en esa esquina.
- `bases-de-datos/herramienta/index.asp` — al final, con `NiaContexto = "listado"`.

---

## 7. Comprobar de punta a punta

1. Entrar en `https://infonif.economia3.com/bases-de-datos/herramienta/`
   **con sesión iniciada**.
2. Abajo a la derecha tiene que aparecer la píldora violeta **Nia · BETA**.
3. Abrirla y escribir: *«Panaderías en Madrid»*.
4. Tiene que verse: «Trabajando…» al instante, luego los pasos con sus
   resultados, luego la respuesta y una tarjeta con la cifra.
5. En `/bases-de-datos/` (la portada de la sección) comprobar que Nia y el chat
   de Zendesk **no se pisan**.

En el servidor, mientras tanto:

```bash
sudo journalctl -u nia-api -f
```

Al abrir la página tiene que aparecer una línea `token acuñado` con el
`usuarioId`. Si no sale, el problema está en el paso 6.1 o 6.2.

---

## 8. Cuando algo falla

| Síntoma | Dónde mirar |
|---|---|
| No aparece la píldora | ¿404 en `widget.js`? Casi siempre falta el `/nia` en `NIA_BASE_PUBLICA`, o sobra la barra final. Comprueba también que `packages/widget/dist/widget.js` exista en el servidor. |
| Todo da 404 bajo `/nia/` pero el servicio responde en su :3000 | Falta la barra final en `proxy_pass http://nia_api/;`. Sin ella nginx reenvía `/nia/v1/conversar` tal cual y el API no conoce esa ruta. |
| Aparece pero al enviar no pasa nada | Consola del navegador. Casi siempre es CORS: `ORIGENES_PERMITIDOS` tiene que llevar el origen exacto del portal, con `https://` y sin barra final. |
| Nia no reconoce al usuario | `journalctl` sin línea `token acuñado` → el secreto no coincide, o el IIS no llega a `NIA_BASE_INTERNA`. Pruébalo desde el propio IIS. |
| Los pasos salen todos de golpe al final | `proxy_buffering off` no está aplicado. Es el paso 5. |
| «no se pudo refrescar el catálogo» | La máquina no llega a `infonif.economia3.com`. No es fatal: usa la copia del repositorio, pero los precios pueden estar viejos (ADR-011). |
| El primer mensaje tarda 30 s | Normal solo tras arrancar, mientras se llena la caché del resumen. A partir de ahí es instantáneo. |
| 502 en nginx, «Permission denied» en su log | SELinux en la máquina del nginx: `sudo setsebool -P httpd_can_network_connect 1`. Parece un problema de red y no lo es. |
| El nginx o el IIS no alcanzan el :3000 | firewalld en la máquina de Nia. `sudo firewall-cmd --zone=nia --list-all` y comprueba que la IP de origen está en `sources`. |
| `systemctl status` dice «Permission denied» al arrancar | Falta el `chown -R nia:nia /opt/nia` del paso 2, o `.env` sigue siendo de root. |
| `Exit status 137` compilando | Es el OOM killer. Estás regenerando embeddings en una máquina que no da para ello. No hace falta: los artefactos van versionados. Compila con `pnpm -r build`, que se salta ese paso. |
| `corepack: command not found` | El RPM de Node de Fedora no lo trae. `sudo npm install -g pnpm@11`, o `sudo dnf install -y nodejs-corepack`. |
| `sudo su nia` → «This account is currently not available» | Correcto y esperado: ese usuario tiene `nologin`. No hay que entrar como él. |
| En el log: «no se pudo cargar el modelo semántico» | No es fatal. O se instaló con `--no-optional`, o la máquina no llega a `huggingface.co`. Nia sigue con los términos curados (ver 2.2). |

---

## 9. Lo que esta prueba de concepto NO lleva

Conviene decirlo antes de la demo, no durante:

- **No se compra nada.** `crear_intento_compra` es la fase 5. Nia cotiza y
  explica, pero no hay pasarela.
- **No lee la ficha de empresa.** Esa integración usa un objeto COM y una bandera
  de sesión del ASP; requiere un endpoint nuevo del lado de Infonif.
- **No hay trazas.** Langfuse está sin configurar. Para depurar, `journalctl`.
- **Solo `/bases-de-datos`.** Ninguna otra sección del portal se ha tocado.
