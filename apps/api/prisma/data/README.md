# Catálogo UBIGEO

`peru-ubigeo-inei.json` contiene departamentos, provincias y distritos con
códigos INEI y coordenadas distritales. Se obtuvo del dataset abierto
`ubigeo-peru-aumentado`, que documenta la equivalencia de códigos INEI y
RENIEC y sus fuentes públicas.

Fuente: https://github.com/jmcastagnetto/ubigeo-peru-aumentado

El seed usa el código INEI de seis dígitos como identificador de distrito,
deriva los códigos de departamento y provincia, y calcula centros provinciales
promediando las coordenadas distritales válidas.
