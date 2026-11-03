const path = require('path');

// Las pruebas firman sus JWT con un par de claves propio (tests/fixtures/keys).
// STEGO debe verificarlos con la clave pública de ese par, no con la clave real de AUTH.
// Se define antes de cargar src/config, que lee la variable al importarse.
process.env.AUTH_PUBLIC_KEY_PATH = path.resolve(__dirname, 'fixtures/keys/test_public_key.pem');
