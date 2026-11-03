# Muestras de imágenes (evidencia T09)

Conjunto reproducible de imágenes **originales** (sin modificaciones conocidas) e imágenes con
**datos ocultos reales** mediante LSB replacement, para demostrar la detección.

```
samples/
├── covers/       Fotografías de partida (PNG/JPG/BMP). Solo imágenes propias o de licencia libre.
├── generated/    Muestras generadas + manifest.json (SHA-256, técnica, tamaño de la carga, resultado esperado)
└── resultados.md Resultados reales del motor sobre las muestras
```

## Cómo reproducirlo

Desde `stego-ms/`, con las fotos de partida en `samples/covers/`:

```bash
npm run samples:generate -- --covers samples/covers --out samples/generated
npm run samples:analyze  -- --dir samples/generated --report samples/resultados.md
```

El generador **comprueba cada muestra modificada**: la vuelve a leer del disco y extrae la
carga oculta; si no coincide, aborta. Así se garantiza que no hay detección simulada.

## Qué se genera por cada foto

| Archivo | Contenido | Resultado esperado |
|---|---|---|
| `<foto>_original.png` / `.bmp` | Sin datos ocultos | `sin_indicios` |
| `<foto>_lsb_aleatorio_100.png` | Carga aleatoria al 100 % de la capacidad | `sospechoso` |
| `<foto>_lsb_aleatorio_50.png` / `.bmp` | Carga aleatoria al 50 % | `sospechoso` |
| `<foto>_lsb_aleatorio_10.png` | Carga aleatoria al 10 % | no garantizado (carga pequeña) |
| `<foto>_lsb_texto_100.png` | Texto plano al 100 % | no garantizado (limitación: baja entropía) |

Las filas «no garantizado» muestran los **límites reales del método** y se explican en
[`docs/teoria-esteganografia.md`](../docs/teoria-esteganografia.md) (§5.4 y §6).

## Incrustador de referencia

`scripts/lib/lsbEmbedder.js` escribe un encabezado de 4 bytes con la longitud y luego la carga,
bit a bit (MSB primero), en el LSB de las muestras R, G, B consecutivas desde el primer píxel.
Es solo una herramienta de pruebas; no forma parte del servicio.
