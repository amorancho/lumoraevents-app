Las pruebas de `registration-extras.test.cjs` verifican el comportamiento del DOM y las peticiones con una API simulada. No renderizan la página ni realizan comprobaciones visuales, previews o capturas.

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

Los endpoints usados parten de `/api/extras`:

| Ámbito | Recursos y operaciones |
| --- | --- |
| Organización | CRUD mediante GET/POST/PATCH/DELETE de `/admin/workshops`, `/admin/packs`, `/admin/services` y `/admin/discount-codes`; GET de detalles |
| Ocupación, composición y usos | GET `/admin/workshops/:id/occupancy`, PUT `/admin/packs/:id/workshops`, GET `/admin/discount-codes/:id/usage` |
| Reservas de organización | GET `/admin/bookings` y `/:id`; POST `/:id/validate` y `/:id/reject` sin body |
| Catálogo | GET `/catalog/workshops`, `/catalog/packs`, `/catalog/services` y sus detalles |
| Cuenta propia | GET/POST/PATCH/DELETE de `/bookings`, con GET de detalles; GET/POST/DELETE `/account/discount`; GET `/account/summary` |
| Administración por cuenta | GET/POST/PATCH/DELETE de `/admin/accounts/:accountId/bookings`, con GET de detalles; GET/POST/DELETE `/discount`; GET `/summary` dentro de esa cuenta |

El resumen global de organización agrega los resúmenes individuales, con un máximo de cuatro peticiones simultáneas, porque el contrato suministrado no incluye un endpoint de resumen global. Un fallo de resumen se muestra con opción de reintento y deja el total y el saldo como no disponibles.

Las respuestas de servidor están simuladas: la validación contra una API real y la revisión visual en móvil y escritorio deben realizarse en un entorno con evento y credenciales de prueba.
