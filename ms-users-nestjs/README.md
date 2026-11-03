# Microservicio de Autenticación y Autorización (AUTH)

Este repositorio contiene el microservicio principal de identidad (AUTH) desarrollado como parte del **Proyecto Integrador de Desarrollo de Software Seguro (Backend V1)**. 

Su responsabilidad exclusiva es gestionar identidades (usuarios), roles, asignar accesos (N:M) y emitir tokens JWT, aplicando estrictamente los enfoques de seguridad **Zero Trust**, **Secure by Design** y **Shift Left Security**.

## 🛡️ Principios de Seguridad Implementados

1. **Tokens Seguros (RS256):** Los JWT se firman asimétricamente usando una clave privada (`private_key.pem`). El token payload **NO incluye roles**, mitigando riesgos de escalamiento de privilegios por manipulación del lado del cliente.
2. **Autorización Dinámica en Tiempo Real (Zero Trust):** Todo endpoint protegido extrae la identidad (`sub`) del token y consulta el estado actual de los roles directamente en PostgreSQL. La revocación de un rol surte efecto **inmediatamente**, incluso si el token JWT aún no ha expirado.
3. **Contrato Interno de Autorización:** Expone un endpoint seguro (`/internal/authorization/check`) para que otros microservicios (como el de Esteganografía) deleguen las decisiones de control de acceso.

## 🛠️ Tecnologías
* **Framework:** NestJS (TypeScript)
* **Base de Datos:** PostgreSQL
* **ORM:** TypeORM
* **Autenticación:** Passport-JWT, Argon2id (Hashing de contraseñas)
* **Infraestructura:** Docker & Docker Compose

---

## 🚀 Guía de Instalación y Configuración

### 1. Prerrequisitos
Asegúrate de tener instalados en tu máquina:
* [Node.js](https://nodejs.org/) (v18 o superior)
* [Docker y Docker Compose](https://www.docker.com/)
* [OpenSSL](https://www.openssl.org/) (Para generar las llaves asimétricas)

### 2. Clonar el repositorio e instalar dependencias
```bash
git clone <tu-url-del-repositorio>
cd ms-users-nestjs
npm install
```

### 3. Configurar Variables de Entorno
Copia el archivo de distribución y renómbralo a `.env`:
```bash
cp example.env.dist .env
```
*(Asegúrate de revisar el archivo `.env` por si deseas personalizar los puertos o credenciales de la base de datos).*

### 4. Generar el par de llaves asimétricas (RS256)
Para que la firma y validación de los JWT funcione, debes generar una clave privada y una clave pública. Crea la carpeta `keys` dentro de `src/config/` y ejecuta los siguientes comandos con OpenSSL:

```bash
mkdir -p src/config/keys
cd src/config/keys

# Generar la clave privada
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048

# Extraer la clave pública
openssl rsa -pubout -in private_key.pem -out public_key.pem
```
*(Nota: Para la integración con el microservicio STEGO, deberás compartirle una copia del archivo `public_key.pem`).*

### 5. Levantar la Base de Datos
Inicia el contenedor de PostgreSQL en segundo plano:
```bash
docker compose up -d
```

### 6. Ejecutar la Siembra de Datos (Seed)
Esto creará las tablas necesarias en la base de datos (aplicando la sincronización de TypeORM) e insertará los roles iniciales y el usuario administrador por defecto:
```bash
npm run seed
```
*(Las credenciales del usuario por defecto suelen ser identificador: `jperez` y password: `ClaveSegura2026!`)*

### 7. Iniciar el Microservicio
Levanta la aplicación en modo desarrollo:
```bash
npm run start:dev
```

---

## 📡 Endpoints Principales

El prefijo general del servicio es `http://localhost:3001/api/v1`

| Método | Ruta | Descripción | Acceso Requerido |
|---|---|---|---|
| `GET` | `/health` | Verifica el estado del microservicio | Público |
| `POST` | `/auth/login` | Inicia sesión y retorna JWT firmado (RS256) | Público |
| `GET` | `/users` | Lista todos los usuarios con sus roles | JWT + Rol `ADMIN` u `OPERADOR` |
| `POST` | `/internal/authorization/check` | Endpoint S2S para validar permisos | Microservicio STEGO |

Para visualizar la documentación completa e interactiva de la API, inicia el servicio y navega a la ruta de **Swagger**:
👉 `http://localhost:3001/docs`

---
*Desarrollado para el Proyecto Integrador del Primer Parcial - Desarrollo de Software Seguro.*