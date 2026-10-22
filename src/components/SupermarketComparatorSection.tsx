import '../preamble';
import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Barcode,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  ShoppingCart,
  Store,
  TrendingDown,
} from 'lucide-react';
import { ProductCategory, VALID_CATEGORIES } from '../firebase';
import { COLOMBIAN_BARCODE_PRESETS } from '../services/openFoodFactsService';
import {
  ColombianMarket,
  findMatchingSipsaProduct,
  formatCop,
} from '../services/sipsaDaneService';
import {
  compareSupermarketPrices,
  SupermarketComparisonResponse,
  VtexStoreOffer,
} from '../services/supermarketPricingService';
import { InventoryItemDoc, ShoppingItemDoc } from '../App';

interface SupermarketComparatorSectionProps {
  selectedMarket: ColombianMarket;
  shoppingList: ShoppingItemDoc[];
  inventory: InventoryItemDoc[];
  isAuthenticated: boolean;
  onAddOfferToShoppingList: (offer: {
    name: string;
    brand: string;
    barcode: string;
    category: ProductCategory;
    priceCop: number;
    storeName: string;
    imageUrl: string;
  }) => Promise<void>;
}

interface BasketStoreTotal {
  storeName: string;
  matchedCount: number;
  totalItems: number;
  totalCop: number;
}

export const SupermarketComparatorSection: React.FC<
  SupermarketComparatorSectionProps
> = ({
  selectedMarket,
  shoppingList,
  inventory,
  isAuthenticated,
  onAddOfferToShoppingList,
}) => {
  const [eanInput, setEanInput] = useState('7702511000014');
  const [queryInput, setQueryInput] = useState('Arroz Diana 500g');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupermarketComparisonResponse | null>(
    null
  );

  // Basket-wide comparison state
  const [basketComparing, setBasketComparing] = useState(false);
  const [basketStoreTotals, setBasketStoreTotals] = useState<
    BasketStoreTotal[]
  >([]);
  const [optimalCombinedCop, setOptimalCombinedCop] = useState<number>(0);

  const runComparison = async (ean: string, queryText: string) => {
    if (!ean.trim() && !queryText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await compareSupermarketPrices({
        ean: ean.trim(),
        query: queryText.trim(),
      });
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo consultar el comparador de supermercados.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Run initial comparison on mount so the user sees live data immediately
  useEffect(() => {
    runComparison('7702511000014', 'Arroz Diana 500g');
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runComparison(eanInput, queryInput);
  };

  // Compare entire active shopping list across Colombian VTEX supermarkets
  const handleCompareEntireShoppingList = async () => {
    const activeItems = shoppingList.filter((i) => !i.checked);
    if (activeItems.length === 0) return;
    setBasketComparing(true);

    try {
      const itemsToQuery = activeItems.slice(0, 6);
      const responses = await Promise.all(
        itemsToQuery.map((item) =>
          compareSupermarketPrices({
            ean: item.barcode,
            query: item.name,
          }).catch(() => null)
        )
      );

      const storeAggregator: Record<
        string,
        { matchedCount: number; totalCop: number }
      > = {};
      let optimalSum = 0;

      responses.forEach((res, idx) => {
        const item = itemsToQuery[idx];
        const qty = item.quantityToBuy || 1;
        if (!res || res.offers.length === 0) {
          optimalSum += item.estimatedPriceCop * qty;
          return;
        }
        optimalSum += res.offers[0].priceCop * qty;

        res.offers.forEach((offer) => {
          if (!storeAggregator[offer.storeName]) {
            storeAggregator[offer.storeName] = { matchedCount: 0, totalCop: 0 };
          }
          storeAggregator[offer.storeName].matchedCount += 1;
          storeAggregator[offer.storeName].totalCop += offer.priceCop * qty;
        });
      });

      const totals: BasketStoreTotal[] = Object.entries(storeAggregator)
        .map(([storeName, stats]) => ({
          storeName,
          matchedCount: stats.matchedCount,
          totalItems: itemsToQuery.length,
          totalCop: stats.totalCop,
        }))
        .sort((a, b) => {
          if (b.matchedCount !== a.matchedCount) {
            return b.matchedCount - a.matchedCount;
          }
          return a.totalCop - b.totalCop;
        });

      setBasketStoreTotals(totals);
      setOptimalCombinedCop(optimalSum);
    } finally {
      setBasketComparing(false);
    }
  };

  const sipsaBenchmark = findMatchingSipsaProduct(
    queryInput || (result?.offers[0]?.productName ?? ''),
    selectedMarket
  );

  const inferCategory = (name: string): ProductCategory => {
    const lower = name.toLowerCase();
    if (/arroz|pasta|avena|frijol|lenteja|cereal/.test(lower))
      return 'Granos y cereales';
    if (/leche|queso|mantequilla|yogur|crema/.test(lower))
      return 'Lácteos y huevos';
    if (/jabon|detergente|papel|limpia/.test(lower)) return 'Aseo y hogar';
    return VALID_CATEGORIES[7]; // 'Procesados'
  };

  return (
    <section className="space-y-6">
      {/* Search & Barcode Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">
              Comparador de Supermercados (API VTEX Colombia + Open Prices)
            </h2>
            <p className="text-xs text-slate-500">
              Consulta simultáneamente en tiempo real los catálogos VTEX de{' '}
              <strong className="text-slate-700">
                Éxito, Carulla, Jumbo, Olímpica, Mercaldas y Euro
              </strong>{' '}
              junto con <strong className="text-slate-700">Open Prices (OpenFoodFacts)</strong>
            </p>
          </div>

          {shoppingList.filter((i) => !i.checked).length > 0 && (
            <button
              type="button"
              onClick={handleCompareEntireShoppingList}
              disabled={basketComparing}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {basketComparing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              <span>
                Cotizar mi Lista de Compras ({shoppingList.filter((i) => !i.checked).length})
              </span>
            </button>
          )}
        </div>

        <form
          onSubmit={handleFormSubmit}
          className="grid grid-cols-1 md:grid-cols-12 gap-3"
        >
          <div className="md:col-span-4 relative">
            <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={eanInput}
              onChange={(e) => setEanInput(e.target.value)}
              placeholder="Código EAN-13 (ej. 7702511000014)"
              className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Nombre del producto (ej. Café Sello Rojo, Leche Alquería)..."
              className="w-full min-h-[44px] pl-10 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={loading || (!eanInput.trim() && !queryInput.trim())}
              className="w-full min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Comparar Supermercados</span>
            </button>
          </div>
        </form>

        {/* Quick-Select Chips from Colombian Barcodes & User's Shopping List */}
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-slate-500">
            Comparación rápida por código EAN-13 o desde tus productos:
          </p>
          <div className="flex flex-wrap gap-2">
            {COLOMBIAN_BARCODE_PRESETS.map((preset) => (
              <button
                key={preset.barcode}
                type="button"
                onClick={() => {
                  setEanInput(preset.barcode);
                  setQueryInput(preset.label);
                  runComparison(preset.barcode, preset.label);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-xs text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="font-mono text-[11px] text-slate-500">
                  {preset.barcode}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-900">{preset.label}</span>
              </button>
            ))}

            {shoppingList.slice(0, 4).map((shopItem) => (
              <button
                key={shopItem.id}
                type="button"
                onClick={() => {
                  setEanInput(shopItem.barcode || '');
                  setQueryInput(shopItem.name);
                  runComparison(shopItem.barcode || '', shopItem.name);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-xs text-emerald-900 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Tu lista:</span>
                <span className="font-semibold">{shopItem.name}</span>
              </button>
            ))}

            {inventory.slice(0, 3).map((invItem) => (
              <button
                key={invItem.id}
                type="button"
                onClick={() => {
                  setEanInput(invItem.barcode || '');
                  setQueryInput(invItem.name);
                  runComparison(invItem.barcode || '', invItem.name);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Alacena:</span>
                <span className="font-semibold">{invItem.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Basket Optimizer Results (if triggered) */}
      {basketStoreTotals.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Resultado de Cotización de tu Lista de Compras en Cadena VTEX
              </h3>
              <p className="text-xs text-slate-500">
                Comparativa en tiempo real para tus productos pendientes de compra
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">
                Compra combinada eligiendo el más barato por ítem:
              </p>
              <p className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                {formatCop(optimalCombinedCop)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {basketStoreTotals.map((st, i) => (
              <div
                key={st.storeName}
                className={`rounded-xl p-4 border ${
                  i === 0
                    ? 'border-emerald-300 bg-emerald-50/40'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    {st.storeName}
                  </span>
                  {i === 0 && (
                    <span className="text-xs font-semibold text-emerald-700">
                      Más económico
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900">
                  {formatCop(st.totalCop)}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {st.matchedCount} de {st.totalItems} productos encontrados en catálogo
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-xs font-medium text-red-800">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center space-y-3">
          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-900">
            Consultando catálogos VTEX (Éxito, Carulla, Jumbo, Olímpica, Mercaldas, Euro) y Open Prices...
          </p>
          <p className="text-xs text-slate-500">
            Verificando código EAN y precios vigentes en pesos colombianos (COP)
          </p>
        </div>
      ) : (
        result && (
          <div className="space-y-6">
            {/* Summary Strip */}
            {result.offers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Mejor Precio Encontrado (VTEX)
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                    {formatCop(result.summary.lowestPriceCop)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Tienda: <strong>{result.summary.cheapestStore}</strong> ·{' '}
                    {result.summary.storesResponded} cadenas comparadas
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Diferencia / Ahorro Máximo por Unidad
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatCop(result.summary.maxSavingsCop)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                    Rango: {formatCop(result.summary.lowestPriceCop)} –{' '}
                    {formatCop(result.summary.highestPriceCop)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">
                    Referencia Mayorista SIPSA (DANE)
                  </p>
                  <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {sipsaBenchmark
                      ? `${formatCop(sipsaBenchmark.wholesalePricePerKgCop)}/kg`
                      : 'N/A (Industrial)'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 truncate">
                    {sipsaBenchmark
                      ? `${sipsaBenchmark.productName} · ${selectedMarket.split('—')[0]}`
                      : 'Producto procesado / marca comercial'}
                  </p>
                </div>
              </div>
            )}

            {/* 1. VTEX Supermarkets Comparison Table / List */}
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    1. Precios en Supermercados VTEX Colombia ({result.offers.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ordenados de menor a mayor precio en tiempo real desde{' '}
                    <code className="font-mono">/api/catalog_system/pub/products/search</code>
                  </p>
                </div>
                {result.query.ean && (
                  <span className="text-xs font-mono text-slate-600">
                    EAN consultado: {result.query.ean}
                  </span>
                )}
              </div>

              {result.offers.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Store className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900">
                    No se encontraron coincidencias en los catálogos VTEX para esta búsqueda
                  </p>
                  <p className="text-xs text-slate-500">
                    Intenta buscando por nombre genérico (ej. &quot;Arroz Diana&quot;, &quot;Leche Alquería&quot;, &quot;Café Sello Rojo&quot;).
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {result.offers.map((offer: VtexStoreOffer, idx: number) => {
                    const isCheapest = idx === 0;
                    const diffFromLowest =
                      offer.priceCop - result.summary.lowestPriceCop;

                    return (
                      <div
                        key={`${offer.storeId}_${offer.ean}_${idx}`}
                        className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                          isCheapest ? 'bg-emerald-50/30' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-4 min-w-0">
                          {/* Resilient Product Thumbnail with Fallback */}
                          <div className="w-14 h-14 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                            {offer.imageUrl ? (
                              <img
                                src={offer.imageUrl}
                                alt={offer.productName}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain p-1"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display =
                                    'none';
                                }}
                              />
                            ) : (
                              <Store className="w-6 h-6 text-slate-400" />
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-900">
                                {offer.storeName}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="text-sm font-semibold text-slate-800 truncate">
                                {offer.productName}
                              </span>
                              {isCheapest && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                  <TrendingDown className="w-3.5 h-3.5" />
                                  <span>Mejor Precio</span>
                                </span>
                              )}
                            </div>

                            {/* Unboxed Metadata */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span>Marca: {offer.brand}</span>
                              {offer.ean && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono">
                                    EAN {offer.ean}
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>
                                {offer.matchType === 'exact_ean'
                                  ? 'Coincidencia exacta por código de barras'
                                  : 'Búsqueda por nombre de catálogo'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <a
                                href={offer.productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
                              >
                                <span>Ver en {offer.storeName}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Price & Action */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div className="text-left sm:text-right">
                            <div className="flex items-baseline sm:justify-end gap-2">
                              <span
                                className={`text-lg font-bold font-mono tabular-nums ${
                                  isCheapest
                                    ? 'text-emerald-700'
                                    : 'text-slate-900'
                                }`}
                              >
                                {formatCop(offer.priceCop)}
                              </span>
                              {offer.discountPct > 0 && (
                                <span className="text-xs line-through text-slate-400 font-mono tabular-nums">
                                  {formatCop(offer.listPriceCop)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {isCheapest
                                ? 'Opción más baja hoy'
                                : `+${formatCop(diffFromLowest)} vs. más económico`}
                            </p>
                          </div>

                          {isAuthenticated ? (
                            <button
                              type="button"
                              onClick={() =>
                                onAddOfferToShoppingList({
                                  name: offer.productName,
                                  brand: `${offer.brand} (${offer.storeName})`,
                                  barcode: offer.ean || eanInput,
                                  category: inferCategory(offer.productName),
                                  priceCop: offer.priceCop,
                                  storeName: offer.storeName,
                                  imageUrl: offer.imageUrl,
                                })
                              }
                              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Elegir para Compras</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Inicia sesión para guardar
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Open Prices API (de OpenFoodFacts) Section */}
            <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-base font-bold text-slate-900">
                      2. Base Colaborativa Open Prices API (OpenFoodFacts)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Endpoint oficial:{' '}
                    <code className="font-mono">
                      https://prices.openfoodfacts.org/api/v1/prices
                    </code>
                  </p>
                </div>

                <a
                  href={
                    result.query.ean
                      ? `https://prices.openfoodfacts.org/products/${result.query.ean}`
                      : 'https://prices.openfoodfacts.org'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <span>Ver / Reportar en Open Prices</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>

              {result.openPrices.exactMatches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-800">
                    Precios reportados por la comunidad para el código EAN{' '}
                    {result.query.ean}:
                  </p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
                    {result.openPrices.exactMatches.map((entry) => (
                      <div
                        key={entry.id}
                        className="py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-900">
                            {entry.productName}
                          </p>
                          <p className="text-slate-500">
                            {entry.locationName}{' '}
                            {entry.country ? `· ${entry.country}` : ''} · Fecha:{' '}
                            {entry.date}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-sm text-slate-900">
                          {entry.price} {entry.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    El código EAN{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {result.query.ean || 'consultado'}
                    </span>{' '}
                    aún no tiene tiquetes de compra subidos en Colombia dentro de{' '}
                    <strong>Open Prices</strong>. A continuación se muestran los últimos reportes globales en vivo desde{' '}
                    <code className="font-mono">prices.openfoodfacts.org/api/v1/prices</code>:
                  </p>

                  {result.openPrices.communityRecent.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {result.openPrices.communityRecent.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">
                              EAN {item.productCode}
                            </p>
                            <p className="text-slate-500 truncate">
                              {item.locationName} · {item.date}
                            </p>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                            {item.price} {item.currency}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
};
