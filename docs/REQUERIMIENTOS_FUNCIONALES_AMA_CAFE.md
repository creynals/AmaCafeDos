# REQUERIMIENTOS FUNCIONALES — PILOTO DIGITAL AMA CAFE

**Version:** 1.0  
**Fecha:** 7 de abril de 2026  
**Preparado para:** Propietario de AMA Cafe  
**Preparado por:** Equipo de Desarrollo  
**Estado:** Borrador para revision y aprobacion

---

## 1. INTRODUCCION

Este documento describe en detalle los **requerimientos funcionales** cubiertos en el piloto digital de AMA Cafe. Su proposito es dejar constancia clara y explicita de lo que la plataforma hace, como lo hace, y bajo que condiciones opera.

Esta dirigido al propietario del negocio como referencia para validar que lo construido corresponde a lo acordado.

---

## 2. CATALOGO DIGITAL DE PRODUCTOS

### 2.1 Navegacion por Categorias

El cliente accede al menu completo organizado en **8 categorias**:

| # | Categoria | Productos | Ejemplos |
|---|-----------|-----------|----------|
| 1 | Caffe | 17 | Espresso, Cappuccino, Latte, Mocha, Americano |
| 2 | Bebidas Heladas | 7 | Cafe Helado, Iced Latte, Matcha Frio |
| 3 | Te e Infusiones | 5 | Te Verde, Manzanilla, Matcha Latte |
| 4 | Helados | 2 | Copa de Helado |
| 5 | Panaderia | 5 | Croissant, Rol de Canela, Medialunas |
| 6 | Preparaciones Frias | 1 | Tres Leches |
| 7 | Bebidas | 4 | Jugos, Granizados, Agua |
| 8 | Cafe en Grano | 3 | Cafe de especialidad para llevar |

**Total: 44+ productos catalogados.**

### 2.2 Busqueda de Productos

- El cliente puede buscar productos por nombre desde la barra de busqueda.
- Los resultados se filtran en tiempo real mientras el cliente escribe.

### 2.3 Detalle de Producto

Al seleccionar un producto, el cliente visualiza:

- **Nombre** del producto
- **Imagen** de referencia
- **Precio** en pesos
- **Opciones adicionales** (cuando aplica): leche de almendra, salsa de chocolate, caramelo, Nutella, leche condensada, fresa
- **Selector de cantidad**

---

## 3. CARRITO DE COMPRAS

### 3.1 Funcionalidades del Carrito

| Accion | Descripcion |
|--------|-------------|
| **Agregar producto** | Desde la tarjeta del producto (boton rapido) o desde el detalle del producto con opciones y cantidad |
| **Modificar cantidad** | Aumentar o disminuir la cantidad de un producto ya agregado |
| **Eliminar producto** | Remover un producto individual del carrito |
| **Vaciar carrito** | Eliminar todos los productos de una vez |
| **Ver resumen** | Desglose de productos, cantidades, precios unitarios y total acumulado |

### 3.2 Persistencia del Carrito

- El carrito se mantiene activo durante toda la sesion del cliente.
- Cada sesion genera un identificador unico de carrito.
- El carrito se almacena en el servidor, no solo en el navegador.

---

## 4. PROCESO DE COMPRA (CHECKOUT)

### 4.1 Flujo de 4 Pasos

El proceso de compra guia al cliente a traves de los siguientes pasos:

**Paso 1 — Revision del Pedido**
- El cliente confirma los productos seleccionados, cantidades y total.
- Puede regresar al carrito para hacer ajustes.

**Paso 2 — Datos de Contacto**
- Nombre completo del cliente
- Numero de telefono
- Correo electronico

**Paso 3 — Direccion de Entrega**
- Direccion donde el cliente desea recibir su pedido.

**Paso 4 — Metodo de Pago**
- Seleccion del medio de pago entre las opciones disponibles:

| Metodo | Descripcion |
|--------|-------------|
| Efectivo | Pago en efectivo al momento de la entrega |
| Transferencia | Transferencia bancaria |
| Tarjeta de Debito | Pago con tarjeta de debito |
| Tarjeta de Credito | Pago con tarjeta de credito |

### 4.2 Confirmacion del Pedido

- Al completar el checkout, se genera un **numero de orden**.
- El cliente recibe una pantalla de confirmacion con el resumen completo: productos, cantidades, total, datos de contacto, direccion y metodo de pago seleccionado.
- El carrito se vacia automaticamente tras la confirmacion.

---

## 5. MEDIO DE PAGO — INTEGRACION CON SUMUP

### 5.1 Alcance de la Integracion

- La plataforma se integrara con **SumUp** como procesador de pagos en linea.
- Los clientes podran pagar sus pedidos de forma segura directamente desde la plataforma web.
- Se aceptaran los metodos de pago habilitados en la cuenta SumUp del negocio.
- Cada transaccion quedara registrada tanto en la plataforma como en el panel de SumUp.

### 5.2 Requisitos del Cliente

> **El propietario de AMA Cafe debera proporcionar:**
> - Accesos a la plataforma SumUp (credenciales de API o cuenta de desarrollador)
> - Configuracion activa del catalogo de productos en SumUp

---

## 6. GESTION DE INVENTARIO — SINCRONIZACION CON SUMUP

### 6.1 Alcance de la Integracion

- Los productos disponibles en la tienda digital se sincronizaran con el catalogo de SumUp.
- El stock y la disponibilidad de productos se gestionaran desde SumUp, reflejandose automaticamente en la plataforma web.
- Esto permite al propietario manejar un **punto unico de control** para su inventario.

### 6.2 Requisitos del Cliente

> **El propietario de AMA Cafe debera proporcionar:**
> - Accesos a la plataforma SumUp para habilitar la sincronizacion de inventario

---

## 7. ASISTENTE INTELIGENTE PARA CLIENTES (AI)

### 7.1 Descripcion

Un **chat inteligente** disponible en la tienda digital que asiste a los clientes en tiempo real.

### 7.2 Capacidades

| Capacidad | Ejemplo de Uso |
|-----------|---------------|
| **Recomendaciones personalizadas** | *"Quiero algo dulce y frio, que me recomiendas?"* |
| **Informacion de productos** | *"Que opciones tiene el Cappuccino?"* |
| **Consulta de precios** | *"Cuanto cuesta el Mocha?"* |
| **Asistencia en el pedido** | *"Que es lo mas vendido de panaderia?"* |
| **Respuestas conversacionales** | El asistente comprende preguntas en lenguaje natural y responde de forma amigable |

### 7.3 Funcionamiento Tecnico

- El asistente tiene acceso al **menu completo** de productos con precios, categorias y opciones.
- Tambien tiene visibilidad del **carrito actual** del cliente para dar recomendaciones contextuales.
- Opera con modelos de inteligencia artificial (LLM) provistos a traves de **OpenRouter, sin costo adicional**.

---

## 8. PANEL DE ADMINISTRACION (ADM)

### 8.1 Acceso

- Se accede desde el boton **"ADM"** ubicado en la esquina superior derecha de la barra de navegacion, junto al icono del carrito de compras.
- El panel esta organizado en **pestanas** para facilitar la navegacion.

### 8.2 Pestana: Gestion de Productos

#### Dashboard de Metricas

| Metrica | Descripcion |
|---------|-------------|
| Total de productos | Cantidad de productos en catalogo |
| Total de pedidos | Numero de ordenes realizadas |
| Ingresos totales | Suma total de ventas en pesos |
| Ticket promedio | Valor promedio por orden |

#### Inventario

- Tabla completa con: producto, categoria, precio, unidades vendidas, ingresos generados, estado de stock.
- Permite identificar rapidamente productos con stock bajo o agotados.

#### Productos Mas Vendidos

- Ranking de los **10 productos mas vendidos** por cantidad.
- Visualizacion con barras de progreso para comparacion rapida.

#### Analisis de Margen

- Tabla con el **porcentaje de contribucion** de cada producto al ingreso total.
- Permite identificar que productos generan mayor rentabilidad para el negocio.

#### Filtro por Periodo (Calendario)

- Todas las vistas del panel incluyen un **filtro de rango de fechas**.
- Opciones rapidas: ultimos 7 dias, ultimos 30 dias, ultimos 3 meses, o todo el historico.
- Tambien permite seleccionar fechas manualmente con calendario.
- El filtro aplica simultaneamente a todas las metricas de la pestana.

### 8.3 Pestana: Clientes

#### Ranking de Clientes

- Lista de clientes ordenados por volumen de compra.
- Incluye: nombre, correo, telefono, total gastado, cantidad de pedidos.

#### Clientes con Mejor Margen

- Clientes que compran los productos de mayor valor.

#### Clientes Mas Frecuentes

- Clientes con mayor numero de pedidos realizados.

#### Detalle de Cliente

- Al seleccionar un cliente, se despliega su historial: ordenes realizadas, productos comprados, montos y fechas.

#### Filtro por Periodo

- Al igual que en productos, la pestana de clientes incluye el **filtro de rango de fechas** para segmentar el analisis por ventana de tiempo.

### 8.4 Asistente Inteligente para el Negocio (AI — Panel ADM)

#### Descripcion

Un **chat inteligente exclusivo para el propietario**, disponible dentro del panel de administracion.

#### Capacidades

| Capacidad | Ejemplo de Uso |
|-----------|---------------|
| **Analisis de ventas** | *"Cuales fueron los productos mas vendidos esta semana?"* |
| **Comparaciones** | *"Como se comparan las ventas de cafe versus panaderia?"* |
| **Clientes frecuentes** | *"Quienes son mis mejores clientes?"* |
| **Clientes inactivos** | *"Que clientes han dejado de comprar?"* |
| **Ideas de campanas** | *"Dame ideas para una promocion de fin de semana"* |
| **Reportes bajo demanda** | *"Cual fue mi ingreso total en marzo?"* |

#### Funcionamiento Tecnico

- El asistente tiene acceso a **todos los datos del negocio**: productos, ventas, pedidos, clientes, inventario y margenes.
- Procesa la informacion y responde en lenguaje natural, sin necesidad de navegar tablas o graficos.
- Opera con modelos de inteligencia artificial (LLM) provistos a traves de **OpenRouter, sin costo adicional**.

---

## 9. CONDICIONES TECNICAS Y OPERATIVAS

### 9.1 Despliegue y Hospedaje

| Aspecto | Detalle |
|---------|---------|
| **Responsable del hosting** | El cliente (propietario de AMA Cafe) |
| **Configuracion y despliegue** | El equipo de desarrollo configura y despliega la aplicacion en la infraestructura que el cliente designe |
| **Costos de hosting** | A cargo del cliente |
| **Orientacion** | Se proporcionara orientacion sobre opciones de hosting recomendadas si el cliente lo requiere |

### 9.2 Inteligencia Artificial — Sin Costos Adicionales

| Aspecto | Detalle |
|---------|---------|
| **Proveedor de modelos** | OpenRouter |
| **Costo para el cliente** | Sin costo adicional (modelos gratuitos) |
| **Idioma** | Comprension y respuesta en espanol |
| **Escalamiento futuro** | Si se requieren modelos de mayor capacidad, se evaluara con su respectivo analisis de costos |

### 9.3 Integracion con SumUp — Accesos del Cliente

| Requisito | Responsable |
|-----------|-------------|
| Credenciales de API o acceso a cuenta de desarrollador SumUp | Cliente |
| Catalogo de productos cargado y actualizado en SumUp | Cliente |
| Integracion tecnica con la plataforma | Equipo de Desarrollo |

---

## 10. PLATAFORMA TECNICA

### 10.1 Acceso de los Clientes

- La plataforma es **100% web**, accesible desde cualquier navegador moderno.
- Compatible con **celular, tablet y computador** (diseno responsivo).
- **No requiere instalacion** de aplicacion — funciona directamente desde el navegador.

### 10.2 Disponibilidad

- La plataforma estara disponible **24/7**, sujeta a la disponibilidad del servicio de hosting contratado por el cliente.

---

## 11. FUNCIONALIDADES EXCLUIDAS DEL PILOTO

Las siguientes funcionalidades **no estan incluidas** en esta primera fase:

| Funcionalidad | Motivo | Alternativa en el Piloto |
|---------------|--------|--------------------------|
| Integracion con servicio de delivery externo | Requiere acuerdos con plataformas de reparto | El propietario y/o sus colaboradores gestionaran las entregas directamente |
| Programa de fidelizacion / puntos | Funcionalidad avanzada para fase posterior | Se evaluara una vez validado el piloto |
| Multiples sucursales | El piloto cubre una unica ubicacion | Escalable en fases posteriores |
| App movil nativa | La web es accesible desde cualquier celular | La plataforma web es responsiva y se adapta a todos los dispositivos |
| Autenticacion de usuarios (login) | No requerido para el piloto | Los clientes realizan pedidos sin necesidad de crear cuenta |
| Notificaciones push o email automatico | Funcionalidad complementaria para fase posterior | Comunicacion directa entre propietario y cliente |

---

## 12. RESPONSABILIDADES

### 12.1 Equipo de Desarrollo

| # | Responsabilidad |
|---|-----------------|
| 1 | Desarrollo y entrega de todas las funcionalidades descritas en este documento |
| 2 | Configuracion y despliegue de la plataforma en el hosting provisto por el cliente |
| 3 | Integracion tecnica con SumUp (pagos e inventario) |
| 4 | Configuracion de los asistentes inteligentes con modelos de AI sin costo |
| 5 | Soporte tecnico durante la fase de piloto para resolver incidencias |
| 6 | Capacitacion basica al propietario sobre el uso del panel de administracion |

### 12.2 Cliente (Propietario de AMA Cafe)

| # | Responsabilidad |
|---|-----------------|
| 1 | Proveer el servicio de hosting o nube donde se desplegara la plataforma |
| 2 | Proveer los accesos y credenciales a la plataforma SumUp |
| 3 | Mantener actualizado el catalogo de productos y precios en SumUp |
| 4 | Gestionar directamente las entregas de pedidos durante la fase de piloto |
| 5 | Proporcionar retroalimentacion sobre el funcionamiento de la plataforma |
| 6 | Asumir los costos de hosting y de la cuenta de SumUp |

---

## 13. RESUMEN DE FUNCIONALIDADES

| # | Funcionalidad | Estado | Descripcion |
|---|---------------|--------|-------------|
| RF-01 | Catalogo de productos | Incluido | Navegacion por 8 categorias, 44+ productos, busqueda y detalle |
| RF-02 | Carrito de compras | Incluido | Agregar, modificar, eliminar productos y ver resumen |
| RF-03 | Checkout (4 pasos) | Incluido | Revision, contacto, direccion, pago y confirmacion |
| RF-04 | Medios de pago | Incluido | Efectivo, transferencia, tarjeta debito/credito. Integracion SumUp |
| RF-05 | Inventario | Incluido | Sincronizacion con SumUp, control de stock |
| RF-06 | AI para clientes | Incluido | Chat inteligente con recomendaciones y asistencia |
| RF-07 | Panel ADM — Productos | Incluido | Dashboard, inventario, mas vendidos, margen, filtro calendario |
| RF-08 | Panel ADM — Clientes | Incluido | Ranking, margen, frecuencia, detalle, filtro calendario |
| RF-09 | AI para negocio | Incluido | Chat inteligente con insights de ventas, clientes y campanas |
| RF-10 | Plataforma web responsiva | Incluido | Acceso desde celular, tablet y computador |

---

## 14. FIRMAS DE CONFORMIDAD

| Rol | Nombre | Firma | Fecha |
|-----|--------|-------|-------|
| Propietario AMA Cafe | _________________ | _________________ | ___/___/2026 |
| Equipo de Desarrollo | _________________ | _________________ | ___/___/2026 |

---

*Documento de Requerimientos Funcionales — Piloto Digital AMA Cafe*  
*Version 1.0 — Abril 2026*
