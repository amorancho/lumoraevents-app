Las pruebas de `registration-extras.test.cjs` verifican el comportamiento del DOM y las peticiones con una API simulada. No renderizan la página ni realizan comprobaciones visuales, previews o capturas.

`registration-quotas.test.cjs` comprueba el parámetro `reg_quota` en Admin y `eventObj.registrationQuota`, los permisos y la navegación condicional, el CRUD autenticado de cupos, el estilo obligatorio, el valor cero, duplicados, errores, reintentos y cambios de evento. Se ejecuta con `node --test tests/registration-quotas.test.cjs`, usando la misma dependencia externa `jsdom` y una API simulada, sin validación visual.

También verifica el estado OPEN/CLOSE en altas y ediciones, las acciones Abrir/Cerrar mediante PATCH `/api/registrations/quotas/:id/status`, su autenticación para organizer/admin, los errores 400/401/403/404/409 y el bloqueo de peticiones duplicadas.

`registration-quota-availability.test.cjs` verifica la consulta autenticada `/api/registrations/quotas/availability?event_id=…` para escuelas, organización y administración; la ausencia de indicadores de plazas en tablas y tarjetas; el modal de alta y edición; las combinaciones sin límite; errores y reintentos; traducciones y cambios de evento. Calcula disponibles como `max(0, quota - occupied_places)` y comprueba que CLOSE o cero plazas muestran el aviso de cierre y bloquean nuevas altas, conservando la edición de inscripciones existentes. Usa la misma dependencia externa `jsdom`, sin renderizado ni capturas.

`registration-sidebar.test.cjs` verifica los tres modos del sidebar de escritorio, la persistencia de la elección, el funcionamiento sin almacenamiento, los tooltips y acciones de su cabecera, y la conservación del menú móvil. Usa `jsdom` 26 y se ejecuta con `node --test tests/registration-sidebar.test.cjs`, sin renderizar ni realizar comprobaciones visuales.

`registration-category-prices.test.cjs` comprueba los rangos de precios recibidos de API, su orden, los importes en céntimos, el indicador `is_current` y las fechas del evento como respaldo cuando no hay rangos. Usa `jsdom` 26 y se ejecuta con `node --test tests/registration-category-prices.test.cjs`, sin renderizado ni pruebas visuales.

`registration-wop-import.test.cjs` comprueba la selección de GEN/WOP y los permisos, el análisis automático al elegir un Excel válido, el límite de 5 MB, el envío multipart sin mapeo, los resultados y errores por fila, la conservación de fechas y documentos, la confirmación exclusiva de filas válidas, los errores de API, el bloqueo de envíos duplicados y la recarga tras el `201`. Usa la misma dependencia `jsdom` 26 y se ejecuta con `node --test tests/registration-wop-import.test.cjs`; todas las respuestas de API están simuladas.

`registration-fees.test.cjs` comprueba los cálculos de NON, PAR, SCH y REG, las categorías exentas, los participantes únicos, la validación de inscripciones y los totales y saldos del Dashboard. Solo necesita Node.js y se ejecuta con `node --test tests/registration-fees.test.cjs`.

Las pruebas de DOM de `registration-extras.test.cjs` también comprueban los cuatro tipos de fee en Payments y Competitions, la ocultación de NON, el filtro por escuela y la conservación de los totales suministrados por la API de extras.

Requieren Node.js 20 o posterior y `jsdom` 26. Se puede instalar la dependencia en una carpeta temporal sin añadir dependencias ni un proceso de build a la aplicación:

```powershell
$extrasTests = Join-Path $env:TEMP 'lumora-extras-validation'
npm install --prefix $extrasTests --no-package-lock --no-audit --no-fund jsdom@26
$env:NODE_PATH = Join-Path $extrasTests 'node_modules'
node --test tests/registration-extras.test.cjs
```

Se ejercitan los perfiles school, organizer y admin; el interruptor del evento; la autenticación real de `js/utils.js`; los catálogos; los mantenimientos; las modalidades FIXED/FLEX; las reservas pendientes y resueltas; los errores de API; los filtros y la paginación; las operaciones por cuenta; los descuentos; las traducciones; y la integración con los pagos existentes.

Las personas de workshops, packs y servicios proceden de la consulta compartida de Participantes (`GET /api/participants`, con `event_id` y, para una cuenta concreta, `school_id`). Se comprueban el CRUD original de participantes, las personas sin inscripción en competición, las cuentas sin participantes, los nombres en listados y detalles, la selección y cambio de participante por cuenta, y los servicios sin persona asociada. El contrato de reservas conserva `attendee_id`, que identifica a un `registration_participant`.

Los importes de `/api/extras` se interpretan en euros decimales. `RegistrationExtras.getFinanceSummary()` los convierte a céntimos para los cálculos y formateadores existentes de Inscripciones. `total_amount` se toma directamente como total debido; solo se restan los pagos validados para calcular el saldo pendiente.

El resumen de cuenta ya incluye las inscripciones PEN y VAL. Para mostrar también
CRE y REJ, el front añade únicamente esos importes y las cuotas calculadas fuera
del resumen. El desglose de inscripciones usa los importes guardados de cada fila:
los extras validados y descuentos aparecen aparte en el Dashboard, sin atribuirlos
a inscripciones validadas ni volver a sumar suplementos.

Las tarifas de workshops, packs y servicios se gestionan mediante `/admin/{recurso}/{id}/prices` (GET/POST) y `/admin/{recurso}/{id}/prices/{priceId}` (PATCH/DELETE). Las pruebas comprueban rangos inclusivos, límites del periodo de inscripción sin convertir zonas horarias, importes decimales positivos, solapamientos y conflictos concurrentes, recarga tras las escrituras y ausencia de `price` en el CRUD de productos. También cubren el bloqueo de nuevas reservas sin tarifa vigente, la recuperación del código `extras_price_not_available` y la edición de reservas pendientes con su importe histórico.

La regresión del modal de tarifas pulsa los botones reales «Añadir precio» y «Guardar precio» para verificar POST y PATCH, además de comprobar que cancelar la edición solo limpia los campos. No se limita a emitir un evento `submit` directamente.

Los endpoints usados parten de `/api/extras`:

| Ámbito | Recursos y operaciones |
| --- | --- |
| Organización | CRUD mediante GET/POST/PATCH/DELETE de `/admin/workshops`, `/admin/packs`, `/admin/services` y `/admin/discount-codes`; GET de detalles |
| Ocupación, composición y usos | GET `/admin/workshops/:id/occupancy`, PUT `/admin/packs/:id/workshops`, GET `/admin/discount-codes/:id/usage` |
| Reservas de organización | GET `/admin/bookings` y `/:id`; POST `/:id/validate` y `/:id/reject` sin body |
| Catálogo | GET `/catalog/workshops`, `/catalog/packs`, `/catalog/services` y sus detalles |
| Cuenta propia | GET/POST/PATCH/DELETE de `/bookings`, con GET de detalles; GET/POST/DELETE `/account/discount`; GET `/account/summary` |
| Administración por cuenta | GET/POST/PATCH/DELETE de `/admin/accounts/:accountId/bookings`, con GET de detalles; GET/POST/DELETE `/discount`; GET `/summary` dentro de esa cuenta |

Los resúmenes se consultan de nuevo cada vez que se abre una pestaña que los necesita, sin caché temporal ni polling. Dashboard y Pagos hacen una petición económica por entrada: `GET /api/extras/admin/finance-summary` para organización/admin y `GET /api/extras/account/summary` para escuelas. La respuesta global contiene todas las cuentas del evento, incluidas las individuales y las de importe cero; Pagos filtra esa respuesta en memoria sin nuevas peticiones. El resumen del detalle de una escuela hace una petición a `/admin/accounts/:accountId/summary` cada vez que se abre su subpestaña.

`GET /api/extras/admin/summary` corresponde al Resumen de extras (productos y reservas validadas), y se pide una vez en cada entrada o al pulsar Actualizar. Sus filtros y el cambio de idioma solo redibujan los datos de esa vista. Las notificaciones de carga inicial no generan llamadas de resumen adicionales, y las mutaciones en otras pestañas tampoco. Una operación real en una vista consumidora puede recargar su resumen una vez. Las respuestas antiguas no sustituyen a la petición de la vista actual; los errores y 429 no se reintentan automáticamente.

Pruebas de este desarrollo, sin ejecutar la suite anterior ni generar renderizados/capturas:

```powershell
$env:NODE_PATH = Join-Path $env:TEMP 'lumora-extras-validation/node_modules'
node --test --test-name-pattern='summary loading:' tests/registration-extras.test.cjs
```

El endpoint financiero global está implementado en el repositorio vecino `lumoraevents-api`: el contrato se documenta en `docs/extras-finance-summary-frontend-contract.md` y sus pruebas son `tests/extrasFinanceSummaryApi.test.js` y `tests/extrasFinanceSummaryData.test.js`. La consulta agrupa inscripciones y reservas por cuenta, reutiliza la selección de tarifas/suplementos existente y aplica el descuento efectivo por cuenta antes de sumar. No requiere migración. Desplegar la API antes que este frontend; no hay fallback a una petición por escuela.

`registration-payments-loading.test.cjs` verifica la carga única de `/api/registrations/payments?event_id=…`. `setupRegistrationNavigation` inicializa Pagos antes de abrir la primera pestaña; ese módulo es el único que consulta el listado y publica los datos compartidos con ambos Dashboard. Cada entrada en Dashboard o Pagos hace un GET nuevo, sin caché temporal. Las notificaciones de inscripciones/escuelas, los filtros y el idioma solo redibujan los datos. Las escrituras correctas recargan una vez si hay una vista consumidora activa; desde otra pestaña se espera a la siguiente entrada. Se ignoran respuestas antiguas por navegación o cambio de evento y no hay reintentos automáticos. No se modifica la API de pagos.

Esta prueba usa DOM, autenticación y respuestas simuladas, sin pruebas visuales. Cubre school, organizer y admin, importes de Dashboard/Pagos, facturas, filtros, errores, cambios de evento, operaciones de alta/edición/validación/rechazo/borrado, cancelación y operaciones pendientes al abandonar la pestaña. Ejecutar solo las pruebas de este desarrollo:

```powershell
$env:NODE_PATH = Join-Path $env:TEMP 'lumora-extras-validation/node_modules'
node --test tests/registration-payments-loading.test.cjs
node --test --test-name-pattern='summary loading:' tests/registration-extras.test.cjs
```

Las respuestas de servidor están simuladas: la validación contra una API real y la revisión visual en móvil y escritorio deben realizarse en un entorno con evento y credenciales de prueba.
`registration-category-confirmation.test.cjs` comprueba las consultas previas de categorías y precios, la confirmación y cancelación, los errores y reintentos, los importes en céntimos y el bloqueo de envíos duplicados. Se ejecuta con `node --test tests/registration-category-confirmation.test.cjs`; usa API y eventos de modal simulados, sin renderizar ni generar capturas.
