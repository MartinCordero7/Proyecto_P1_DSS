# Resultados reales del analisis de muestras (T09)

Generado con `npm run samples:analyze` el 2026-11-03T17:40:51.237Z.
Tecnica: `lsb_statistical_analysis` (chi-cuadrado de pares de valores, progresivo).

| Archivo | Dato oculto | Esperado | Estado | Accion | anomaly_score | Proporcion LSB=1 | Correlacion serial | Resultado |
|---|---|---|---|---|---|---|---|---|
| IMG_5479_original.png | ninguno | sin_indicios | sin_indicios | aprobado | 0.0151 | 0.5006 | -0.0005 | OK |
| IMG_5479_original.bmp | ninguno | sin_indicios | sin_indicios | aprobado | 0.0151 | 0.5006 | -0.0005 | OK |
| IMG_5479_lsb_aleatorio_100.png | LSB aleatorio 100 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.4996 | -0.0005 | OK |
| IMG_5479_lsb_aleatorio_50.png | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.5006 | 0.0003 | OK |
| IMG_5479_lsb_aleatorio_50.bmp | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.5006 | 0.0003 | OK |
| IMG_5479_lsb_aleatorio_10.png | LSB aleatorio 10 % | no_garantizado | sospechoso | cuarentena | 1.0000 | 0.5004 | -0.0004 | detectado |
| IMG_5479_lsb_texto_100.png | LSB texto 100 % | no_garantizado | sin_indicios | aprobado | 0.3824 | 0.4554 | 0.0530 | no detectado (limitacion documentada) |
| IMG_9974_original.png | ninguno | sin_indicios | sin_indicios | aprobado | 0.0000 | 0.4968 | 0.0027 | OK |
| IMG_9974_original.bmp | ninguno | sin_indicios | sin_indicios | aprobado | 0.0000 | 0.4968 | 0.0027 | OK |
| IMG_9974_lsb_aleatorio_100.png | LSB aleatorio 100 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.5003 | 0.0005 | OK |
| IMG_9974_lsb_aleatorio_50.png | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.4973 | 0.0003 | OK |
| IMG_9974_lsb_aleatorio_50.bmp | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.4973 | 0.0003 | OK |
| IMG_9974_lsb_aleatorio_10.png | LSB aleatorio 10 % | no_garantizado | sospechoso | cuarentena | 1.0000 | 0.4968 | 0.0029 | detectado |
| IMG_9974_lsb_texto_100.png | LSB texto 100 % | no_garantizado | no_concluyente | advertencia | 0.7056 | 0.4554 | 0.0530 | no detectado (limitacion documentada) |
| IMG_E7306_original.png | ninguno | sin_indicios | sin_indicios | aprobado | 0.0000 | 0.4994 | 0.1986 | OK |
| IMG_E7306_original.bmp | ninguno | sin_indicios | sin_indicios | aprobado | 0.0000 | 0.4994 | 0.1986 | OK |
| IMG_E7306_lsb_aleatorio_100.png | LSB aleatorio 100 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.4999 | 0.0012 | OK |
| IMG_E7306_lsb_aleatorio_50.png | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.5001 | 0.0192 | OK |
| IMG_E7306_lsb_aleatorio_50.bmp | LSB aleatorio 50 % | sospechoso | sospechoso | cuarentena | 1.0000 | 0.5001 | 0.0192 | OK |
| IMG_E7306_lsb_aleatorio_10.png | LSB aleatorio 10 % | no_garantizado | sospechoso | cuarentena | 1.0000 | 0.4997 | 0.1578 | detectado |
| IMG_E7306_lsb_texto_100.png | LSB texto 100 % | no_garantizado | sin_indicios | aprobado | 0.1868 | 0.4554 | 0.0530 | no detectado (limitacion documentada) |

`no_garantizado`: caso con limitacion documentada (carga pequena o de texto plano); puede no detectarse.
