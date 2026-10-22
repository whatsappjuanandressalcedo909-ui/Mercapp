export interface VtexStoreOffer {
  storeId: string;
  storeName: string;
  domain: string;
  productName: string;
  brand: string;
  ean: string;
  priceCop: number;
  listPriceCop: number;
  discountPct: number;
  unitMultiplier: number;
  measurementUnit: string;
  imageUrl: string;
  productUrl: string;
  available: boolean;
  matchType: 'exact_ean' | 'name_search';
}

export interface OpenPriceEntry {
  id: number;
  productCode: string;
  productName: string;
  price: number;
  currency: string;
  date: string;
  locationName: string;
  country: string;
}

export interface SupermarketComparisonResponse {
  query: {
    ean: string;
    q: string;
  };
  timestamp: string;
  offers: VtexStoreOffer[];
  summary: {
    storesResponded: number;
    lowestPriceCop: number;
    highestPriceCop: number;
    maxSavingsCop: number;
    cheapestStore: string | null;
  };
  openPrices: {
    exactMatches: OpenPriceEntry[];
    communityRecent: OpenPriceEntry[];
  };
}

export async function compareSupermarketPrices(params: {
  ean?: string;
  query?: string;
}): Promise<SupermarketComparisonResponse> {
  const searchParams = new URLSearchParams();
  if (params.ean) searchParams.set('ean', params.ean.trim());
  if (params.query) searchParams.set('q', params.query.trim());

  const res = await fetch(`/api/supermarkets/compare?${searchParams.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status} al consultar el comparador de supermercados.`);
  }

  return res.json();
}
