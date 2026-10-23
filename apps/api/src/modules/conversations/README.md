# Contrato de conversaciones

- Una conversación pertenece a un anuncio y puede guardar una unidad concreta.
  Su identidad funcional es `(listingId, roomId nullable, persona interesada,
anfitrión)`. Consultas por unidades distintas no se mezclan.
- El cliente solo aporta `listingId` o `roomId`. NestJS deriva el anfitrión desde
  la publicación, exige anuncio y unidad publicados, comprueba que la unidad
  pertenezca al anuncio y rechaza el contacto del propio anfitrión.
- La creación se serializa con un advisory lock transaccional de PostgreSQL sobre
  esa identidad. El esquema actual no tiene una clave única para un par de
  participantes por contexto; este contrato evita duplicados concurrentes sin
  agregar una migración. Todas las escrituras públicas pasan por este servicio.
- No existe una FK directa `Conversation.bookingId`: el contacto precede a una
  solicitud de alquiler. Si hay solicitudes del mismo par en la misma unidad
  (o anuncio para una conversación general), la bandeja vincula la más reciente
  como acceso contextual sin cambiar el estado de reserva.
- `ConversationParticipant.lastReadAt` conserva la lectura por persona. La
  bandeja pagina primero por actividad reciente y calcula los no leídos para esa
  página con un agregado que excluye los mensajes propios y los eliminados.
- Los envíos de texto nuevos llevan `clientMessageId` en `Message.metadata` y
  usan un lock transaccional por participante/conversación/ID para que un
  reintento devuelva el mensaje original. `editedAt` y `deletedAt` permiten
  sincronizar cambios de mensajes anteriores sin agregar `updatedAt` a la tabla.
- El proyecto no tiene Gateway/WebSocket ni soporte de eventos. La interfaz
  consulta el último cursor solo mientras la conversación está abierta y la
  pestaña visible, cada 20 segundos. PostgreSQL sigue siendo la fuente del
  historial; no se emiten mensajes por canales compartidos.
