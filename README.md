# Proyecto Integrador Primer Parcial — Backend V1: Autenticación JWT/RBAC y Detección de Esteganografía

> **Universidad de las Fuerzas Armadas ESPE**  
> **Departamento de Ciencias de la Computación**  
> **Asignatura: Desarrollo de Software Seguro**

---

## Estructura General del Repositorio

El proyecto se compone de dos microservicios REST autónomos con despliegue e infraestructura independientes:

```
Proyecto_1P_SS/
├── auth-ms/                     # Microservicio de Autenticación y Autorización RBAC (Persona asignada a AUTH)
│
├── stego-ms/                    # Microservicio de Validación y Detección Esteganográfica (Persona 1 y Persona 2)
│   ├── src/                     # Código fuente modular (Persona 1)
│   ├── storage/                 # Almacenamiento temporal y cuarentena de imágenes
│   ├── tests/                   # Batería de 65 pruebas unitarias, de integración y de seguridad
│   ├── docs/                    # Especificación OpenAPI 3.0 (docs/openapi.yaml)
│   ├── Dockerfile               # Contenerización segura no-root
│   ├── README.md                # Documentación detallada del microservicio STEGO
│   └── package.json
│
├── docker-compose.yml           # Orquestación de ambos microservicios (a integrar por el equipo)
└── README.md                    # Descripción general del proyecto
```

---

## Responsabilidades Implementadas (Persona 1 — STEGO)

1. **Configuración y Arquitectura**: Configuración de Node.js, Express y arquitectura modular por capas (`routes`, `controllers`, `middlewares`, `services`, `contracts`, `utils`).
2. **Recepción Segura de Imágenes**: Subida controlada vía `multipart/form-data` con Multer transmitiendo a disco en almacenamiento temporal restringido (`0o700`).
3. **Validación Exhaustiva de Archivos**:
   - Extensión permitida (`.png` y `.bmp`).
   - Verificación de firma binaria real (*Magic Bytes*) con `file-type` y verificación determinista a nivel de buffer.
   - Detección y mitigación de extension spoofing y MIME tampering.
   - Decodificación y detección de archivos corruptos o truncados con `sharp` y validador binario estricto de estructura DIB/BMP.
   - Control de dimensiones máximas (`4096 x 4096`) y límites de tamaño (`5 MB`).
4. **Integridad Criptográfica**: Cálculo de hash `SHA-256` mediante streaming con el módulo nativo `crypto` sobre los bytes brutos originales recibidos.
5. **Autenticación Asimétrica JWT**: Verificación estricta de tokens firmados mediante clave pública (`RS256`), emisor (`iss`), audiencia (`aud`), expiración (`exp`) y extracción del identificador de usuario (`sub`).
6. **Autorización Dinámica RBAC (Zero Trust)**: Comunicación entre microservicios (S2S) con `AUTH` mediante `POST /internal/authorization/check` protegido con credenciales de servicio. Sin almacenamiento en caché de decisiones (revocación inmediata de roles) y **Denegación por Defecto (503)** si AUTH no está disponible.
7. **Gestión de Almacenamiento y Cuarentena**: Asignación de nombres internos aleatorios (`UUID v4`), mitigación de *Path Traversal*, aislamiento en cuarentena y limpieza automática de archivos temporales en caso de error.
8. **Contratos de Integración**:
   - Contrato formal con el motor de análisis de la Persona 2 (`src/contracts/analysisEngine.contract.js`).
   - Contrato para consulta de resultados (`GET /api/steganography/results/:id`).
9. **Pruebas Automatizadas**: 65 pruebas automatizadas divididas en unitarias (`tests/unit`), de integración con Supertest (`tests/integration`) y de seguridad contra vectores de ataque (`tests/security`).
10. **Documentación y Contenerización**: Especificación OpenAPI 3.0 (`docs/openapi.yaml`) y Dockerfile para ejecución autónoma.

