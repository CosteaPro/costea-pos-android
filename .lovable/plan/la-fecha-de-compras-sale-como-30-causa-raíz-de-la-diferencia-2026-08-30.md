# La fecha de compras sale como 30: causa raíz de la diferencia con el P&G

## Qué está pasando (confirmado)

El formulario de compras propone la fecha con la hora **universal (UTC)**, no con la hora
de Ecuador. Desde las 19:00 de Ecuador en adelante, UTC ya está en el día siguiente, así que
a las 21:00 del 29 el sistema propone **30/08** y la compra queda guardada con fecha de mañana.

Eso explica exactamente la diferencia que viste entre el P&G y el inventario:

- Tres compras quedaron fechadas el 30/08: Víveres 104,50 + 36,09 y Legumbres 59,50.
- El P&G de agosto llega al 31/08 → las incluye (Víveres 746,77 · Legumbres 475,16).
- El reporte de inventario que miraste llega al 29/08 → no las ve (606,18 · 415,66).
- 140,59 y 59,50 de diferencia: cuadra al centavo.

## Qué se va a hacer

1. **La fecha por defecto de una nueva compra es el día de Ecuador (UTC-5).** A las 21:00 del
   29 de agosto propone 29/08, no 30/08.
2. **Guardar la compra con la fecha elegida en hora de Ecuador**, para que caiga siempre en
   el día contable correcto sin depender del reloj del equipo.
3. **Los filtros de fecha del historial de compras** también usan el día contable de Ecuador,
   así una compra del 29 aparece al filtrar el 29.
4. **Corregir las tres compras del 30/08** ya registradas, moviéndolas al 29/08 (con tu
   confirmación). Tras eso, P&G e inventario coinciden solos.
5. El "Hoy: …" que muestra la pantalla de nueva compra pasa a mostrar el día de Ecuador.

No cambia ninguna fórmula de costos ni de inventario: solo la zona horaria de las fechas.

## Detalles técnicos

- `src/components/admin/purchasing.tsx`: reemplazar `new Date().toISOString().slice(0, 10)`
  por `fechaEc()` de `src/lib/fecha-ec.ts` en el estado inicial, en el reinicio del formulario
  y en el rótulo "Hoy". Guardar `purchased_at` como `` `${emissionDate}T12:00:00-05:00` ``
  en vez de construir la fecha con la zona del navegador. Los filtros `from`/`to` pasan a usar
  `desdeEc(from)` / `hastaEc(to)`.
- Revisar `paid_at` y `fmtDate` del mismo módulo para que muestren y guarden en UTC-5.
- Corrección de datos: mover `purchased_at` de las tres compras del 30/08 al 29/08 (12:00 -05:00).
