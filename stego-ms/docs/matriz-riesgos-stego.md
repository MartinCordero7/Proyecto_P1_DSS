# Matriz de activos, amenazas, vulnerabilidades, riesgos y controles — STEGO

> Proyecto Integrador Primer Parcial — Desarrollo de Software Seguro
> Microservicio STEGO (validación y detección esteganográfica). Parte correspondiente a STEGO de la
> matriz del equipo; AUTH aporta la suya.

Esta matriz sigue los enfoques **Zero Trust**, **Secure by Design** y **Shift Left Security**, con
referencias de orientación a ISO/IEC 27001:2022 (Anexo A) e ISO/IEC 27034. **No se afirma certificación
ni cumplimiento normativo integral.** Cada control cita su evidencia (código y prueba automatizada) para
que pueda verificarse; lo que **no** está implementado figura en la sección «Brechas conocidas».

**Escala.** Probabilidad (P) e Impacto (I): B = baja, M = media, A = alta. Riesgo = combinación de ambas
(Bajo / Medio / Alto). El riesgo residual es el que queda **con los controles actuales**.

## 1. Activos

| ID | Activo | Por qué importa |
|---|---|---|
| A1 | Imágenes recibidas (no confiables) | Pueden ser maliciosas o transportar datos ocultos |
| A2 | Registros de análisis (PostgreSQL de STEGO) | Evidencia y trazabilidad; contienen hash, usuario y resultado |
| A3 | Identidad del solicitante y decisión de autorización | De ellas depende quién puede analizar y consultar |
| A4 | Clave pública de AUTH | Verifica los JWT; si se sustituye, se aceptarían tokens falsos |
| A5 | Credencial de servicio STEGO → AUTH | Identifica a STEGO ante AUTH |
| A6 | Credenciales de la base de datos de STEGO | Acceso a los registros |
| A7 | Bitácora de auditoría | Trazabilidad sin exponer secretos |
| A8 | Carpeta de cuarentena | Contiene archivos sospechosos |
| A9 | Disponibilidad y recursos del servicio | CPU/memoria frente a cargas abusivas |

## 2. Matriz

| ID | Activo | Amenaza | Vulnerabilidad | P | I | Riesgo inicial | Control implementado (evidencia) | Enfoque / ISO (orientativo) | Residual |
|---|---|---|---|---|---|---|---|---|---|
| R1 | A1 | Archivo malicioso disfrazado (extensión o MIME falsos, políglota) | Confiar en el nombre o tipo declarado por el cliente | A | A | **Alto** | Lista de extensiones; firma binaria real (`file-type` + cabecera propia); MIME real; detección de *extension spoofing*; decodificación estricta (`sharp`, analizador BMP). El motor solo **lee** bytes, nunca ejecuta contenido. (`imageValidation.service.js`; pruebas `imageSecurity`, `imageValidation`, integración escenarios 3–5) | Secure by Design · A.8.26, A.8.28, A.8.7 | Bajo |
| R2 | A9 | Denegación de servicio con imágenes enormes o «bombas» de descompresión | Reservar memoria según dimensiones declaradas en la cabecera | M | A | **Alto** | Límites de 5 MB y 4096 × 4096 (`config`); el lector BMP comprueba que las dimensiones declaradas **caben en el archivo antes de reservar memoria** (`pixelReader.test`: «does not allocate memory from a header that declares huge dimensions»); análisis del tamaño máximo ≈ 0,5 s. | Secure by Design · A.8.6 | **Medio** (ver B2: sin límite de peticiones) |
| R3 | A1, A8 | *Path traversal* / sobrescritura de archivos | Usar el nombre enviado por el cliente en disco | M | A | **Alto** | Nombres internos UUID v4; `path.basename` y comprobación de que la ruta resuelta queda dentro del directorio; directorios con modo `0700`. (`fileStorage.service.js`; `fileStorage.service.test`) | Secure by Design · A.8.28 | Bajo |
| R4 | A8 | Acceso o ejecución de archivos sospechosos | Exposición pública de la cuarentena | B | A | Medio | La cuarentena no se sirve por ningún endpoint (no hay `express.static`); el archivo se renombra a UUID; el temporal se elimina en todos los caminos de error (`error.middleware.js`; integración escenario 12; `analysisFlow.test`). | Zero Trust · A.8.3 | Bajo |
| R5 | A3 | Falsificación de JWT (algoritmo `none`, confusión HS/RS, token alterado o vencido) | Verificación débil de la firma | M | A | **Alto** | Solo `RS256` con la clave pública; se exigen `iss`, `aud` y `exp`; STEGO nunca posee la clave privada. (`auth.middleware.js`; `jwtSecurity.test`: sin cabecera, cabecera malformada, token vencido, token alterado, `alg: none` y token sin `sub`; integración escenarios 7–9) | Zero Trust · A.8.5, A.8.24 | Bajo |
| R6 | A3 | Privilegios obsoletos: rol revocado pero JWT aún vigente | Confiar en los roles incluidos en el token | A | A | **Alto** | Cada operación protegida consulta a AUTH, **sin caché**; `req.user.roles` se lee del token pero **no se usa** para decidir. (`authClient.service.js`; `zeroTrustAuth.test`: revocación inmediata, 2 llamadas a AUTH) | Zero Trust · A.5.15, A.5.18 | Bajo |
| R7 | A3 | Eludir la autorización cuando AUTH falla | Fallar abierto | M | A | **Alto** | Denegación por defecto: AUTH caído, lento o con respuesta no verificable → **503**, sin procesar el archivo. (`authClient.service.test`; `zeroTrustAuth.test`; integración escenario 11) | Zero Trust · A.8.27 | Bajo |
| R8 | A2 | Acceso a resultados de otro usuario (IDOR) | Identificadores consultables sin comprobar propietario | A | A | **Alto** | Comprobación de propiedad en STEGO contra la identidad del JWT verificado; el resultado ajeno responde 403 sin revelar datos; identificadores aleatorios (UUID); id inexistente o malformado → 404. (`steganography.controller.js`; `analysisFlow.test`: T11) | Zero Trust · A.5.15, A.8.3 | Bajo |
| R9 | A2 | Inyección SQL | Concatenar valores del cliente en consultas | M | A | **Alto** | Solo consultas parametrizadas; el id se valida como UUID antes de consultar; restricciones `CHECK` en la tabla (estado, acción, SHA-256). (`analysisRepository.js`; `analysisRepository.test`, `analysisRepository.db.test` contra PostgreSQL real) | Secure by Design · A.8.28 | Bajo |
| R10 | A7, A3 | Fuga de información en errores y registros | Mensajes con detalles internos; registrar JWT o cabeceras | M | A | **Alto** | Errores genéricos hacia el cliente (503 sin datos de la base); la auditoría solo escribe campos de una **lista permitida** (nunca JWT, cabeceras ni contenido) y neutraliza inyección de saltos de línea. (`audit.js`, `error.middleware.js`; `audit.test`, `analysisFlow.test`: T12 y 503 sin detalles) | Secure by Design · A.8.15, A.8.12 | Bajo |
| R11 | A5, A6 | Fuga o uso de credenciales débiles/por defecto | Secretos en el repositorio o valores por defecto | M | A | **Alto** | `.env` fuera de Git; `.env.example` solo con marcadores `CHANGE_ME_*`; la contraseña de la base **no tiene valor por defecto** y el servicio se niega a conectar sin ella; la base escucha solo en `127.0.0.1`. (`.gitignore`, `databaseConfig.js`, `docker-compose.yml`; `analysisRepository.test`) | Secure by Design · A.5.17, A.8.9 | Medio (ver B1) |
| R12 | A2 | Pérdida de trazabilidad si no se guarda el resultado | Responder sin dejar registro | M | M | Medio | Si el registro no se guarda: **503** `RESULT_STORAGE_UNAVAILABLE`, y el archivo sospechoso se aísla igualmente. (`analysisFlow.test`) | Secure by Design · A.8.15 | Bajo |
| R13 | A1 | Evasión del detector (falso negativo) | El método LSB estadístico tiene límites | A | M | **Alto** | No se declara certeza: `sin_indicios` y `sospechoso` son indicios; cada respuesta incluye `limitations`; estado `no_concluyente` cuando no hay datos suficientes. Límites medidos y documentados (cargas pequeñas, texto plano, LSB *matching*). (`docs/teoria-esteganografia.md` §5.4 y §6; `samples/resultados.md`) | Shift Left · A.8.29 | **Medio** (aceptado y documentado) |
| R14 | A1 | Falso positivo que bloquea un archivo legítimo | Umbral inadecuado | M | M | Medio | Umbrales calibrados con 24 fotos reales + 3 propias: 0 falsos positivos; zona intermedia → solo `advertencia`; umbrales configurables. (`docs/teoria-esteganografia.md` §5.4; `classifier.test`) | Shift Left · A.8.29 | Bajo |
| R15 | A2 | Alteración o repudio de registros | Cualquiera con acceso a la base puede modificarlos | B | M | Bajo | No existen endpoints para modificar ni borrar análisis; cada registro guarda SHA-256, usuario, fecha y política aplicada. | Zero Trust · A.8.15 | Bajo (ver B4) |
| R16 | A1, A8 | Compromiso del contenedor | Ejecutar como administrador | B | A | Medio | Imagen `node:22-alpine` con usuario no administrador (`node`), `dumb-init`, *healthcheck*; PostgreSQL con `no-new-privileges`. (`Dockerfile`, `docker-compose.yml`) | Secure by Design · A.8.9 | Bajo |
| R17 | A1 | Regresiones de seguridad al evolucionar el código | Cambios sin verificación | M | M | Medio | 189 pruebas automatizadas (unitarias, integración y seguridad) que se ejecutan con `npm test`. | Shift Left · A.8.25, A.8.29 | Bajo |

## 3. Brechas conocidas (no resueltas todavía)

Se declaran con honestidad: **no** están cubiertas por el código actual.

| ID | Brecha | Riesgo | Acción prevista |
|---|---|---|---|
| B1 | **STEGO envía `X-Service-Credential` a AUTH, pero AUTH no la valida**: su endpoint `/internal/authorization/check` es público. Cualquiera que llegue a AUTH puede consultarlo. | **Alto** (suplantación de servicio, requisito del PDF) | Coordinar con AUTH: exigir y validar la credencial de servicio, y restringir el endpoint a la red interna. |
| B2 | **STEGO no limita el número de peticiones** (AUTH sí, con Throttler). | Medio (abuso de CPU/disco) | Añadir *rate limiting* por usuario/IP en STEGO. |
| B3 | **Sin TLS** entre cliente, STEGO y AUTH: el tráfico local va por HTTP. El PDF pide un «canal seguro». | Alto en producción | Terminar TLS en un *reverse proxy* o configurar HTTPS; el tráfico interno de `docker compose` va en una red privada. |
| B4 | La cuenta de la aplicación tiene permisos completos sobre la base; los registros no son *append-only* a nivel de base de datos. | Bajo | Crear un rol de base de datos con solo `INSERT` y `SELECT` sobre `analysis_results`. |
| B5 | `cors()` está abierto a cualquier origen (heredado). | Bajo (la API usa `Authorization`, sin cookies) | Restringir orígenes por variable de entorno cuando exista un cliente web. |
| B6 | La clave privada de **pruebas** está versionada en `tests/fixtures/keys/`. Es solo de pruebas y `.dockerignore` excluye `tests`, pero conviene no reutilizarla. | Bajo | Mantenerla separada de cualquier clave real (ya lo está). |
| B7 | Las decisiones de AUTH para `steganography.view_result` aún no existen: AUTH responde `unknown_action` y niega. | Medio (funcional) | Coordinar con AUTH. |

## 4. Relación con los enfoques

- **Zero Trust:** R5–R8. Ninguna petición se acepta por haber llegado a la red ni por tener un JWT
  válido; la autorización se pide a AUTH cada vez y falla cerrada.
- **Secure by Design:** R1–R4, R9–R12, R16. La validación, el aislamiento de archivos, la
  parametrización y la ausencia de valores por defecto están en la arquitectura, no añadidos después.
- **Shift Left Security:** R13, R14, R17. Los riesgos se midieron y probaron durante el desarrollo
  (pruebas automáticas, muestras originales y modificadas, calibración con imágenes reales).

## 5. Referencias

- ISO/IEC 27001:2022. *Information security management systems — Requirements* (Anexo A).
- ISO/IEC 27034-1:2011. *Application security — Overview and concepts*.
- OWASP Foundation. *File Upload Cheat Sheet* y *Application Security Verification Standard (ASVS) 5.0*.
- NIST SP 800-207. *Zero Trust Architecture*.
- RFC 8725. *JSON Web Token Best Current Practices*.
