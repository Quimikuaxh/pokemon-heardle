# Pokemon Heardle - Requisitos

Estado: version inicial implementada (main). Iteracion `feature/admin-catalogo` (admin local, canciones cortas, barra de reproduccion, cancion completa al terminar) definida en esta revision.

## 1. Objetivo
Juego web estilo Heardle: adivinar la cancion de un juego de Pokemon a partir de fragmentos de audio que se alargan con cada intento.

## 2. Requisito clave: la solucion no debe poder deducirse inspeccionando cliente o red
- Backend Node propio (Express/Fastify, a elegir por el arquitecto). El audio no es publico.
- Cada partida tiene un token opaco. El cliente nunca recibe nombres de fichero, IDs ni metadatos de la cancion.
- El backend sirve solo el audio del intento actual (0 a N s), sin ID3 ni nombres reveladores, con URL opaca de un solo uso.
- La validacion (cancion correcta + juego correcto) se hace en servidor. La solucion se revela solo al terminar la partida.
- Limitacion aceptada: no se puede impedir Shazam ni grabar la salida de audio.

## 3. Mecanica
- Estandar Heardle: 6 intentos, fragmentos de 1/2/4/7/11/16 s (una duracion por intento), boton Skip (consume intento y alarga fragmento), buscador con autocompletado de canciones. Sin compartir resultado ni estadisticas (retirados, seccion 9).
- Modos: diario e ilimitado.
  - Diario: SIN filtro. Una unica cancion por dia (Europe/Madrid), la misma para todas las personas, elegida de todo el catalogo: cancion del dia = HMAC(semilla secreta, fecha); sin base de datos.
  - Ilimitado: cancion aleatoria en servidor segun filtro.
- Filtro por juego: SOLO en modo ilimitado; elige que juegos entran en el pool. Se guarda en el navegador.
- Intento repetido no permitido: el buscador marca las canciones ya intentadas y no deja elegirlas; el servidor rechaza la repeticion sin consumir intento.
- Feedback parcial: tras cada intento fallido, el servidor indica si el juego de la cancion elegida era correcto aunque la cancion no lo sea.
- Una cancion puede pertenecer a varios juegos. Acertar el juego = el juego elegido esta entre los de la cancion objetivo.
- Registro de la partida diaria en localStorage para no repetir el diario y mostrar su resultado. (RETIRADO: estadisticas de racha y distribucion.)
- Barra de reproduccion: al reproducir, una barra muestra el avance en tiempo real sobre la escala total de 16 s, dividida en los segmentos de los fragmentos (marcas en 1/2/4/7/11/16 s); la parte desbloqueada del intento actual se distingue de la bloqueada.
- Cancion completa al terminar (acierto o fallo): se ofrece el video original de YouTube embebido (`youtube-nocookie`) tras pulsar "Escuchar la cancion completa". El id del video solo llega al cliente dentro de la solucion revelada, nunca antes; el iframe no se carga antes de terminar.

## 4. Catalogo (script)
- El usuario aporta una playlist de YouTube.
- Script reproducible: descarga con yt-dlp, recorta/normaliza con ffmpeg, elimina metadatos y genera `catalog.json` (juego(s), titulo, inicio del fragmento, fichero).
- Juego/titulo se derivan del titulo del video y se revisan a mano en `catalog.json`.
- yt-dlp y ffmpeg no estan instalados: el script/README documenta la instalacion.
- Audios y catalogo no se suben al repo publico (.gitignore); se suben al bucket.
- Canciones demasiado cortas (duran menos de `startSec + 16 s`, p. ej. "Obtained a Badge", "Cable Car"): se detectan automaticamente midiendo el audio descargado, quedan `enabled: false` con una marca visible en el admin y no hacen fallar el flujo. No se pueden activar mientras sigan siendo cortas.
- Admin local del catalogo (en `scripts/catalog`, no desplegado, sin login), arrancado con `npm run cli -- admin`: servidor local + pagina para listar canciones; escuchar el tema COMPLETO descargado (`data/work`) con barra para moverse, sin necesidad de `build`; activar/desactivar; editar titulo y juegos (varios por cancion; crear y renombrar juegos, con la regla de seccion 9); marcar revisada; filtrar y buscar; `startSec` NO se edita (siempre 0 salvo edicion manual del JSON). UI con React + Vite (por juego, activadas/desactivadas, revisadas/pendientes, texto). Guarda `data/catalog.json` de forma atomica; despues el flujo sigue con `build`/`validate`/`upload`.

## 5. Stack y despliegue
- Frontend: React + Vite + TypeScript. Backend: Node + TypeScript.
- Hosting gratuito (CONFIRMADO), mismo esquema que claude-test: frontend en Vercel, backend en Render free, audio en bucket PRIVADO de Supabase Storage (1 GB), servido solo via backend.
- Debe contemplarse el arranque en frio de Render free (indicador de carga, reintentos, posible ping de calentamiento al abrir la web).
- Proteccion contra abusos: rate-limit basico por IP y por token.

## 6. UI
- Interfaz en espanol; nombres de canciones y juegos en ingles.
- Responsive (movil) y modo oscuro.
- Cuidar autoplay en iOS (reproduccion tras gesto del usuario).

## 7. Criterios de aceptacion
1. En DevTools (codigo, red, almacenamiento) no aparece la cancion objetivo antes de terminar la partida.
2. Intento N reproduce exactamente la duracion definida; un fragmento no revela audio posterior.
3. Fallo con juego correcto muestra feedback de juego acertado; con juego incorrecto, lo indica.
4. El mismo dia da la misma cancion en diario para todas las personas, sin filtro.
5. En ilimitado, filtro vacio no permite empezar; pool con una sola cancion funciona.
6. (RETIRADO: compartir resultado en emojis.)
7. Tras fallar o acertar, se revela la solucion y no se puede seguir jugando esa partida.
8. Funciona en movil y en modo oscuro; arranque en frio del backend no rompe la UI.

## 8. Casos limite
- Token invalido/caducado: nueva partida. Recarga de pagina durante partida: se recupera por token (el estado de intentos vive en servidor o token firmado).
- Diario ya jugado hoy: mostrar resultado, no permitir repetir.
- Cambio de filtro a mitad de partida (ilimitado): aplica a la siguiente partida.
- Cancion ya intentada: no seleccionable; si llega al servidor, se rechaza sin consumir intento.
- Cambio de dia (zona horaria): Europe/Madrid (seccion 9).
- Video de YouTube retirado o no embebible: el iframe muestra el error de YouTube; la solucion (titulo y juegos) sigue visible.

## 9. Decisiones cerradas (con motivo y alternativa descartada)
- **6 intentos** (1/2/4/7/11/16 s). Estandar Heardle; un 7.o intento exigiria inventar una duracion. Descartado: 7 intentos con 30 s.
- **Dia en Europe/Madrid.** Es la zona del usuario y de sus jugadores. Descartado: UTC (el cambio de cancion caeria a las 01:00/02:00 locales).
- **Repo GitHub privado.** Reduce el riesgo de copyright. Audios y catalogo van igualmente al `.gitignore`: privado hoy no garantiza privado manana.
- **Audio en bucket privado del MISMO proyecto Supabase que claude-test.** Evita la pausa por inactividad de un proyecto aparte y no consume el 2.o proyecto gratuito. Descartado: proyecto Supabase nuevo (el plan free lo pausa tras 1 semana de inactividad).
- **Acceso al bucket con claves S3 de Supabase Storage** (protocolo S3-compatible de Supabase, sin AWS; se generan en Storage -> S3 Access Keys). Solo dan acceso a Storage. Descartado: `service_role` (acceso total al proyecto, incluida la BD del Team Builder).
- **Originales y clips en local, en carpeta gitignorada de pokemon-heardle; al bucket solo se suben los clips** (MP3 CBR 128 kbps, ~660 KB/cancion con 6 clips, ~330 MB para 500 canciones; descartado 64 kbps mono porque el usuario prioriza calidad) y el `catalog.json` que necesita el backend. El 1 GB free se comparte con el Team Builder; ver estimacion y egress en ARQUITECTURA.md (DEC-16).
- **Buscador: cada opcion es una cancion (mostrando sus juegos); busca por titulo de cancion O nombre de juego; muestra SIEMPRE todo el catalogo**, independientemente del filtro y de haber acertado el juego. Juego acertado = la cancion elegida comparte algun juego con la objetivo. Descartado: opciones por par (cancion, juego) y limitar el buscador al pool del filtro (daria pistas y dejaria sin sentido el feedback de juego).
- **Diario comun sin filtro; filtro solo en ilimitado** (cambio del 2026-10-03). El usuario quiere un diario comun y comparable. Descartado: filtro en ambos modos con una cancion del dia por combinacion de filtro.
- **Intento repetido no permitido** (buscador lo bloquea, servidor lo rechaza sin consumir intento). Descartado: aceptarlo consumiendo intento.
- **Almacenamiento definitivo en Supabase Storage.** Descartados: Backblaze B2 (egress gratis ~3x almacenamiento, ~1 GB/mes, y 2.500 descargas/dia) y Google Drive (mas configuracion y latencia).
- **Un "juego" del catalogo = grupo de versiones que comparten banda sonora** ("Ruby/Sapphire/Emerald" es UN juego); un remake con banda sonora distinta es otro juego ("Omega Ruby/Alpha Sapphire"). Cada cancion lista todos los juegos en los que aparece. Descartado: cada version por separado (inflaria el filtro y el feedback de juego fallaria entre versiones con la misma OST) y agrupar por generacion.
- **Cancion sin juego reconocible**: el catalogo la deja sin juegos y la validacion falla hasta revisarla a mano. No existe juego "unknown" (llegaria a produccion con feedback de juego erroneo).
- **Admin del catalogo local, no desplegado y sin login.** Descartado: admin en la web desplegada con login (mas superficie de ataque y complejidad). Descartado: oir en el admin los 6 fragmentos (exige `build` previo); se oye el tema completo descargado.
- **Sin compartir resultado ni estadisticas** (retirados en la iteracion admin-catalogo): el usuario no las quiere. Se mantiene solo el registro de la partida diaria en localStorage para no repetir el diario. Descartado: mantener el texto de emojis y la racha/distribucion.
- **`startSec` no editable en el admin**: las canciones empiezan en el segundo 0 salvo edicion manual de `catalog.json`. Descartado: campo y boton "usar posicion actual" en el admin.
- **UI del admin con React + Vite** (misma pila que el frontend). Descartado: TS sin framework con esbuild.
- **Embed de la cancion completa solo al pulsar un boton.** Descartado: carga automatica al terminar (peticiones a YouTube al reabrir un diario terminado y mas datos en movil).
- **Canciones cortas: desactivacion automatica con marca, no fallo.** Descartado: que `validate` falle (bloqueaba el flujo por temas que simplemente no sirven).
- **Cancion completa al terminar via embed de YouTube.** Descartado: servir el tema completo o un fragmento largo propio (~1,5 GB para 500 canciones, supera el 1 GB gratis de Supabase).
- **Clips precortados, no ffmpeg al vuelo.** La instancia free de Render tiene poca CPU/RAM; cortar por peticion la tumbaria. El script de catalogo genera los clips por intento. Descartado: recorte en servidor.
- **Render free compartido con el Team Builder.** El plan free da 750 h/mes por workspace; ambos backends duermen tras 15 min de inactividad. RIESGO: si ambos estan despiertos a la vez, el consumo suma y puede agotar las horas. REQUISITO: NO anadir keep-alive ni pings periodicos; solo se despierta con trafico real (la UI muestra carga ante el arranque en frio).
- **Backend portable.** Sin dependencias especificas de Render (solo Node estandar, variables de entorno, Dockerfile opcional) para poder migrarlo. Descartado: Koyeb, porque exige tarjeta y el usuario no quiere tarjeta obligatoria.

## Preguntas abiertas
Ninguna.
