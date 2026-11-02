# STEGO Microservice — Persona 1

> **Proyecto Integrador Primer Parcial — Desarrollo de Software Seguro**  
> **Universidad de las Fuerzas Armadas ESPE**  
> **Backend V1: Autenticación JWT/RBAC y detección de esteganografía**

---

## 1. Resumen y Alcance (Persona 1)

El microservicio **STEGO** es el encargado de la recepción segura de imágenes, validación estricta de formato e integridad, cálculo criptográfico de huellas digitales (SHA-256), gestión de almacenamiento temporal y en cuarentena, y la verificación de identidad (JWT) y autorización en tiempo real (RBAC) mediante comunicación entre microservicios con **AUTH**.

Este componente corresponde a la implementación de la **PERSONA 1**, diseñada bajo los enfoques:
- **Zero Trust (NIST SP 800-207)**: La validez de firma de un token JWT no presupone que los roles o privilegios del usuario sigan vigentes. Cada solicitud protegida consulta en tiempo real a `AUTH` sin almacenar decisiones en caché. En caso de caída de `AUTH`, se aplica **Denegación por Defecto (Fail Secure)**.
- **Secure by Design & ASVS 5.0**: Nombres de archivo aleatorizados (UUID v4) para mitigar *Path Traversal*, comprobación estricta de firmas binarias (*Magic Bytes* con `file-type`), límites estrictos de tamaño y dimensiones (`sharp`), y sanitización de metadatos.
- **Shift Left Security**: Batería exhaustiva de 65 pruebas automatizadas (unitarias, de integración y de seguridad contra ataques).

---

## 2. Arquitectura y Límites de Confianza

```
                 [ Cliente / Postman ]
                          │  (Multipart/form-data + JWT)
                          ▼
            ┌───────────────────────────┐
            │     STEGO Microservice    │
            │          (Port 4000)      │
            └─────────────┬─────────────┘
                          │
       1. Criptográfico   │   2. Autorización vigente (S2S)
         Verifica JWT     │      POST /internal/authorization/check
        con Public Key    │      X-Service-Credential
                          ▼
            ┌───────────────────────────┐
            │     AUTH Microservice     │
            │          (Port 3000)      │
            └───────────────────────────┘
```

---

## 3. Estructura del Proyecto

```
stego-ms/
│
├── src/
│   ├── config/
│   │   ├── index.js                     # Configuración centralizada de variables de entorno
│   │   └── keys/                        # Claves públicas para verificación asimétrica RS256
│   │
│   ├── routes/
│   │   └── steganography.routes.js      # Definición de endpoints /analyze y /results/:id
│   │
│   ├── controllers/
│   │   └── steganography.controller.js  # Orquestador del flujo de validación y pipeline
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js           # Verificación JWT y autorización dinámica contra AUTH
│   │   ├── upload.middleware.js         # Streaming a disco con Multer y filtrado inicial
│   │   └── error.middleware.js          # Manejo centralizado y limpieza de archivos temporales
│   │
│   ├── services/
│   │   ├── authClient.service.js        # Cliente HTTP interno hacia AUTH (Zero Trust)
│   │   ├── imageValidation.service.js   # Verificación magic bytes, MIME, dimensiones y SHA-256
│   │   ├── fileStorage.service.js       # Gestión segura de archivos, cuarentena y limpieza
│   │   ├── steganographyEngine.service.js # Adaptador para el motor de la Persona 2
│   │   └── results.service.js           # Adaptador para el repositorio de resultados (Persona 2)
│   │
│   ├── contracts/
│   │   └── analysisEngine.contract.js   # Especificación y validación del contrato con Persona 2
│   │
│   ├── utils/
│   │   ├── hash.utils.js                # Cálculo SHA-256 streaming sobre bytes originales
│   │   ├── file.utils.js                # Sanitización de rutas y verificación de magic bytes
│   │   └── errors.js                    # Jerarquía de errores HTTP seguros (400, 401, 403, etc.)
│   │
│   ├── app.js                           # Configuración de Express, Helmet, CORS y rutas
│   └── server.js                        # Punto de entrada y graceful shutdown
│
├── storage/
│   ├── quarantine/                      # Directorio de cuarentena para archivos sospechosos
│   └── temporary/                       # Almacenamiento temporal durante validación
│
├── tests/
│   ├── unit/                            # Pruebas unitarias de utilidades y servicios
│   ├── integration/                     # Pruebas de integración de la API con Supertest
│   ├── security/                        # Pruebas de seguridad (ataques JWT, spoofing, DoS)
│   └── fixtures/                        # Generadores de tokens, claves e imágenes de prueba
│
├── docs/
│   └── openapi.yaml                     # Especificación OpenAPI 3.0 completa
│
├── Dockerfile                           # Contenedor seguro basado en Alpine (no-root)
├── .dockerignore
├── .env.example
├── .gitignore
└── package.json
```

---

## 4. Endpoints Expuestos

### 1. `POST /api/steganography/analyze`
- **Autenticación**: `Authorization: Bearer <JWT>` (Verificado asimétricamente con clave pública RS256).
- **Autorización RBAC**: Consulta interna en tiempo real a `AUTH` para la acción `steganography.analyze`.
- **Formato**: `multipart/form-data` con campo `image`.
- **Validaciones aplicadas**:
  - Extensión (`.png` o `.bmp`).
  - Firma binaria real (*Magic Bytes*).
  - MIME real detectado.
  - Ausencia de corrupción de encabezados o cuerpo de píxeles (`sharp` y validador binario BMP).
  - Límites de dimensiones (`max: 4096 x 4096`).
  - Límite de tamaño configurable (`max: 5 MB`).
  - Cálculo de `SHA-256` sobre bytes brutos originales.
- **Respuestas**:
  - `200 OK`: Análisis completado por el motor de Persona 2.
  - `400 Bad Request`: Campo `image` ausente.
  - `401 Unauthorized`: Token ausente, vencido o alterado.
  - `403 Forbidden`: Usuario sin permiso vigente en AUTH.
  - `413 Payload Too Large`: Archivo excede el límite de tamaño.
  - `415 Unsupported Media Type`: Extensión no permitida o suplantación de extensión detectada.
  - `422 Unprocessable Entity`: Imagen corrupta, truncada o dimensiones excesivas.
  - `501 Not Implemented`: Motor de análisis no conectado (pendiente Persona 2).
  - `503 Service Unavailable`: AUTH inaccesible o decisión no verificable.

### 2. `GET /api/steganography/results/:id`
- **Autenticación**: `Authorization: Bearer <JWT>`.
- **Autorización RBAC**: Consulta a `AUTH` para `steganography.view_result` con `resource_id`.
- **Respuestas**:
  - `200 OK`: Objeto de resultado recuperado.
  - `403 Forbidden`: No autorizado a ver este recurso.
  - `404 Not Found`: Resultado no encontrado.
  - `501 Not Implemented`: Repositorio de BD no conectado (pendiente Persona 2).

### 3. `GET /health`
- Endpoint público de comprobación de salud para Docker / orquestador. Devuelve `200 OK`.

---

## 5. Contrato de Integración con Persona 2

### Entrada entregada al motor de análisis:
El controlador invoca `steganographyEngineService.executeAnalysis(context)` pasando:
```json
{
  "filePath": "storage/temporary/f47ac10b-58cc-4372-a567-0e02b2c3d479.png",
  "originalName": "foto_original.png",
  "mimeType": "image/png",
  "size": 204800,
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Salida requerida del motor de análisis:
El motor de la Persona 2 debe devolver un objeto con los estados autorizados:
- `status`: `'sin_indicios'`, `'sospechoso'`, `'no_concluyente'`, `'con_error'`.
- `action`: `'aprobado'`, `'advertencia'`, `'cuarentena'`, `'rechazo'`.

Ejemplo:
```json
{
  "analysis_id": "7f4c51e0-639a-4c22-b5e1-0c4a45719e71",
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "foto_original.png",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "technique": "lsb_statistical_analysis",
  "status": "sospechoso",
  "indicators": {
    "anomaly_score": 0.82,
    "threshold": 0.75
  },
  "action": "cuarentena",
  "limitations": "Resultado indicativo, no concluyente"
}
```

### Cómo conecta Persona 2 su implementación:
Persona 2 simplemente registra su clase/módulo en `src/services/steganographyEngine.service.js`:
```javascript
const steganographyEngineService = require('./services/steganographyEngine.service');

// Conectar motor:
steganographyEngineService.registerEngine({
  async analyze(context) {
    // Implementación real de LSB / detección de Persona 2
    return { ... };
  }
});
```

---

## 6. Contrato de Integración Interna con AUTH (S2S)

Para verificar la autorización activa:
- **Petición**:
  `POST ${AUTH_BASE_URL}/internal/authorization/check`
  - Encabezados:
    - `Content-Type: application/json`
    - `X-Service-Credential: ${AUTH_SERVICE_CREDENTIAL}`
  - Cuerpo:
    ```json
    {
      "subject_token": "<JWT_DEL_USUARIO>",
      "action": "steganography.analyze",
      "resource_id": null
    }
    ```
- **Respuesta de AUTH**:
  ```json
  {
    "subject_id": "<UUID_USUARIO>",
    "action": "steganography.analyze",
    "allowed": true,
    "reason": "active_role_grants_permission"
  }
  ```

---

## 7. Instrucciones de Configuración y Ejecución

### Variables de Entorno (`.env`)
Copiar la plantilla de configuración:
```bash
cp .env.example .env
```

Variables disponibles:
| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `PORT` | Puerto HTTP expuesto por STEGO | `4000` |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`) | `development` |
| `STORAGE_TEMP_PATH` | Ruta de archivos temporales | `./storage/temporary` |
| `STORAGE_QUARANTINE_PATH`| Ruta de cuarentena | `./storage/quarantine` |
| `MAX_FILE_SIZE_BYTES` | Tamaño máximo en bytes | `5242880` (5 MB) |
| `MAX_IMAGE_WIDTH` | Ancho máximo permitido en píxeles | `4096` |
| `MAX_IMAGE_HEIGHT` | Alto máximo permitido en píxeles | `4096` |
| `ALLOWED_MIME_TYPES` | Tipos MIME admitidos | `image/png,image/bmp` |
| `AUTH_BASE_URL` | URL base del microservicio AUTH | `http://localhost:3000` |
| `AUTH_PUBLIC_KEY_PATH` | Ruta a la clave pública de AUTH | `./src/config/keys/auth_public_key.pem` |
| `AUTH_SERVICE_CREDENTIAL`| Token secreto de servicio STEGO -> AUTH | Token configurado en AUTH |
| `AUTH_TIMEOUT` | Timeout de peticiones hacia AUTH (ms) | `5000` |

### Instalación y Ejecución Local
```bash
# Instalar dependencias
npm install

# Iniciar en desarrollo
npm run dev

# Iniciar en producción
npm start
```

### Ejecución de Pruebas
```bash
# Ejecutar toda la batería (unitarias, seguridad e integración)
npm test

# Ejecutar pruebas unitarias
npm run test:unit

# Ejecutar pruebas de seguridad
npm run test:security

# Ejecutar pruebas de integración
npm run test:integration
```

---

## 8. Despliegue con Docker

### Construir Imagen Docker
```bash
docker build -t stego-ms:1.0.0 .
```

### Ejecutar Contenedor Independiente
```bash
docker run -d \
  --name stego-ms \
  -p 4000:4000 \
  -e AUTH_BASE_URL="http://host.docker.internal:3000" \
  -e AUTH_SERVICE_CREDENTIAL="stego-service-secret" \
  -v stego_storage_temp:/app/storage/temporary \
  -v stego_storage_quarantine:/app/storage/quarantine \
  stego-ms:1.0.0
```

### Integración en `docker-compose.yml` (Para el equipo)
Documentación de servicio recomendada para integrar con `auth-ms`:
```yaml
services:
  stego-ms:
    build:
      context: ./stego-ms
      dockerfile: Dockerfile
    container_name: stego-ms
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      NODE_ENV: production
      AUTH_BASE_URL: http://auth-ms:3000
      AUTH_SERVICE_CREDENTIAL: ${AUTH_SERVICE_CREDENTIAL}
      AUTH_PUBLIC_KEY_PATH: /app/src/config/keys/auth_public_key.pem
    volumes:
      - stego_temp:/app/storage/temporary
      - stego_quarantine:/app/storage/quarantine
    depends_on:
      - auth-ms
    networks:
      - secure_chat_network

volumes:
  stego_temp:
  stego_quarantine:

networks:
  secure_chat_network:
    driver: bridge
```

