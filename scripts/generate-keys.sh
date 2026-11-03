#!/bin/sh
# ============================================================
# generate-keys.sh  —  Genera par RSA-2048 para JWT RS256
# Ejecutar UNA VEZ desde la raíz del repositorio.
# Las claves se copian a AUTH y STEGO automáticamente.
# ============================================================
set -e

mkdir -p keys
mkdir -p ms-users-nestjs/src/config/keys
mkdir -p stego-ms/src/config/keys

# 1. Generar clave privada
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out keys/jwt_private.pem 2>/dev/null

# 2. Derivar clave pública
openssl pkey -in keys/jwt_private.pem -pubout \
  -out keys/jwt_public.pem 2>/dev/null

# 3. Distribuir a los microservicios
cp keys/jwt_private.pem ms-users-nestjs/src/config/keys/jwt_private.pem
cp keys/jwt_public.pem  ms-users-nestjs/src/config/keys/jwt_public.pem
cp keys/jwt_public.pem  stego-ms/src/config/keys/auth_public_key.pem

echo "[OK] Claves RS256 generadas y distribuidas."
echo "     AUTH  → ms-users-nestjs/src/config/keys/"
echo "     STEGO → stego-ms/src/config/keys/"
echo ""
echo "IMPORTANTE: Estas claves son SOLO PARA DESARROLLO."
echo "En producción, genere un par nuevo y monte las claves como secretos de Docker."

