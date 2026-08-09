# Instalación en el entorno de prueba del cliente

Prueba de concepto: **Nia solo en `/bases-de-datos`**. No se toca ninguna otra
sección del portal.

Son dos piezas y van en dos máquinas distintas:

| Pieza | Dónde | Qué es |
|---|---|---|
| API de Nia | servidor Linux (Debian 12) | Node 22, escucha en `:3000` |
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
- [ ] **HTTPS para el API.** El portal va por HTTPS y un navegador no deja que
      una página segura hable con un origen que no lo sea. En el entorno de
      prueba del cliente **no hace falta DNS ni certificado nuevos**: Nia cuelga
      de un prefijo del host que ya existe — ver [NGINX-PRUEBA.md](NGINX-PRUEBA.md).
- [ ] **Quién toca el IIS.** Los cambios en el ASP son de tres ficheros, pero
      alguien con acceso tiene que aplicarlos.

Lo que **no** hace falta todavía: SQL Server (la prueba de concepto no lo usa) ni
Stripe (la compra es la fase 5).

---

## 1. La máquina del API

Debian 12, 2 vCPU y 2 GB llegan de sobra para una demo.

```bash
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs redis-server git
sudo systemctl enable --now redis-server

node -v    # debe decir v22.x
redis-cli ping    # PONG
```

Redis guarda las conversaciones, la caché del resumen y el catálogo de campos.
Es local: no hace falta exponerlo.

---

## 2. Desplegar el código

```bash
sudo useradd -r -m -d /opt/nia -s /usr/sbin/nologin nia
sudo -u nia git clone <URL-DEL-REPO> /opt/nia/app
cd /opt/nia/app

sudo -u nia npm install -g pnpm@11
sudo -u nia pnpm install --frozen-lockfile
sudo -u nia pnpm build
```

`pnpm build` hace tres cosas: genera los embeddings del CNAE (tarda unos minutos
la primera vez, se baja un modelo de ~120 MB), compila el API y compila el
widget. **El widget tiene que compilarse**: si `packages/widget/dist/widget.js`
no existe, el API arranca igual pero registra un error y el `<script>` del portal
dará 404.

Comprobación:

```bash
ls -la packages/widget/dist/widget.js    # ~167 KB
```

---

## 3. Configurar

```bash
sudo -u nia cp .env.example /opt/nia/app/.env
sudo -u nia nano /opt/nia/app/.env
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
After=network-online.target redis-server.service
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

## 5. Nginx delante

> **En el entorno de prueba del cliente esta sección NO aplica.** No hay DNS ni
> certificado propios para Nia; cuelga de un prefijo del host que ya existe.
> Ver [NGINX-PRUEBA.md](NGINX-PRUEBA.md). Lo de abajo es la topología de
> producción, con nombre propio.

Hace tres cosas: pone el HTTPS, **cierra `/internal/` al exterior** y deja pasar
el streaming sin bufferizarlo.

`/etc/nginx/sites-available/nia`:

```nginx
server {
    listen 443 ssl http2;
    server_name nia-pruebas.infonif.es;

    ssl_certificate     /etc/letsencrypt/live/nia-pruebas.infonif.es/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nia-pruebas.infonif.es/privkey.pem;

    # /internal/mint acuña tokens para CUALQUIER usuario si conoces el secreto.
    # No puede ser alcanzable desde internet. Ajusta el rango al del IIS.
    location /internal/ {
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny  all;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Server-Sent Events. Sin esto la respuesta llega de golpe al final y
        # se pierde justamente lo que se quiere enseñar: el progreso en vivo.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nia /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Comprobar desde **fuera**:

```bash
curl -s https://nia-pruebas.infonif.es/salud
curl -sI https://nia-pruebas.infonif.es/widget.js | head -3
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     https://nia-pruebas.infonif.es/internal/mint     # tiene que dar 403
```

Ese último **tiene que fallar**. Si responde, el puente está abierto a internet.

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
NIA_BASE_INTERNA = "http://<ip-de-la-maquina>:3000"   ' o 127.0.0.1 si es local
NIA_BASE_PUBLICA = "https://nia-pruebas.infonif.es"
```

`INTERNA` la usa el servidor para acuñar; `PUBLICA` la usa el navegador. **No son
la misma** y confundirlas es el fallo más probable de todo este documento.

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
| No aparece la píldora | ¿404 en `widget.js`? Comprueba `NIA_BASE_PUBLICA` y que `packages/widget/dist/widget.js` exista en el servidor. |
| Aparece pero al enviar no pasa nada | Consola del navegador. Casi siempre es CORS: `ORIGENES_PERMITIDOS` tiene que llevar el origen exacto del portal, con `https://` y sin barra final. |
| Nia no reconoce al usuario | `journalctl` sin línea `token acuñado` → el secreto no coincide, o el IIS no llega a `NIA_BASE_INTERNA`. Pruébalo desde el propio IIS. |
| Los pasos salen todos de golpe al final | `proxy_buffering off` no está aplicado. Es el paso 5. |
| «no se pudo refrescar el catálogo» | La máquina no llega a `infonif.economia3.com`. No es fatal: usa la copia del repositorio, pero los precios pueden estar viejos (ADR-011). |
| El primer mensaje tarda 30 s | Normal solo tras arrancar, mientras se llena la caché del resumen. A partir de ahí es instantáneo. |

---

## 9. Lo que esta prueba de concepto NO lleva

Conviene decirlo antes de la demo, no durante:

- **No se compra nada.** `crear_intento_compra` es la fase 5. Nia cotiza y
  explica, pero no hay pasarela.
- **No lee la ficha de empresa.** Esa integración usa un objeto COM y una bandera
  de sesión del ASP; requiere un endpoint nuevo del lado de Infonif.
- **No hay trazas.** Langfuse está sin configurar. Para depurar, `journalctl`.
- **Solo `/bases-de-datos`.** Ninguna otra sección del portal se ha tocado.
