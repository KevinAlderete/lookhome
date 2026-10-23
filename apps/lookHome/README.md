# LOOKHOME Web

Frontend Astro SSR con islands React. Ejecuta los comandos desde la raíz del monorepo con pnpm.

`PUBLIC_API_URL` debe apuntar a la API incluyendo el prefijo `/api`, por ejemplo `http://localhost:3000/api`.

## Contratos BFF para publicar una unidad

El wizard de `/host/anuncios/nuevo` no presupone una transacción distribuida. Crea el anuncio, crea su unidad, sube cada foto y, recién con ambos identificadores, asocia la foto al anuncio y a la unidad. El backend debe implementar estos contratos detrás de las rutas BFF:

- `GET /api/catalog/amenities` -> `GET /catalog/amenities`: responde `{ items: Array<{ id, name, category? }> }` (también se admite un array directo).
- `POST /api/host/listings/create` -> `POST /listings`: recibe `{ title, description, address: { countryCode: "PE", regionId, cityId, districtId, line1, precision } }` y responde `{ listing: { id } }`.
- `POST /api/host/units/create` -> `POST /units`: recibe `listingId`, `unitType` (`entire_place|private_room|shared_bed`), detalles, `amenityIds`, reglas y `pricing`. `pricing` es `{ currencyCode, rentAmount, depositAmount, cleaningFee?, rentalMode }`; para `nightly` recibe `minStayNights` y `maxStayNights?`, y para `monthly`, `minTermMonths` y `maxTermMonths?`. Responde `{ unit: { id } }`.
- `POST /api/host/media/upload` -> `POST /media/upload`: recibe `multipart/form-data` con el campo `file` y responde `{ media: { id, publicUrl? } }`.
- `POST /api/host/media/attach-listing` -> `POST /media/attach/listing/:listingId/:mediaId?sortOrder&isCover` y `POST /api/host/media/attach-unit` -> `POST /media/attach/unit/:unitId/:mediaId?sortOrder&isCover`.
- `PATCH /api/host/units/:id/publish` -> `PATCH /units/:id/publish` y `PATCH /api/host/listings/:id/publish` -> `PATCH /listings/:id/publish`.
