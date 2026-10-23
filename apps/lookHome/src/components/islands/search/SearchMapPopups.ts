import type { SearchResultItem } from "@/features/search/types";
import { getInternalHref } from "./SearchMapData";

function getPoiProperty(
  properties: Record<string, unknown>,
  key: string,
): string {
  const value = properties[key];
  return typeof value === "string" ? value.trim() : "";
}

function getPoiCategory(properties: Record<string, unknown>) {
  const poiClass = getPoiProperty(properties, "class").toLowerCase();
  const subclass = getPoiProperty(properties, "subclass").toLowerCase();

  if (subclass === "university") return "Universidad";
  if (subclass === "college") return "Instituto o universidad";
  if (subclass === "school") return "Colegio";
  if (subclass === "kindergarten") return "Educación inicial";
  if (subclass === "hotel") return "Hotel";
  if (subclass === "hostel") return "Hostal";
  if (subclass === "guest_house") return "Casa de huéspedes";
  if (subclass === "supermarket") return "Supermercado";
  if (subclass === "marketplace") return "Mercado";
  if (subclass === "convenience") return "Tienda de conveniencia";
  if (subclass === "mall") return "Centro comercial";
  if (subclass === "clinic") return "Clínica";
  if (subclass === "police") return "Comisaría";
  if (subclass === "fire_station") return "Estación de bomberos";
  if (subclass === "town_hall" || subclass === "townhall") {
    return "Municipalidad";
  }
  if (subclass === "community_centre") return "Centro comunitario";
  if (subclass === "library") return "Biblioteca";
  if (subclass === "museum") return "Museo";
  if (subclass === "cinema") return "Cine";
  if (subclass === "theatre") return "Teatro";
  if (subclass === "park") return "Parque";
  if (subclass === "playground") return "Área recreativa";

  const labels: Record<string, string> = {
    restaurant: "Restaurante",
    cafe: "Cafetería",
    fast_food: "Comida rápida",
    bar: "Bar",
    lodging: "Alojamiento",
    grocery: "Mercado o tienda",
    shop: "Comercio",
    pharmacy: "Farmacia",
    hospital: "Hospital o clínica",
    doctors: "Centro médico",
    dentist: "Dentista",
    school: "Centro educativo",
    kindergarten: "Educación inicial",
    college: "Instituto o universidad",
    university: "Universidad",
    library: "Biblioteca",
    police: "Comisaría",
    fire_station: "Estación de bomberos",
    town_hall: "Municipalidad",
    townhall: "Municipalidad",
    community_centre: "Centro comunitario",
    museum: "Museo",
    cinema: "Cine",
    theatre: "Teatro",
    park: "Parque",
    playground: "Área recreativa",
    stadium: "Estadio",
    bus: "Terminal o paradero",
    railway: "Estación ferroviaria",
    bank: "Banco",
    atm: "Cajero automático",
  };

  return labels[poiClass] ?? "Lugar cercano";
}

export function createSearchPopupContent(item: SearchResultItem) {
  const container = document.createElement("div");
  container.style.width = "260px";
  container.style.fontFamily = "Open Sans Variable, sans-serif";
  container.style.background = "#fffefc";

  const image = document.createElement("img");
  image.src = item.imageUrl || "/property-placeholder.svg";
  image.alt = item.imageUrl
    ? `Vista de ${item.title}`
    : "Imagen no disponible";
  image.style.width = "100%";
  image.style.height = "118px";
  image.style.objectFit = "cover";
  image.style.display = "block";
  image.addEventListener(
    "error",
    () => {
      image.src = "/property-placeholder.svg";
    },
    { once: true },
  );
  container.append(image);

  const content = document.createElement("div");
  content.style.padding = "12px 14px 14px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.color = "#393432";
  title.style.fontSize = "14px";
  title.style.lineHeight = "1.35";
  title.textContent = item.title;
  content.append(title);

  if (item.addressLabel) {
    const address = document.createElement("p");
    address.style.margin = "4px 0 0";
    address.style.color = "#6d6560";
    address.style.fontSize = "12px";
    address.style.lineHeight = "1.4";
    address.textContent = item.addressLabel;
    content.append(address);
  }

  if (item.legacyMultipleOffers) {
    const offerNote = document.createElement("p");
    offerNote.style.margin = "8px 0 0";
    offerNote.style.color = "#6d6560";
    offerNote.style.fontSize = "12px";
    offerNote.textContent =
      "Anuncio con ofertas heredadas; no hay un precio único para mostrar.";
    content.append(offerNote);
  }

  if (item.priceLabel) {
    const price = document.createElement("div");
    price.style.fontSize = "14px";
    price.style.fontWeight = "700";
    price.style.color = "#a84f32";
    price.style.marginTop = "8px";
    price.textContent = item.priceLabel;
    content.append(price);
  }

  const facts = [
    item.bedrooms != null ? `${item.bedrooms} dorm.` : "",
    item.bathrooms != null
      ? `${item.bathrooms} baño${item.bathrooms === 1 ? "" : "s"}`
      : "",
    item.areaLabel ?? "",
  ].filter(Boolean);
  if (facts.length > 0) {
    const factsLine = document.createElement("p");
    factsLine.style.margin = "5px 0 9px";
    factsLine.style.color = "#6d6560";
    factsLine.style.fontSize = "12px";
    factsLine.textContent = facts.join(" · ");
    content.append(factsLine);
  }

  const link = document.createElement("a");
  link.href = getInternalHref(item.href);
  link.style.display = "flex";
  link.style.alignItems = "center";
  link.style.justifyContent = "center";
  link.style.minHeight = "44px";
  link.style.borderRadius = "10px";
  link.style.background = "#a84f32";
  link.style.fontSize = "13px";
  link.style.fontWeight = "600";
  link.style.color = "#ffffff";
  link.style.textDecoration = "none";
  link.textContent = "Ver detalle";
  content.append(link);
  container.append(content);
  return container;
}

export function createPoiPopupContent(properties: Record<string, unknown>) {
  const container = document.createElement("div");
  container.style.width = "210px";
  container.style.padding = "14px 16px";
  container.style.fontFamily = "Open Sans Variable, sans-serif";
  container.style.background = "#fffefc";

  const category = document.createElement("p");
  category.style.margin = "0 0 5px";
  category.style.color = "#a84f32";
  category.style.fontSize = "12px";
  category.style.fontWeight = "600";
  category.textContent = getPoiCategory(properties);
  container.append(category);

  const title = document.createElement("div");
  title.style.color = "#393432";
  title.style.fontSize = "14px";
  title.style.fontWeight = "700";
  title.style.lineHeight = "1.35";
  title.textContent =
    getPoiProperty(properties, "name:es") ||
    getPoiProperty(properties, "name") ||
    getPoiProperty(properties, "name_en") ||
    "Lugar cercano";
  container.append(title);

  const description = document.createElement("p");
  description.style.margin = "6px 0 0";
  description.style.color = "#6d6560";
  description.style.fontSize = "12px";
  description.style.lineHeight = "1.4";
  description.textContent = "Referencia útil para conocer el entorno.";
  container.append(description);

  return container;
}
