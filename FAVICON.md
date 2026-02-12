# Favicon Assets

Este directorio contiene los recursos de favicon para el sitio.

## Archivos Creados

### favicon.svg
Favicon moderno en formato SVG con un ícono de cerebro/IA en gradiente morado-índigo. Este formato es escalable y funciona en todos los navegadores modernos.

### apple-touch-icon.svg  
Versión de 180x180px del ícono optimizada para dispositivos Apple (iPhone, iPad). También en formato SVG.

## Generar favicon.ico (Opcional)

Para compatibilidad con navegadores antiguos, puedes generar un `favicon.ico` desde el SVG usando herramientas en línea:

### Opción 1: Herramientas en línea (Recomendado)
1. Visita: https://realfavicongenerator.net/
2. Sube el archivo `favicon.svg`
3. Descarga el paquete generado con todos los tamaños

### Opción 2: ImageMagick (Línea de comandos)
```bash
# Convertir SVG a PNG de varios tamaños
convert -background none favicon.svg -resize 16x16 favicon-16.png
convert -background none favicon.svg -resize 32x32 favicon-32.png
convert -background none favicon.svg -resize 48x48 favicon-48.png

# Combinar en un archivo ICO
convert favicon-16.png favicon-32.png favicon-48.png favicon.ico
```

### Opción 3: GIMP
1. Abre `favicon.svg` en GIMP
2. Escala a 32x32 o 16x16
3. Exporta como `.ico`

## Referencias en HTML

Las referencias al favicon ya están incluidas en el `<head>` de index.html:

```html
<!-- Favicons -->
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="alternate icon" href="favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="favicon.svg" />
<link rel="icon" type="image/png" sizes="16x16" href="favicon.svg" />
```

## Diseño del Icono

El favicon utiliza:
- **Colores**: Gradiente de #4f46e5 (índigo) a #7c3aed (morado)
- **Icono**: Representación estilizada de un cerebro/red neuronal de IA
- **Elementos**: Nodos conectados que simbolizan machine learning y redes neuronales
- **Estilo**: Moderno, minimalista, profesional

## Compatibilidad

- ✅ Chrome, Edge, Firefox, Safari (modernos) - Usan favicon.svg
- ✅ iOS/iPadOS - Usa apple-touch-icon.svg
- ✅ Android PWA - Usa iconos del manifest.json
- ⚠️ Internet Explorer, navegadores antiguos - Requieren favicon.ico (opcional)

## Notas

El formato SVG tiene ventajas:
- Tamaño de archivo muy pequeño (< 1KB)
- Escalable a cualquier resolución
- Soporte para dark mode (puede personalizarse con CSS)
- No requiere múltiples archivos PNG
