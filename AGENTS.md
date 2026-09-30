# Guía visual de LumoraEvents

Esta guía parte del rediseño actual de Schedule. Amplíala gradualmente cuando otra pantalla necesite patrones nuevos; no diseñes por adelantado componentes sin uso real.

- **Fuente visual:** `css/lumora-ui.css` contiene los tokens y componentes compartidos `lm-*`. `css/schedule.css` contiene solo estilos de Schedule. Consulta `schedule.html`, `header.html` y `footer.html` como ejemplos actuales, sin copiar su composición a otras pantallas.
- **Estilo:** fondo azul negro, superficies algo más claras, bordes azulados finos, texto claro y secundario gris azulado. Usa cyan o azul para información y acciones; verde para live y éxito; violeta para elementos secundarios; ámbar para pendientes y descansos; rojo para errores. Radios modernos, sombras suaves y efectos discretos.
- **Diseño responsive:** empieza por 320–430 px, evita el scroll horizontal y conserva buena densidad y legibilidad. Diseña la composición de escritorio según el contenido de cada pantalla, con un ancho máximo razonable; no ensanches simplemente la vista móvil.
- **Implementación:** usa CSS puro y los tokens existentes antes de añadir valores. Coloca los patrones realmente reutilizables en `lumora-ui.css` y lo propio de cada pantalla en su CSS. Mantén Bootstrap para comportamientos existentes cuando corresponda, pero usa clases propias para la apariencia. No introduzcas Tailwind, Sass ni un proceso de build.
- **Continuidad:** un cambio visual debe preservar API, permisos, navegación, traducciones y comportamiento. Mantén botones reales, estados accesibles, contraste y foco visible. Los templates compartidos de header y footer usan valores de respaldo porque otras páginas todavía no cargan `lumora-ui.css`.
- **Validación visual:** en tareas de diseño no ejecutes pruebas visuales ni generes previews o capturas. La validación visual la realiza personalmente el usuario.
