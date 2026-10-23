export type GeoCountryOption = {
  code: string;
  name: string;
};

export type GeoNamedOption = {
  id: string;
  name: string;
};

export type GeoCascadeSelected = {
  countryCode: string | null;
  regionId: string | null;
  cityId: string | null;
};

export type GeoCascadeResponse = {
  selected: GeoCascadeSelected;
  countries: GeoCountryOption[];
  regions: GeoNamedOption[];
  cities: GeoNamedOption[];
  districts: GeoNamedOption[];
};
