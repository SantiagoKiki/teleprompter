# Teleprompter

Teleprompter horizontal hecho con HTML, CSS y JavaScript puro. El texto avanza de derecha a izquierda en una sola franja y la palabra que toca leer se resalta al cruzar la línea de lectura.

Funciona sin conexión, sin cuentas y sin instalar nada.

## Cómo usarlo

1. Abre `index.html` en el navegador (doble clic basta) o usa la versión publicada en GitHub Pages.
2. Escribe o pega tu guion, o abre un archivo `.txt` (también puedes arrastrarlo al editor).
3. Ajusta velocidad, tamaño de letra, posición de la franja y colores.
4. Presiona **Iniciar** (o `Ctrl` + `Enter`).

El guion y los ajustes se guardan en el navegador, así que siguen ahí la próxima vez que lo abras.

## Funciones

- Desplazamiento horizontal suave, con la velocidad en palabras por minuto (ppm).
- Resalta la palabra actual y atenúa el texto ya leído.
- Franja arriba (cerca de la cámara), al centro o abajo.
- Línea de lectura ajustable.
- Modo espejo para usarlo con un cristal de teleprompter.
- Cuenta regresiva, barra de progreso y tiempo restante.
- Pantalla completa, y la pantalla no se apaga mientras el texto avanza.
- Controles por teclado, rueda del ratón, arrastre y toque (sirve en celular y tablet).

## Atajos

| Tecla | Acción |
| --- | --- |
| `Espacio` | Reproducir / pausar |
| `↑` / `↓` | Más / menos velocidad |
| `←` / `→` | Palabra anterior / siguiente (`Shift`: 10 palabras) |
| `+` / `-` | Tamaño de letra |
| `R` | Volver al inicio |
| `M` | Modo espejo |
| `F` | Pantalla completa |
| `Esc` | Volver al editor |
| Rueda o arrastrar | Mover el texto a mano |
| Clic o toque | Reproducir / pausar |

## Estructura

```
index.html      Editor y vista del teleprompter
css/styles.css  Estilos
js/app.js       Lógica: desplazamiento, controles y guardado
favicon.svg     Icono
```

## Publicarlo en GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`. Quedará en `https://<usuario>.github.io/teleprompter/`.
