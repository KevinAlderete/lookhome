import { useCallback, useEffect, useRef, useState } from "react";
import { getGeoCascade } from "../api/client";
import type { GeoCountryOption, GeoNamedOption } from "../types";

type GeoCascadeState = {
  countryCode: string;
  regionId: string;
  cityId: string;
  districtId: string;
  countries: GeoCountryOption[];
  regions: GeoNamedOption[];
  cities: GeoNamedOption[];
  districts: GeoNamedOption[];
  loadingInitial: boolean;
  loadingRegions: boolean;
  loadingCities: boolean;
  loadingDistricts: boolean;
  error: string | null;
};

const INITIAL_STATE: GeoCascadeState = {
  countryCode: "",
  regionId: "",
  cityId: "",
  districtId: "",
  countries: [],
  regions: [],
  cities: [],
  districts: [],
  loadingInitial: true,
  loadingRegions: false,
  loadingCities: false,
  loadingDistricts: false,
  error: null,
};

export function useGeoCascade(defaultCountryCode = "PE") {
  const [state, setState] = useState<GeoCascadeState>({
    ...INITIAL_STATE,
    countryCode: defaultCountryCode,
  });

  const currentRequestRef = useRef<AbortController | null>(null);

  const safeFetch = useCallback(
    async (
      params: {
        countryCode?: string;
        regionId?: string;
        cityId?: string;
      },
      mode: "initial" | "regions" | "cities" | "districts",
    ) => {
      currentRequestRef.current?.abort();

      const controller = new AbortController();
      currentRequestRef.current = controller;

      setState((prev) => ({
        ...prev,
        error: null,
        loadingInitial: mode === "initial",
        loadingRegions: mode === "regions",
        loadingCities: mode === "cities",
        loadingDistricts: mode === "districts",
      }));

      try {
        const data = await getGeoCascade(params, controller.signal);
        if (controller.signal.aborted) return;

        setState((prev) => ({
          ...prev,
          countries: data.countries ?? [],
          regions: data.regions ?? [],
          cities: data.cities ?? [],
          districts: data.districts ?? [],
          loadingInitial: false,
          loadingRegions: false,
          loadingCities: false,
          loadingDistricts: false,
        }));
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        setState((prev) => ({
          ...prev,
          loadingInitial: false,
          loadingRegions: false,
          loadingCities: false,
          loadingDistricts: false,
          error:
            error instanceof Error
              ? error.message
              : "No se pudo cargar la ubicación.",
        }));
      }
    },
    [],
  );

  useEffect(() => {
    safeFetch(
      defaultCountryCode ? { countryCode: defaultCountryCode } : {},
      "initial",
    );

    return () => {
      currentRequestRef.current?.abort();
    };
  }, [defaultCountryCode, safeFetch]);

  const setCountryCode = useCallback(
    async (countryCode: string) => {
      setState((prev) => ({
        ...prev,
        countryCode,
        regionId: "",
        cityId: "",
        districtId: "",
        regions: [],
        cities: [],
        districts: [],
      }));

      await safeFetch(countryCode ? { countryCode } : {}, "regions");
    },
    [safeFetch],
  );

  const setRegionId = useCallback(
    async (regionId: string) => {
      setState((prev) => ({
        ...prev,
        regionId,
        cityId: "",
        districtId: "",
        cities: [],
        districts: [],
      }));

      await safeFetch(
        {
          countryCode: state.countryCode || undefined,
          regionId: regionId || undefined,
        },
        "cities",
      );
    },
    [safeFetch, state.countryCode],
  );

  const setCityId = useCallback(
    async (cityId: string) => {
      setState((prev) => ({
        ...prev,
        cityId,
        districtId: "",
        districts: [],
      }));

      await safeFetch(
        {
          countryCode: state.countryCode || undefined,
          regionId: state.regionId || undefined,
          cityId: cityId || undefined,
        },
        "districts",
      );
    },
    [safeFetch, state.countryCode, state.regionId],
  );

  const setDistrictId = useCallback((districtId: string) => {
    setState((prev) => ({
      ...prev,
      districtId,
    }));
  }, []);

  const setSelection = useCallback(
    async (selection: {
      regionId: string;
      cityId: string;
      districtId: string;
    }) => {
      setState((prev) => ({
        ...prev,
        ...selection,
        cities: [],
        districts: [],
      }));

      await safeFetch(
        {
          countryCode: state.countryCode || defaultCountryCode || undefined,
          regionId: selection.regionId || undefined,
          cityId: selection.cityId || undefined,
        },
        selection.cityId
          ? "districts"
          : selection.regionId
            ? "cities"
            : "regions",
      );
    },
    [defaultCountryCode, safeFetch, state.countryCode],
  );

  return {
    ...state,
    setCountryCode,
    setRegionId,
    setCityId,
    setDistrictId,
    setSelection,
  };
}
