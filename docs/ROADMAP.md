# BEE — Roadmap de producto

Lo que sigue después del rediseño de septiembre de 2026, en el orden en que
conviene atacarlo. Cada punto dice qué existe hoy y qué falta.

## 1. Divisa por equipo y conversión automática

**Hoy.** Cada equipo tiene una divisa (`teams.currency`, ISO 4217, migración
047) y el modelo de Ventas la usa para formatear montos. Los KPIs muestran
solo el número, sin divisa, porque el espacio del tile es para la cifra y la
divisa se configura una vez en los ajustes del equipo.

**Falta.**

- Ajustes de equipo: elegir la divisa del equipo (y, si hace falta, una
  preferencia por usuario) en la página de Equipo, con vista previa del
  formato.
- Conversión automática en el cerebro de BEE: cuando entra una señal que
  habla de dinero fuera de una oportunidad (una ronda de inversión, un
  contrato público, una expansión con monto), el motor debe reconocer la
  cifra y su divisa de origen en el texto de la señal y convertirla a la
  divisa del equipo antes de guardarla en `analysis` y de proponer un
  monto para la oportunidad.
- Una API de tipos de cambio (por ejemplo, un proveedor con tasas diarias)
  detrás de un servicio `services/fx/` con caché por día y la tasa usada
  guardada junto al monto, para que un monto convertido siempre pueda
  auditarse ("USD 32,000 a MXN 18.1 el 4 sep 2026").
- Montos históricos: la conversión se hace con la tasa del día de la señal
  o del cierre, nunca con la tasa de hoy, para que Ventas y Pronóstico no
  cambien retroactivamente.

## 2. Colmena a escala

**Hoy.** La colmena dibuja hasta 200 cuentas en el Resumen (las más
calientes) y todas en Señales · Intención, con filtro por etapa.

**Falta.** Agrupar por industria o por responsable como capas del panal, y
un modo "solo las mías" para equipos grandes.

## 3. Historial y navegación temporal

**Hoy.** Toda gráfica de tiempo muestra un año y se aleja a dos o cinco con
las píldoras de periodo; el sandbox carga cinco años de cierres.

**Falta.** Arrastrar sobre la gráfica para acotar un rango a mano y
comparar un periodo contra el anterior en la misma caja.
