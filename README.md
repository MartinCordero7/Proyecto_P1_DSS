# Proyecto Integrador Primer Parcial — Backend V1: Autenticación JWT/RBAC y Detección de Esteganografía

> **Universidad de las Fuerzas Armadas ESPE**  
> **Departamento de Ciencias de la Computación**  
> **Asignatura: Desarrollo de Software Seguro**  
> **Fecha de entrega:** 04/11/2026  

---

## 1. Equipo de Desarrollo y Distribución de Responsabilidades

El proyecto ha sido diseñado e implementado siguiendo una arquitectura de microservicios REST autónomos, desacoplados e independientes bajo los enfoques **Zero Trust (NIST SP 800-207)**, **Secure by Design (ISO/IEC 27034)** y **Shift Left Security (ASVS 5.0)**:

| Integrante | Rol en el Proyecto | Componente Asignado | Tecnologías Principales |
| :--- | :--- | :--- | :--- |
| **Cte. Dávila Anabel** | Desarrollador Backend AUTH | **Microservicio AUTH (`ms-users-nestjs/`)** | NestJS, TypeORM, PostgreSQL, Argon2id, RS256 |
| **Cordero Martín** | Desarrollador Backend STEGO (Persona 1) | **Ingestión, Validación y RBAC (`stego-ms/`)** | Node.js, Express, Multer, Sharp, Crypto, Axios |
| **Llumiquinga Ariel** | Desarrollador Backend STEGO (Persona 2) | **Motor LSB, Persistencia y Auditoría (`stego-ms/`)** | Node.js, Chi-cuadrado LSB, PostgreSQL, pg |

---

## 2. Arquitectura General y Separación de Servicios

La solución se compone de dos aplicaciones backend completamente autónomas que se comunican exclusivamente mediante canales REST protegidos, sin compartir bases de datos, claves privadas ni modelos internos:

```
                                [ Cliente / Postman ]
                                          │
                     ┌────────────────────┴───────────────────┐
                     │ 1. Login / Credenciales                │ 2. Carga imagen + JWT
                     ▼                                        ▼
      ┌─────────────────────────────┐          ┌─────────────────────────────┐
      │   AUTH Microservice         │          │   STEGO Microservice        │
      │   (ms-users-nestjs)         │          │   (stego-ms)                │
      │   Puerto: 3001              │          │   Puerto: 4000              │
      └──────────────┬──────────────┘          └──────────────┬──────────────┘
                     │                                        │
                     │  3. Verificación autorización activa   │
                     │     POST /internal/authorization/check │
                     │◄───────────────────────────────────────┤
                     │     (Header: X-Service-Credential)     │
                     │                                        │
                     │  4. Decisión { allowed, reason }       │
                     ├───────────────────────────────────────►│
                     │                                        │
                     ▼                                        ▼
      ┌─────────────────────────────┐          ┌─────────────────────────────┐
      │   PostgreSQL (user_db)      │          │   PostgreSQL (stego_db)     │
      │   Puerto: 5432              │          │   Puerto: 5433              │
      │   - users                   │          │   - analysis_results        │
      │   - roles                   │          │   - schema_migrations       │
      │   - user_roles (N:M)        │          │   Almacenamiento disco:     │
      │                             │          │   - storage/temporary       │
      │                             │          │   - storage/quarantine      │
      └─────────────────────────────┘          └─────────────────────────────┘
```

---

## 3. Estructura del Repositorio

```
Proyecto_P1_DSS/
│
├── docker-compose.yml              # Orquestación unificada de ambos servicios y sus 2 bases de datos
├── .env.example                    # Plantilla de variables globales para Docker Compose
├── .gitignore
├── README.md                       # Documentación general y guía de sustentación
│
├── keys/                           # Claves criptográficas RS256 (RSA 2048-bit)
│   ├── jwt_public.pem              # Clave pública compartida con STEGO
│   └── jwt_private.pem             # Clave privada exclusiva de AUTH (desarrollo/docker)
│
├── scripts/
│   └── generate-keys.sh            # Script de regeneración de pares de claves RS256
│
├── ms-users-nestjs/                # MICROSERVICIO AUTH (Cte. Dávila Anabel)
│   ├── src/
│   │   ├── auth/                   # Login, perfil, logout y verificación interna S2S
│   │   │   ├── dto/                # CheckAuthorizationDto, LoginDto
│   │   │   ├── guards/             # JwtAuthGuard, RolesGuard
│   │   │   └── strategies/         # JwtStrategy (Passport RS256)
│   │   ├── users/                  # CRUD y administración de identidades
│   │   ├── roles/                  # CRUD y administración de roles
│   │   ├── user-roles/             # Asociación N:M relacional con restricción UNIQUE
│   │   ├── database/               # Semilla con usuarios y roles (seed.ts)
│   │   ├── config/                 # Validación de esquema de entorno con Zod
│   │   ├── app.module.ts
│   │   └── main.ts                 # Prefijos, versionado v1, Swagger, CORS y Pipes
│   ├── test/                       # Pruebas e2e y unitarias con Vitest
│   ├── Dockerfile                  # Contenedor seguro multi-stage
│   ├── package.json
│   └── README.md
│
└── stego-ms/                       # MICROSERVICIO STEGO (Cordero Martín & Llumiquinga Ariel)
    ├── src/
    │   ├── config/                 # Variables de entorno y llaves públicas
    │   ├── routes/                 # Rutas protegidas /analyze y /results/:id
    │   ├── controllers/            # Orquestación del pipeline y manejo de cuarentena
    │   ├── middlewares/            # JWT (RS256), autorización Zero Trust, Multer, errores
    │   ├── services/               # authClient, imageValidation, fileStorage, results
    │   ├── contracts/              # analysisEngine.contract.js (contrato formal P1 <-> P2)
    │   ├── engine/                 # Motor LSB (Pairs of Values / Chi-cuadrado) y clasificador
    │   ├── repositories/           # Repositorio PostgreSQL con consultas parametrizadas
    │   ├── database/               # Pool pg y ejecutor de migraciones SQL
    │   ├── utils/                  # SHA-256 streaming, sanitización, audit logger
    │   ├── app.js
    │   └── server.js
    ├── db/migrations/              # Migración 001_create_analysis_results.sql
    ├── storage/                    # Volúmenes para temporary y quarantine
    ├── samples/                    # Muestras originales y con carga LSB (PNG y BMP)
    ├── scripts/                    # Generador de muestras sintéticas y calibración
    ├── docs/                       # OpenAPI 3.0, Colección Postman, Matriz de Riesgos
    ├── tests/                      # 189 pruebas automatizadas (unitarias, integración, seguridad)
    ├── Dockerfile                  # Contenedor no-root en Node 22 Alpine
    ├── package.json
    └── README.md
```

---

## 4. Detalle de Módulos Implementados

### 4.1. Microservicio AUTH (`ms-users-nestjs`) — *Cte. Dávila Anabel*
1. **Modelo de Identidad Relacional (Anexo A del PDF)**:
   - Entidad `users`: `id` (UUID), `username`, `email` (únicos), `password_hash`, `status`, timestamps de auditoría.
   - Entidad `roles`: `id` (UUID), `rol` (único: `ADMIN`, `ANALYST`, `USER`), `descripcion`, `estado`.
   - Entidad `user_roles`: Tabla asociativa N:M con claves foráneas, fecha de asignación y restricción `@Unique(['user', 'role'])`.
2. **Criptografía y Seguridad de Credenciales**:
   - Almacenamiento de contraseñas con función hash robusta **Argon2id**.
   - Emisión de tokens **JWT asimétricos** firmados con algoritmo **RS256** (RSA 2048 bits), tiempo de expiración acotado (`exp`), emisor (`iss`), audiencia (`aud`) y sujeto (`sub`).
3. **Control de Acceso RBAC y Autorización Dinámica**:
   - Endpoints administrativos protegidos con `RolesGuard` exclusivos para el rol `ADMIN`.
   - **Endpoint Interno S2S** (`POST /api/v1/auth/internal/authorization/check` y `/internal/authorization/check`):
     - Protegido mediante validación de credencial de servicio (`X-Service-Credential`).
     - Consulta en la base de datos el estado activo del usuario y sus roles asignados en el instante de la solicitud (garantiza la **revocación inmediata** de permisos sin depender de tokens estáticos).
     - Valida las acciones del proyecto: `steganography.analyze` y `steganography.view_result`.
4. **Semilla de Datos**:
   - Script `seed.ts` para inicializar roles (`ADMIN`, `ANALYST`, `USER`) y usuarios con credenciales de prueba preconfiguradas.

### 4.2. Microservicio STEGO: Ingestión, Validación y RBAC — *Cordero Martín (Persona 1)*
1. **Recepción Segura de Archivos**:
   - Recepción vía `multipart/form-data` con Multer transmitiendo a disco en almacenamiento temporal restringido (`mode: 0o700`).
   - Generación de nombres internos aleatorios (`UUID v4` + extensión sanitizada), evitando usar el nombre proporcionado por el cliente para mitigar vulnerabilidades de *Path Traversal*.
2. **Validación Exhaustiva de Imágenes (OWASP File Upload Cheat Sheet)**:
   - Filtro de extensiones permitidas (`.png` y `.bmp`).
   - Verificación de firma binaria real (*Magic Bytes*) mediante `file-type` y verificación determinista a nivel de buffer (`0x89 0x50 0x4E 0x47` para PNG y `0x42 0x4D` para BMP).
   - Detección y rechazo de *Extension Spoofing* y *MIME Tampering* (ej. scripts o ejecutables disfrazados con extensión `.png`).
   - Decodificación estructural y detección de archivos corruptos o truncados mediante `sharp` y un validador binario estricto de encabezados DIB/BMP.
   - Restricción estricta de dimensiones máximas (`4096 x 4096`) y tamaño configurable (`5 MB`).
3. **Integridad Criptográfica**:
   - Cálculo de hash `SHA-256` mediante streaming con el módulo nativo `crypto` de Node.js sobre los bytes brutos originales recibidos.
4. **Autenticación Asimétrica y Autorización Zero Trust**:
   - Extracción de `Authorization: Bearer <token>` y verificación criptográfica asimétrica de la firma utilizando exclusivamente la clave pública de AUTH (`RS256`).
   - Consulta obligatoria y sin caché a AUTH en cada operación protegida (`POST /internal/authorization/check`).
   - **Fallo Seguro (503 Service Unavailable)**: Si AUTH se encuentra caído o devuelve una respuesta no verificable, STEGO deniega la operación de inmediato y limpia los archivos temporales.
5. **Manejo Centralizado de Errores y Limpieza**:
   - Mapeo estricto de códigos HTTP (400, 401, 403, 413, 415, 422, 500, 501, 503).
   - Garantía de eliminación de archivos temporales huérfanos ante cualquier excepción o rechazo.
   - Sanitización de respuestas para no exponer rutas internas, trazas ni secretos al cliente.
6. **Contrato Formal de Integración**:
   - Definición del contrato y validadores con la Persona 2 (`src/contracts/analysisEngine.contract.js`).

### 4.3. Microservicio STEGO: Motor LSB, Persistencia y Auditoría — *Llumiquinga Ariel (Persona 2)*
1. **Motor de Detección Esteganográfica LSB**:
   - Lector de píxeles (`pixelReader.js`) para imágenes PNG y BMP de 24/32 bits, normalizando canales RGB y descartando transparencias sin alterar muestras.
   - Algoritmo estadístico basado en el test Chi-cuadrado sobre pares de valores (*Pairs of Values*, Westfeld & Pfitzmann).
   - Cálculo progresivo de frecuencias observadas vs. esperadas, proporción de LSB en 1 y correlación serial.
2. **Clasificación y Política de Acción**:
   - 4 estados conformes al PDF: `sin_indicios`, `sospechoso`, `no_concluyente`, `con_error`.
   - 4 políticas aplicadas: `aprobado`, `advertencia`, `cuarentena`, `rechazo`.
   - Movimiento automático de archivos con estado `sospechoso` al directorio de cuarentena (`storage/quarantine/`).
3. **Persistencia de Resultados en PostgreSQL**:
   - Base de datos independiente (`stego_db`) con tabla `analysis_results` e índices por usuario y SHA-256.
   - Consultas SQL estrictamente parametrizadas para inmunidad frente a inyecciones SQL.
   - Verificación de propiedad del recurso: solo el usuario solicitante o roles administrativos pueden consultar sus análisis.
4. **Auditoría Segura**:
   - Módulo `audit.js` que registra eventos de acceso y análisis en JSON de una sola línea.
   - Lista blanca estricta de campos permitidos: nunca registra contraseñas, claves, JWTs completos ni contenido de imágenes.
5. **Muestras y Calibración Empírica**:
   - Muestras sintéticas reproducibles en `stego-ms/samples/generated/` (3 imágenes de cobertura con cargas LSB al 10%, 50% y 100% con datos aleatorios y de texto).
   - Manifiesto `manifest.json` y reporte de calibración en `resultados.md`.
   - Documento de justificación técnica y limitaciones en `docs/teoria-esteganografia.md`.

---

## 5. Matriz de Cobertura de Pruebas (Tabla 4 del PDF)

| ID | Escenario Exigido | Microservicio | Resultado y Evidencia |
| :---: | :--- | :---: | :--- |
| **T01** | Iniciar y detener AUTH y STEGO por separado | AUTH / STEGO |  Procesos independientes en Docker y comandos `npm run start` autónomos. |
| **T02** | Autenticar con contraseña válida e inválida | AUTH |  Validado con Argon2id; emite JWT o rechaza con HTTP 401. |
| **T03** | Consultar STEGO sin JWT, con JWT manipulado o vencido | STEGO |  HTTP 401 (`jwtSecurity.test.js`). |
| **T04** | Usuario con rol USER intenta analizar una imagen | AUTH / STEGO |  HTTP 403 Forbidden (`zeroTrustAuth.test.js`). |
| **T05** | Asignar dos roles a un usuario y un rol a dos usuarios | AUTH |  Relación N:M persistida en `user_roles`. |
| **T06** | Repetir una asignación usuario-rol | AUTH |  Restricción `@Unique(['user', 'role'])` evita duplicidad. |
| **T07** | Retirar un rol y reutilizar JWT todavía vigente | AUTH / STEGO |  Denegación inmediata en la siguiente petición (`zeroTrustAuth.test.js`). |
| **T08** | Dejar AUTH temporalmente inaccesible | STEGO |  STEGO falla seguro con HTTP 503 sin procesar el archivo. |
| **T09** | Analizar imagen original y una muestra con carga LSB | STEGO |  Métricas y clasificación documentadas en `samples/resultados.md`. |
| **T10** | Subir archivo inválido, corrupto o demasiado grande | STEGO |  Rechazo seguro con HTTP 413, 415 o 422 (`imageValidation.service.test.js`). |
| **T11** | Consultar un análisis ajeno sin autorización | STEGO |  Acceso denegado con HTTP 403 (`analysisFlow.test.js`). |
| **T12** | Revisar bitácoras de accesos y análisis | STEGO |  Trazabilidad completa sin secretos ni JWTs (`audit.test.js`). |

**Total de Pruebas Automatizadas:**  
- `stego-ms`: **189 pruebas automatizadas (20 suites)** pasando al 100%.  
- `ms-users-nestjs`: Pruebas unitarias de controladores y salud pasando con Vitest.

---

## 6. Guía Rápida de Despliegue y Ejecución

### 6.1. Despliegue Completo con Docker Compose (Recomendado)

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/MartinCordero7/Proyecto_P1_DSS.git
   cd Proyecto_P1_DSS
   ```

2. **Configurar variables de entorno globales**:
   ```bash
   cp .env.example .env
   ```

3. **Generar claves criptográficas RS256 (si no existen)**:
   ```bash
   # En Linux / macOS / Git Bash:
   chmod +x scripts/generate-keys.sh
   ./scripts/generate-keys.sh

   # O en Node.js (multiplataforma):
   node -e "
   const crypto = require('crypto'), fs = require('fs');
   const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
   fs.mkdirSync('keys', { recursive: true });
   fs.writeFileSync('keys/jwt_public.pem', publicKey);
   fs.writeFileSync('keys/jwt_private.pem', privateKey);
   fs.writeFileSync('stego-ms/src/config/keys/auth_public_key.pem', publicKey);
   fs.mkdirSync('ms-users-nestjs/src/config/keys', { recursive: true });
   fs.writeFileSync('ms-users-nestjs/src/config/keys/jwt_private.pem', privateKey);
   fs.writeFileSync('ms-users-nestjs/src/config/keys/jwt_public.pem', publicKey);
   "
   ```

4. **Levantar todos los contenedores**:
   ```bash
   docker compose up --build -d
   ```

5. **Poblar la base de datos de AUTH (Semilla)**:
   ```bash
   docker compose exec auth-ms npm run seed
   ```

6. **Ejecutar migraciones en la base de datos de STEGO**:
   ```bash
   docker compose exec stego-ms npm run db:migrate
   ```

7. **Verificar estado de los servicios**:
   - AUTH API: `http://localhost:3001/api/v1/health`
   - AUTH Swagger: `http://localhost:3001/docs`
   - STEGO API: `http://localhost:4000/health`
   - STEGO OpenAPI: `stego-ms/docs/openapi.yaml`

---

### 6.2. Ejecución Local para Desarrollo

#### Microservicio AUTH (`ms-users-nestjs`):
```bash
cd ms-users-nestjs
npm install
# Iniciar base de datos local (puerto 5432)
docker compose up -d postgres
# Ejecutar en modo desarrollo
npm run start:dev
```

#### Microservicio STEGO (`stego-ms`):
```bash
cd stego-ms
npm install
# Ejecutar batería de pruebas
npm test
# Iniciar en modo desarrollo (puerto 4000)
npm run dev
```

---

## 7. Documentación Técnica Complementaria

- **Especificación OpenAPI 3.0**: [stego-ms/docs/openapi.yaml](file:///stego-ms/docs/openapi.yaml)
- **Colección de Postman**: [stego-ms/docs/postman/stego-ms.postman_collection.json](file:///stego-ms/docs/postman/stego-ms.postman_collection.json)
- **Matriz de Riesgos y Controles**: [stego-ms/docs/matriz-riesgos-stego.md](file:///stego-ms/docs/matriz-riesgos-stego.md)
- **Fundamentos del Detector LSB y Calibración**: [stego-ms/docs/teoria-esteganografia.md](file:///stego-ms/docs/teoria-esteganografia.md)
- **Resultados de Análisis de Muestras**: [stego-ms/samples/resultados.md](file:///stego-ms/samples/resultados.md)
