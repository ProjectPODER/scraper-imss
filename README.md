# scraper-imss
Scraper del sitio de compras del IMSS (México)

### Uso

    node index.js [-y AÑOS -v -o SALIDA -s CAT SUBCAT RUBRO]

### Parámetros

    -y --year       Años a scrapear (listado separado por espacios)
    -v --verbose    Mostrar información de debug
    -o --output     Modo de salida
    -s --startFrom  Iniciar scrapeo desde una categoría/subcategoría/rubro

##### Especificar un punto de partida

Con el argumento -s es posible iniciar el scrapeo de un año a partir de una categoría/subcategoría/rubro específicos. El parámetro se especifica como una secuencia de 3 strings, esperando como mínimo el ID de una categoría y aceptando además el ID de una subcategoría y de un rubro (si aplica). Los resultados se agregarán al final del archivo JSON de ese año si ya existe.

### Salida

Stream de JSON lines, un contrato por línea.

##### Modos de salida

    file    Guardar contratos en un archivo JSON lines dentro de la carpeta output (AÑO.json).
    stdout  Los contratos se muestran directamente en la consola
