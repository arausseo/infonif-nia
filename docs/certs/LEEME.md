# Por qué hay un certificado aquí

`bbdd-api.infonif.es` **sirve su cadena TLS incompleta**: manda solo su propio
certificado y se deja fuera el intermedio que lo firma. Comprobado 12 veces
seguidas, siempre igual:

```
openssl s_client -connect bbdd-api.infonif.es:443 -servername bbdd-api.infonif.es
  → Verify return code: 21 (unable to verify the first certificate)
```

Los navegadores lo disimulan porque se descargan el intermedio por su cuenta
(AIA) y lo cachean. **Node no hace eso**, así que falla — y falla de la peor
manera posible, porque en Windows suele funcionar (el sistema tiene el intermedio
cacheado de alguna visita previa) y en un Linux recién instalado no. El síntoma
es un `fetch failed` que parece de red y es de certificado:

```
UNABLE_TO_VERIFY_LEAF_SIGNATURE unable to verify the first certificate
```

`sectigo-r36.pem` es ese intermedio que falta: **Sectigo Public Server
Authentication CA DV R36**, válido hasta marzo de 2036. Se descargó del sitio
público de Sectigo, el que anuncia el propio certificado del servidor:

```
http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
```

No amplía la confianza de la máquina de forma significativa: encadena con
**Sectigo Public Server Authentication Root R46**, que ya viene de serie en
cualquier almacén de CA. Lo único que hace es aportar el eslabón que el servidor
debería estar enviando.

## Cómo se usa

**La ruta tiene que ser absoluta.** `pnpm dev` arranca cada paquete con su propio
directorio de trabajo, así que un `./certs/...` se busca dentro de `packages/api`
y de `demo`, donde no existe. Node no falla por eso: solo avisa y sigue sin el
certificado, con lo que el problema reaparece más tarde y parece otra cosa.

```
Warning: Ignoring extra certs from `./certs/sectigo-r36.pem`, load failed:
error:80000003:system library::No such process
```

PowerShell:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\apu\gedesco\NIA\certs\sectigo-r36.pem"
pnpm dev
```

Linux:

```bash
NODE_EXTRA_CA_CERTS=/opt/nia/app/certs/sectigo-r36.pem pnpm dev
```

Si no sale ningún aviso, se ha cargado.

Ojo también con **dónde** se pone: esta variable la lee Node al arrancar, no la
aplicación, así que en el `.env` llega tarde. Con systemd sí vale porque
`EnvironmentFile=` la exporta antes de lanzar el proceso.

## Esto es un parche

El arreglo de verdad es que Infonif configure su servidor para mandar la cadena
completa, que es una línea en la configuración de nginx o del balanceador. Le
pasa a todo cliente que no sea un navegador, no solo a nosotros: curl, Python,
Java y cualquier integración de terceros están viendo lo mismo.

Merece la pena reportarlo. Mientras tanto, este fichero.
