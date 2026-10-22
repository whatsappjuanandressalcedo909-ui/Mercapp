import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VtexChainConfig {
  id: string;
  name: string;
  domain: string;
  badgeColor: string;
}

const VTEX_CHAINS: VtexChainConfig[] = [
  { id: 'exito', name: 'Éxito', domain: 'www.exito.com', badgeColor: '#F59E0B' },
  { id: 'carulla', name: 'Carulla', domain: 'www.carulla.com', badgeColor: '#10B981' },
  { id: 'jumbo', name: 'Jumbo', domain: 'www.jumbocolombia.com', badgeColor: '#059669' },
  { id: 'olimpica', name: 'Olímpica', domain: 'www.olimpica.com', badgeColor: '#EF4444' },
  { id: 'mercaldas', name: 'Mercaldas', domain: 'www.mercaldas.com', badgeColor: '#2563EB' },
  { id: 'euro', name: 'Euro Supermercados', domain: 'www.eurosupermercados.com.co', badgeColor: '#DC2626' },
];

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

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractOfferFromVtexProduct(
  chain: VtexChainConfig,
  product: Record<string, any>,
  requestedEan: string,
  matchType: 'exact_ean' | 'name_search'
): VtexStoreOffer | null {
  if (!product || !Array.isArray(product.items) || product.items.length === 0) {
    return null;
  }

  // Prefer the SKU item that matches requestedEan if provided
  const skuItem =
    (requestedEan &&
      product.items.find((it: any) => String(it?.ean || '') === requestedEan)) ||
    product.items[0];

  const itemEan = String(skuItem?.ean || '');

  // If this was an exact_ean lookup, verify the returned SKU actually matches the requested EAN
  // (Prevents Éxito/Carulla default fallback item when an EAN is not found)
  if (matchType === 'exact_ean' && requestedEan && itemEan !== requestedEan) {
    return null;
  }

  const sellers = Array.isArray(skuItem?.sellers) ? skuItem.sellers : [];
  let bestOffer: any = null;
  for (const s of sellers) {
    const offer = s?.commertialOffer;
    if (offer && typeof offer.Price === 'number' && offer.Price > 0) {
      if (!bestOffer || offer.Price < bestOffer.Price) {
        bestOffer = offer;
      }
    }
  }

  if (!bestOffer || !bestOffer.Price || bestOffer.Price <= 0) {
    return null;
  }

  const priceCop = Math.round(bestOffer.Price);
  const listPriceCop = Math.round(bestOffer.ListPrice || bestOffer.Price);
  const discountPct =
    listPriceCop > priceCop
      ? Math.round(((listPriceCop - priceCop) / listPriceCop) * 100)
      : 0;

  const imageUrl =
    skuItem?.images?.[0]?.imageUrl ||
    '';

  const linkText = product.linkText ? String(product.linkText) : '';
  const productUrl = linkText
    ? `https://${chain.domain}/${linkText}/p`
    : `https://${chain.domain}`;

  return {
    storeId: chain.id,
    storeName: chain.name,
    domain: chain.domain,
    productName: String(product.productName || skuItem?.nameComplete || 'Producto'),
    brand: String(product.brand || 'Genérico'),
    ean: itemEan,
    priceCop,
    listPriceCop,
    discountPct,
    unitMultiplier: Number(skuItem?.unitMultiplier || 1),
    measurementUnit: String(skuItem?.measurementUnit || 'unid'),
    imageUrl,
    productUrl,
    available: (bestOffer.AvailableQuantity ?? 1) > 0,
    matchType,
  };
}

async function querySingleVtexChain(
  chain: VtexChainConfig,
  ean: string,
  searchQuery: string
): Promise<VtexStoreOffer | null> {
  // 1. Try EAN lookup first if EAN is provided
  if (ean) {
    try {
      const eanUrl = `https://${chain.domain}/api/catalog_system/pub/products/search?fq=alternateIds_Ean:${encodeURIComponent(
        ean
      )}`;
      const res = await fetchWithTimeout(eanUrl, 4200);
      if (res.ok || res.status === 206) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          for (const prod of data) {
            const offer = extractOfferFromVtexProduct(
              chain,
              prod,
              ean,
              'exact_ean'
            );
            if (offer) return offer;
          }
        }
      }
    } catch {
      // Proceed to text search fallback if EAN request fails
    }
  }

  // 2. Try product name search if searchQuery is provided
  if (searchQuery && searchQuery.trim().length >= 2) {
    try {
      const cleanTerm = searchQuery
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const textUrl = `https://${chain.domain}/api/catalog_system/pub/products/search/${encodeURIComponent(
        cleanTerm
      )}?_from=0&_to=4`;
      const res = await fetchWithTimeout(textUrl, 4500);
      if (res.ok || res.status === 206) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const offers: VtexStoreOffer[] = [];
          for (const prod of data) {
            const offer = extractOfferFromVtexProduct(
              chain,
              prod,
              ean,
              'name_search'
            );
            if (offer) offers.push(offer);
          }
          if (offers.length > 0) {
            // If any offer matches the EAN, prefer it; otherwise return the first relevant offer
            const exact = ean && offers.find((o) => o.ean === ean);
            if (exact) {
              return { ...exact, matchType: 'exact_ean' };
            }
            return offers[0];
          }
        }
      }
    } catch {
      // Ignore network timeout on single chain
    }
  }

  return null;
}

async function queryOpenPricesApi(ean: string): Promise<{
  exactMatches: OpenPriceEntry[];
  communityRecent: OpenPriceEntry[];
}> {
  const exactMatches: OpenPriceEntry[] = [];
  const communityRecent: OpenPriceEntry[] = [];

  try {
    if (ean) {
      const url = `https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(
        ean
      )}&size=8`;
      const res = await fetchWithTimeout(url, 4000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) {
          for (const item of data.items) {
            exactMatches.push({
              id: Number(item.id || Math.random()),
              productCode: String(item.product_code || ean),
              productName: String(
                item.product?.product_name || item.product_name || `EAN ${ean}`
              ),
              price: Number(item.price || 0),
              currency: String(item.currency || 'COP'),
              date: String(item.date || ''),
              locationName: String(
                item.location?.osm_name ||
                  item.location?.osm_address_city ||
                  'Tienda reportada en Open Prices'
              ),
              country: String(item.location?.osm_address_country || ''),
            });
          }
        }
      }
    }

    // If no exact matches for this Colombian barcode yet, also fetch latest community entries from Open Prices API
    if (exactMatches.length === 0) {
      const recentUrl = `https://prices.openfoodfacts.org/api/v1/prices?size=5`;
      const resRecent = await fetchWithTimeout(recentUrl, 3500);
      if (resRecent.ok) {
        const data = await resRecent.json();
        if (Array.isArray(data?.items)) {
          for (const item of data.items) {
            if (item.price) {
              communityRecent.push({
                id: Number(item.id || Math.random()),
                productCode: String(item.product_code || 'N/A'),
                productName: String(
                  item.product?.product_name ||
                    item.product_name ||
                    `Código ${item.product_code || 'Abierto'}`
                ),
                price: Number(item.price || 0),
                currency: String(item.currency || 'EUR'),
                date: String(item.date || ''),
                locationName: String(
                  item.location?.osm_name ||
                    item.location?.osm_address_city ||
                    'Comunidad Open Prices'
                ),
                country: String(item.location?.osm_address_country || ''),
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Open Prices API warning:', err);
  }

  return { exactMatches, communityRecent };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // API Endpoint: Compare product prices across Colombian VTEX Supermarkets + OpenFoodFacts Open Prices
  app.get('/api/supermarkets/compare', async (req, res) => {
    const ean = String(req.query.ean || '').replace(/[^0-9]/g, '');
    const q = String(req.query.q || '').trim();

    if (!ean && !q) {
      res.status(400).json({
        error: 'Debes proporcionar un código EAN (ean) o nombre de producto (q).',
      });
      return;
    }

    try {
      const [vtexResults, openPricesResult] = await Promise.all([
        Promise.all(
          VTEX_CHAINS.map((chain) => querySingleVtexChain(chain, ean, q))
        ),
        queryOpenPricesApi(ean),
      ]);

      const offers = vtexResults
        .filter((o): o is VtexStoreOffer => o !== null)
        .sort((a, b) => a.priceCop - b.priceCop);

      const lowestPriceCop = offers.length > 0 ? offers[0].priceCop : 0;
      const highestPriceCop =
        offers.length > 0 ? offers[offers.length - 1].priceCop : 0;
      const maxSavingsCop =
        offers.length > 1 ? highestPriceCop - lowestPriceCop : 0;

      res.json({
        query: { ean, q },
        timestamp: new Date().toISOString(),
        offers,
        summary: {
          storesResponded: offers.length,
          lowestPriceCop,
          highestPriceCop,
          maxSavingsCop,
          cheapestStore: offers.length > 0 ? offers[0].storeName : null,
        },
        openPrices: openPricesResult,
      });
    } catch (error) {
      console.error('Error in /api/supermarkets/compare:', error);
      res.status(500).json({
        error: 'Error al consultar las APIs de supermercados.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MercApp Casa Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
