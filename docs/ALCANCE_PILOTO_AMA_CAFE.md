# DOCUMENTO DE ALCANCE - PILOTO DIGITAL AMA CAFÉ

**Versión:** 1.0  
**Fecha:** 7 de abril de 2026  
**Preparado para:** Propietario de AMA Café  
**Preparado por:** Equipo de Desarrollo  
**Estado:** Borrador para revisión y aprobación

---

## 1. PROPÓSITO DE ESTE DOCUMENTO

El presente documento tiene como objetivo describir, de manera clara y transparente, el alcance del **piloto digital** de AMA Café. Aquí se detallan las funcionalidades que estarán disponibles, las responsabilidades de cada parte, y las condiciones bajo las cuales operará la plataforma.

Este documento sirve como acuerdo de entendimiento entre ambas partes sobre **qué incluye** y **qué no incluye** esta primera fase.

---

## 2. VISIÓN DEL PILOTO

Crear una **presencia digital profesional** para AMA Café que permita a los clientes explorar el menú completo, realizar pedidos con pago en línea, y recibir atención personalizada a través de un asistente inteligente — todo desde cualquier dispositivo con acceso a internet.

---

## 3. FUNCIONALIDADES INCLUIDAS EN EL PILOTO

### 3.1 Catálogo Digital de Productos

Los clientes podrán navegar el menú completo de AMA Café desde su celular, tablet o computador:

- **Exploración por categorías**: Caffè, Bebidas Heladas, Tés e Infusiones, Helados, Panadería, Preparaciones Frías, Bebidas y Café en Grano.
- **Búsqueda de productos**: Los clientes pueden buscar directamente por nombre de producto.
- **Detalle de cada producto**: Al seleccionar un producto, el cliente verá su descripción, precio, opciones disponibles (tamaños, extras como almendras, chocolate, caramelo, etc.) e imagen de referencia.
- **Menú siempre actualizado**: Los productos, precios y disponibilidad se mantienen sincronizados con el inventario.

### 3.2 Carrito de Compras

Los clientes podrán armar su pedido de forma intuitiva:

- **Agregar productos** al carrito con la cantidad deseada y las opciones seleccionadas.
- **Modificar cantidades** o **eliminar productos** antes de confirmar.
- **Ver el resumen** del pedido con el desglose de precios y el total a pagar.
- El carrito se mantiene activo durante toda la sesión de navegación del cliente.

### 3.3 Proceso de Compra (Checkout)

Un flujo de compra guiado en **4 pasos simples**:

1. **Revisión del pedido**: Confirmación de los productos seleccionados.
2. **Datos de contacto**: Nombre, teléfono y correo del cliente.
3. **Dirección de entrega**: Dirección donde el cliente desea recibir su pedido.
4. **Método de pago**: Selección del medio de pago y confirmación del pedido.

Al finalizar, el cliente recibe una **confirmación del pedido** con los detalles completos.

### 3.4 Medio de Pago — Integración con SumUp

La plataforma se integrará con **SumUp** como medio de pago en línea:

- Los clientes podrán pagar sus pedidos de forma segura directamente desde la plataforma.
- Se aceptarán los métodos de pago habilitados en la cuenta SumUp del negocio.
- Cada transacción quedará registrada tanto en la plataforma como en el panel de SumUp.

> **Nota importante**: El cliente (propietario de AMA Café) proporcionará los accesos y credenciales necesarios a la plataforma SumUp para habilitar esta integración.

### 3.5 Gestión de Inventario — Sincronización con SumUp

El control de inventario se realizará a través de la integración con **SumUp**:

- Los productos disponibles en la tienda digital se sincronizarán con el catálogo de SumUp.
- El stock y la disponibilidad de productos se gestionarán desde SumUp, reflejándose automáticamente en la plataforma web.
- Esto permite al propietario manejar un **punto único de control** para su inventario, tanto para ventas presenciales como digitales.

> **Nota importante**: El cliente (propietario de AMA Café) proporcionará los accesos y credenciales necesarios a la plataforma SumUp para habilitar esta funcionalidad.

### 3.6 Asistente Inteligente para Clientes (AI)

Un **chat inteligente** disponible en la tienda digital que asiste a los clientes en tiempo real:

- **Recomendaciones personalizadas**: El asistente conoce todo el menú y puede sugerir productos según los gustos o preferencias del cliente. Por ejemplo: *"¿Qué me recomiendas si me gusta el café con leche pero quiero probar algo diferente?"*
- **Información de productos**: El cliente puede preguntar sobre ingredientes, opciones, precios y disponibilidad.
- **Asistencia en el pedido**: El asistente puede orientar al cliente durante el proceso de compra.
- El asistente opera con **inteligencia artificial**, lo que significa que comprende preguntas en lenguaje natural y responde de forma conversacional.

### 3.7 Asistente Inteligente para el Negocio (AI — Panel de Administración)

Un **asistente inteligente exclusivo para el propietario**, disponible en el panel de administración:

- **Análisis de ventas**: Permite consultar en lenguaje natural sobre el desempeño del negocio. Por ejemplo: *"¿Cuáles fueron los productos más vendidos esta semana?"* o *"¿Cómo se comparan las ventas de café versus panadería?"*
- **Información de clientes**: El asistente puede identificar clientes frecuentes, clientes que han dejado de comprar, y patrones de consumo.
- **Reportes bajo demanda**: En lugar de navegar tablas y gráficos, el propietario simplemente pregunta lo que necesita saber y el asistente responde con la información procesada.
- **Panel de métricas visuales**: Adicionalmente, el panel de administración incluye gráficos y estadísticas de ventas, productos más vendidos, análisis por categoría y tendencias de ingresos.

---

## 4. FUNCIONALIDADES EXCLUIDAS DEL PILOTO (FASE 2)

Las siguientes funcionalidades **no están incluidas** en esta primera fase y serán evaluadas para una implementación futura:

| Funcionalidad | Motivo de Exclusión | Alternativa en el Piloto |
|---|---|---|
| Integración con servicio de delivery | Requiere acuerdos con plataformas de reparto externas | El propietario y/o sus colaboradores gestionarán las entregas directamente |
| Programa de fidelización / puntos | Funcionalidad avanzada para una fase posterior | Se podrá implementar una vez validado el piloto |
| Múltiples sucursales | El piloto cubre una única ubicación | Escalable en fases posteriores |
| App móvil nativa | La web es accesible desde cualquier celular | La plataforma web es responsive y se adapta a todos los dispositivos |

---

## 5. CONDICIONES TÉCNICAS Y OPERATIVAS

### 5.1 Despliegue y Hospedaje

La plataforma será desplegada en un **servicio de hosting o nube provisto por el cliente** (propietario de AMA Café).

- El equipo de desarrollo se encargará de configurar y desplegar la aplicación en la infraestructura que el cliente designe.
- El cliente será responsable de mantener activo el servicio de hosting y los costos asociados al mismo.
- Se proporcionará orientación sobre las opciones de hosting recomendadas si el cliente lo requiere.

### 5.2 Inteligencia Artificial — Sin Costos Adicionales

Los asistentes inteligentes (tanto el de clientes como el del negocio) utilizarán **modelos de lenguaje (LLM) provistos a través de OpenRouter, de costo cero**.

- Esto significa que **no se generarán cargos adicionales** por el uso de la inteligencia artificial durante el piloto.
- Los modelos seleccionados ofrecen capacidades de comprensión y respuesta en español adecuadas para las necesidades del negocio.
- En caso de requerir modelos de mayor capacidad en el futuro, esto se evaluará como parte de una fase posterior con su respectivo análisis de costos.

### 5.3 Integración con SumUp — Accesos del Cliente

Para habilitar las funcionalidades de **pago en línea** e **inventario de productos**, es necesario que el cliente proporcione:

- **Accesos a la plataforma SumUp**: Credenciales de API o acceso a la cuenta de desarrollador de SumUp del negocio.
- **Configuración del catálogo**: El catálogo de productos debe estar cargado y actualizado en SumUp.
- El equipo de desarrollo se encargará de realizar la integración técnica una vez que los accesos sean proporcionados.

---

## 6. RESPONSABILIDADES

### 6.1 Responsabilidades del Equipo de Desarrollo

| # | Responsabilidad |
|---|---|
| 1 | Desarrollo y entrega de todas las funcionalidades descritas en la sección 3 |
| 2 | Configuración y despliegue de la plataforma en el hosting provisto por el cliente |
| 3 | Integración técnica con SumUp (pagos e inventario) |
| 4 | Configuración de los asistentes inteligentes con modelos de AI de costo cero |
| 5 | Soporte técnico durante la fase de piloto para resolver incidencias |
| 6 | Capacitación básica al propietario sobre el uso del panel de administración |

### 6.2 Responsabilidades del Cliente (Propietario de AMA Café)

| # | Responsabilidad |
|---|---|
| 1 | Proveer el servicio de hosting o nube donde se desplegará la plataforma |
| 2 | Proveer los accesos y credenciales a la plataforma SumUp |
| 3 | Mantener actualizado el catálogo de productos y precios en SumUp |
| 4 | Gestionar directamente las entregas de pedidos durante la fase de piloto |
| 5 | Proporcionar retroalimentación sobre el funcionamiento de la plataforma |
| 6 | Asumir los costos de hosting y de la cuenta de SumUp |

---

## 7. RESUMEN EJECUTIVO

| Aspecto | Detalle |
|---|---|
| **Plataforma** | Tienda digital web para AMA Café |
| **Acceso** | Desde cualquier dispositivo con internet (celular, tablet, computador) |
| **Productos** | Catálogo completo: 8 categorías, 44+ productos |
| **Pagos** | En línea a través de SumUp (accesos provistos por el cliente) |
| **Inventario** | Sincronizado con SumUp (accesos provistos por el cliente) |
| **AI Clientes** | Asistente inteligente para recomendaciones y consultas |
| **AI Negocio** | Asistente inteligente para análisis de ventas y clientes |
| **Hosting** | Provisto por el cliente |
| **Costo de AI** | Sin costo adicional (modelos gratuitos vía OpenRouter) |
| **Delivery** | Gestionado directamente por el propietario (no incluido en el piloto) |

---

## 8. PRÓXIMOS PASOS

1. **Revisión y aprobación** de este documento por parte del propietario de AMA Café.
2. **Provisión de accesos**: El cliente proporciona los accesos a SumUp y define el servicio de hosting.
3. **Integración y despliegue**: El equipo de desarrollo configura las integraciones y despliega la plataforma.
4. **Capacitación**: Sesión de orientación para el uso del panel de administración.
5. **Inicio del piloto**: Lanzamiento de la plataforma y periodo de prueba con clientes reales.
6. **Evaluación**: Al finalizar el periodo de piloto, revisión conjunta de resultados para definir siguientes fases.

---

## 9. FIRMAS DE CONFORMIDAD

| Rol | Nombre | Firma | Fecha |
|---|---|---|---|
| Propietario AMA Café | _________________ | _________________ | ___/___/2026 |
| Equipo de Desarrollo | _________________ | _________________ | ___/___/2026 |

---

*Documento generado como parte del proyecto piloto digital de AMA Café.*  
*Versión 1.0 — Abril 2026*
