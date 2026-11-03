# Fundamentos teóricos y justificación del método de detección (Persona 2)

> Proyecto Integrador Primer Parcial — Desarrollo de Software Seguro
> Microservicio STEGO · Parte teórica de la Persona 2 (Análisis y persistencia)

Este documento justifica la técnica de detección esteganográfica implementada en STEGO
(`lsb_statistical_analysis`), sus parámetros, sus formatos admitidos y sus limitaciones.
Los valores marcados como **[a calibrar]** son parámetros iniciales que se fijan de forma
definitiva con las muestras reales (originales y modificadas) del paso de pruebas.

---

## 1. Esteganografía y sus fundamentos

La **esteganografía** oculta la *existencia* de un mensaje dentro de un portador (*cover*)
aparentemente inocuo. Se diferencia de la criptografía, que protege el *contenido* pero no
oculta que hay un mensaje. El esquema clásico es el «problema del prisionero» de Simmons:

```
 mensaje + portador + clave  ──►  [ incrustación ]  ──►  estego-objeto  ──►  [ extracción ]  ──►  mensaje
```

Propiedades que busca un esquema esteganográfico:

| Propiedad | Significado |
|---|---|
| Imperceptibilidad | El estego-objeto no se distingue visualmente del portador. |
| Capacidad | Cantidad de bits que se pueden ocultar. |
| Robustez | Resistencia a transformaciones (compresión, escalado). |
| Indetectabilidad | Resistencia al análisis estadístico (*esteganálisis*). |

El **esteganálisis** es la disciplina inversa: decidir si un archivo contiene datos ocultos.
Es **probabilístico**: produce *indicios*, no pruebas (coherente con el PDF: «un resultado
sospechoso constituye un indicio, no prueba definitiva»).

**Relevancia para el proyecto:** en una plataforma de chat, una imagen puede servir de canal
encubierto para exfiltrar información o transportar datos no autorizados sin llamar la
atención. Por eso STEGO analiza las imágenes antes de aceptarlas.

## 2. Técnicas de ocultamiento en imágenes

| Familia | Idea | Ejemplos | Formato típico |
|---|---|---|---|
| Dominio espacial | Modifica directamente los valores de los píxeles | LSB replacement, LSB matching (±1) | PNG, BMP |
| Dominio transformado | Modifica coeficientes de una transformada | DCT (JSteg, F5, OutGuess), wavelets | JPEG |
| Basadas en paleta | Reordena o altera la paleta de colores | EzStego | GIF, PNG indexado |
| Basadas en formato | Usa zonas no interpretadas del archivo | Datos tras el fin del archivo, *chunks* auxiliares PNG, relleno BMP | Cualquiera |
| Adaptativas | Elige píxeles según la textura local | HUGO, WOW, S-UNIWARD | PNG, BMP |

El PDF limita el alcance mínimo a **PNG y BMP**, formatos sin pérdida donde las técnicas del
dominio espacial —y en particular LSB— son las más comunes y las más directamente
verificables. Por eso STEGO acepta solo esos dos formatos y se centra en LSB.

## 3. Fundamentos del método LSB (*Least Significant Bit*)

Cada canal de color de un píxel de 8 bits toma un valor 0–255. El **bit menos significativo
(LSB)** aporta solo ±1 al valor, un cambio imperceptible. LSB *replacement* sobrescribe ese
bit con un bit del mensaje:

```
píxel original (G)  = 1011 0110  (182)
bit del mensaje     =         1
píxel estego   (G)  = 1011 0111  (183)
```

Capacidad: 1 bit por canal y píxel. Una imagen de 512 × 512 en RGB admite hasta
512 · 512 · 3 / 8 ≈ 98 KB de carga.

**Consecuencia estadística clave.** Al reemplazar el LSB, los valores `2k` y `2k+1` (un
«par de valores», *PoV*) se transforman entre sí. Si el mensaje es aleatorio o está cifrado,
cada LSB es 0 o 1 con probabilidad 1/2, de modo que tras una incrustación completa las
frecuencias de `2k` y `2k+1` tienden a **igualarse**. En una imagen natural esas dos
frecuencias normalmente difieren. Este es el rastro que se detecta.

Variantes relevantes:

- **Secuencial:** los bits se escriben desde el primer píxel en orden de lectura (fila a fila).
  La mayoría de herramientas simples funcionan así. Es el caso que mejor se detecta.
- **Aleatoria (con *stego-key*):** los bits se reparten por posiciones pseudoaleatorias.
  Dilata el efecto y baja la sensibilidad de los métodos secuenciales.
- **LSB matching (±1):** suma o resta 1 en lugar de sobrescribir. No genera la igualación de
  pares, por lo que el test chi-cuadrado **no** lo detecta (ver §6).

## 4. Análisis estadístico para identificar indicios

STEGO extrae el plano LSB de cada canal (R, G, B) y calcula indicadores sobre él.
Los canales alfa y las imágenes con paleta no se analizan (ver §6).

### 4.1 Test chi-cuadrado de pares de valores (Westfeld y Pfitzmann)

Es el indicador principal. Para un canal con histograma `h[0..255]`:

```
Para cada par k = 0..127:
    n_k = h[2k] + h[2k+1]
    e_k = n_k / 2                      (frecuencia esperada si el par está igualado)
    o_k = h[2k]                        (frecuencia observada)

χ² = Σ  (o_k − e_k)² / e_k             solo pares con e_k ≥ 5
gl = (número de pares usados) − 1
p  = 1 − F_χ²(χ²; gl)                  (cola superior de la distribución χ²)
```

**Interpretación (¡ojo a la dirección!):**

- `p` cercano a **1** → χ² pequeño → los pares están **igualados** → *consistente con
  incrustación LSB* en la región analizada.
- `p` cercano a **0** → los pares difieren como en una imagen natural → sin indicio.

**Análisis progresivo.** Si el mensaje es más corto que la capacidad, solo se altera la
primera parte de la imagen (en orden de lectura). Se calcula `p` sobre ventanas crecientes
(el primer 10 %, 20 %, …, 100 % de las muestras) y se conserva el **máximo**. Así se detecta
una incrustación parcial que, evaluada sobre la imagen completa, quedaría diluida.
El máximo de varias ventanas aumenta la tasa de falsos positivos, lo que se compensa
con el umbral **[a calibrar]**.

### 4.2 Proporción de LSB en 1 (indicador de apoyo)

```
r = (cantidad de LSB = 1) / N          z = |r − 0.5| · 2·√N
```

Una carga aleatoria o cifrada empuja `r` hacia 0,5. Por sí sola es débil, porque muchas
imágenes naturales también tienen `r ≈ 0,5`; se reporta como evidencia complementaria.

### 4.3 Correlación serial del plano LSB (indicador de apoyo)

Coeficiente de correlación `ρ` entre el LSB de un píxel y el de su vecino horizontal.
En imágenes naturales, sobre todo suaves, el plano LSB conserva algo de estructura (`ρ`
distinto de 0). Una carga aleatoria destruye esa estructura y lleva `ρ` hacia 0.

### 4.4 Métodos considerados y descartados para la versión 1

| Método | Qué aporta | Motivo para no incluirlo ahora |
|---|---|---|
| RS Analysis (Fridrich et al.) | Estima la *longitud* del mensaje | Mayor complejidad; posible mejora futura |
| Sample Pairs (Dumitrescu et al.) | Estima la tasa de incrustación | Ídem |
| Clasificadores con aprendizaje (SRM + SVM/CNN) | Alta sensibilidad | Requieren datasets de entrenamiento; fuera del alcance |

## 5. Métricas, umbrales y clasificación de resultados

### 5.1 Puntaje de anomalía

El motor devuelve `indicators.anomaly_score` ∈ [0, 1]. En la versión inicial se toma como
base el máximo de `p` (§4.1) entre los canales R, G y B, y los indicadores de §4.2 y §4.3 se
reportan junto a él. Su ponderación final **[a calibrar]** se fija al medir imágenes reales.
El umbral de referencia es `threshold = 0.75`, el mismo valor del ejemplo del Anexo C del PDF
(los números del anexo son ilustrativos; el umbral definitivo sale de las pruebas).

### 5.2 Estados de clasificación

| Estado | Condición (valores iniciales **[a calibrar]**) |
|---|---|
| `sospechoso` | `anomaly_score ≥ 0.75` con muestras suficientes |
| `sin_indicios` | `anomaly_score < 0.40` con muestras suficientes |
| `no_concluyente` | Zona intermedia (0.40 ≤ puntaje < 0.75), **o** no es posible concluir (imagen demasiado pequeña, pocos pares válidos, formato no analizable) |
| `con_error` | Fallo al decodificar o procesar la imagen |

«Muestras suficientes»: se exige un mínimo de muestras y de pares con `e_k ≥ 5`
(por ejemplo ≥ 10 000 muestras y gl ≥ 20) **[a calibrar]**. Las imágenes casi planas o de
pocos colores (capturas, ilustraciones) producen pocos pares válidos y se marcan
`no_concluyente` en lugar de emitir un veredicto poco fiable.

### 5.3 Política aplicada (campo `action`)

| Estado | Acción | Efecto |
|---|---|---|
| `sospechoso` | `cuarentena` | El archivo se mueve a `storage/quarantine` (ya implementado por el controlador). |
| `no_concluyente` | `advertencia` | Se informa, se elimina el temporal y se advierte que el resultado no es concluyente. |
| `sin_indicios` | `aprobado` | Se elimina el temporal. |
| `con_error` | `rechazo` | Se rechaza el archivo y se elimina el temporal. |

## 6. Limitaciones de los métodos de detección

1. **Indicio, no prueba.** Un `sospechoso` puede ser un falso positivo; un `sin_indicios` no
   garantiza ausencia de datos ocultos. Cada respuesta lo declara en `limitations`.
2. **Cargas pequeñas.** Un mensaje corto altera muy pocos píxeles y no desplaza las
   estadísticas lo suficiente para superar el umbral.
3. **LSB matching (±1)** y técnicas adaptativas (HUGO, WOW, S-UNIWARD) **no** generan la
   igualación de pares: el test chi-cuadrado no las detecta.
4. **Incrustación aleatoria** (con *stego-key*) diluye el efecto; el análisis progresivo
   solo ayuda con incrustación secuencial.
5. **Imágenes sintéticas o muy comprimibles** (colores planos, pocas tonalidades) tienen
   histogramas poco informativos: baja fiabilidad, de ahí el estado `no_concluyente`.
6. **Falsos positivos naturales:** fotos con ruido muy alto o procesadas pueden mostrar
   pares casi igualados sin contener carga.
7. **Imágenes con paleta (PNG indexado, BMP de 1/4/8 bits):** el LSB del *índice* de paleta
   no equivale al LSB del color; no se analizan y quedan `no_concluyente`.
8. **PNG de 16 bits por canal:** el decodificador entrega 8 bits y se pierde el LSB original;
   se marcan `no_concluyente`.
9. **Canal alfa:** no se analiza en esta versión.
10. **Datos ocultos fuera de los píxeles** (tras el fin del archivo, *chunks* auxiliares PNG,
    relleno BMP) no los detecta el análisis de píxeles. La validación de la Persona 1
    comprueba que el archivo se decodifique y tenga datos de píxeles completos, pero no
    inspecciona bytes sobrantes; se documenta como mejora futura revisar esas zonas.
11. **JPEG no soportado** (dominio DCT), fuera del alcance mínimo del PDF.
12. **Orden de lectura de los píxeles.** El análisis progresivo recorre la imagen de
    arriba hacia abajo y de izquierda a derecha, que es el orden que usan las bibliotecas
    de imagen habituales. Una herramienta que escribiera los bits siguiendo el orden
    físico de un BMP (filas de abajo hacia arriba) alteraría otra región primero y
    podría atenuar la detección de una carga parcial.
13. **Sensibilidad frente a un adversario consciente:** un atacante que conozca el
    detector puede adaptar la incrustación para evadirlo (LSB matching, tasas bajas).

## 7. Seguridad del procesamiento

El análisis solo **lee** bytes: nunca ejecuta contenido recibido. Se opera sobre el archivo ya
validado y almacenado con un nombre interno aleatorio, con límites de tamaño y dimensiones
(Persona 1), y el archivo sospechoso queda aislado en cuarentena (OWASP File Upload Cheat
Sheet). El registro de auditoría guarda el hash SHA-256 y los indicadores, nunca el contenido
de la imagen ni el JWT.

## 8. Referencias

- Westfeld, A. y Pfitzmann, A. (1999). Attacks on Steganographic Systems. *Information
  Hiding (IH 1999)*, LNCS 1768, pp. 61–76. Springer.
- Fridrich, J., Goljan, M. y Du, R. (2001). Detecting LSB steganography in color and
  gray-scale images. *IEEE Multimedia*, 8(4), 22–28.
- Dumitrescu, S., Wu, X. y Wang, Z. (2003). Detection of LSB steganography via sample pair
  analysis. *IEEE Transactions on Signal Processing*, 51(7), 1995–2007.
- Provos, N. y Honeyman, P. (2003). Hide and Seek: An Introduction to Steganography.
  *IEEE Security & Privacy*, 1(3), 32–44.
- Fridrich, J. (2009). *Steganography in Digital Media: Principles, Algorithms, and
  Applications*. Cambridge University Press.
- OWASP Foundation. (s. f.). *File Upload Cheat Sheet*. OWASP Cheat Sheet Series.
