import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Barcode,
  Camera,
  CameraOff,
  Check,
  Loader2,
  PackagePlus,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  ProductCategory,
  ProductUnit,
  StorageLocation,
  VALID_CATEGORIES,
  VALID_LOCATIONS,
  VALID_UNITS,
} from '../firebase';
import {
  COLOMBIAN_BARCODE_PRESETS,
  lookupBarcodeOpenFoodFacts,
  OpenFoodFactsProduct,
  searchProductsOpenFoodFacts,
} from '../services/openFoodFactsService';
import {
  ColombianMarket,
  findMatchingSipsaProduct,
  formatCop,
} from '../services/sipsaDaneService';

export interface ScannedProductSubmission {
  target: 'inventory' | 'shopping' | 'both';
  name: string;
  brand: string;
  barcode: string;
  category: ProductCategory;
  quantity: number;
  minQuantity: number;
  quantityToBuy: number;
  unit: ProductUnit;
  estimatedPriceCop: number;
  sipsaRefName: string;
  sipsaPriceCop: number;
  imageUrl: string;
  nutriscore: string;
  location: StorageLocation;
}

interface BarcodeScannerModalProps {
  isOpen: boolean;
  initialTarget?: 'inventory' | 'shopping';
  selectedMarket: ColombianMarket;
  onClose: () => void;
  onSubmitProduct: (submission: ScannedProductSubmission) => Promise<void>;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  initialTarget = 'inventory',
  selectedMarket,
  onClose,
  onSubmitProduct,
}) => {
  const [mode, setMode] = useState<'camera' | 'manual' | 'search'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpenFoodFactsProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  // Editable form state after scanning or selecting a product
  const [target, setTarget] = useState<'inventory' | 'shopping' | 'both'>(initialTarget);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Granos y cereales');
  const [quantity, setQuantity] = useState<number>(2);
  const [minQuantity, setMinQuantity] = useState<number>(1);
  const [quantityToBuy, setQuantityToBuy] = useState<number>(2);
  const [unit, setUnit] = useState<ProductUnit>('unid');
  const [estimatedPriceCop, setEstimatedPriceCop] = useState<number>(5000);
  const [sipsaRefName, setSipsaRefName] = useState('');
  const [sipsaPriceCop, setSipsaPriceCop] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState('');
  const [nutriscore, setNutriscore] = useState('');
  const [location, setLocation] = useState<StorageLocation>('Alacena');
  const [isSaving, setIsSaving] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerElementId = 'openfoodfacts-barcode-reader';

  useEffect(() => {
    setTarget(initialTarget);
  }, [initialTarget, isOpen]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Stop scanner cleanup:', err);
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen || mode !== 'camera') {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen, mode]);

  const applyFoundProduct = (product: OpenFoodFactsProduct, fallbackPrice?: number) => {
    setName(product.name);
    setBrand(product.brand || 'Genérico');
    setBarcode(product.barcode);
    setCategory(product.category);
    setUnit(product.suggestedUnit);
    setQuantity(product.suggestedQuantity || 1);
    setMinQuantity(1);
    setQuantityToBuy(product.suggestedQuantity || 1);
    setImageUrl(product.imageUrl || '');
    setNutriscore(product.nutriscore || '');

    if (product.category === 'Lácteos y huevos' || product.category === 'Verduras y hortalizas') {
      setLocation('Nevera');
    } else if (product.category === 'Carnes' || product.category === 'Pescados') {
      setLocation('Congelador');
    } else if (product.category === 'Aseo y hogar') {
      setLocation('Aseo');
    } else {
      setLocation('Alacena');
    }

    const sipsaMatch = findMatchingSipsaProduct(product.name, selectedMarket);
    if (sipsaMatch) {
      setSipsaRefName(sipsaMatch.productName);
      setSipsaPriceCop(sipsaMatch.wholesalePricePerKgCop);
      setEstimatedPriceCop(fallbackPrice || sipsaMatch.estimatedRetailPricePerKgCop);
    } else {
      setSipsaRefName('');
      setSipsaPriceCop(0);
      if (fallbackPrice) {
        setEstimatedPriceCop(fallbackPrice);
      }
    }
  };

  const handleBarcodeLookup = async (codeToLookup: string, presetPrice?: number) => {
    const clean = codeToLookup.replace(/[^0-9]/g, '');
    if (!clean) return;
    setIsLoading(true);
    setLookupMessage(null);
    await stopScanner();

    const product = await lookupBarcodeOpenFoodFacts(clean);
    setIsLoading(false);

    if (product) {
      applyFoundProduct(product, presetPrice);
      setLookupMessage(`Producto encontrado en OpenFoodFacts (EAN: ${clean})`);
    } else {
      setBarcode(clean);
      setName(`Producto EAN ${clean}`);
      setLookupMessage(
        `Código ${clean} leído. No figura en OpenFoodFacts; completa el nombre manualmente.`
      );
    }
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    try {
      await stopScanner();
      const html5QrCode = new Html5Qrcode(readerElementId);
      scannerRef.current = html5QrCode;
      setCameraActive(true);
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 140 },
        },
        (decodedText) => {
          handleBarcodeLookup(decodedText);
        },
        () => {
          // Ignore frame scan misses
        }
      );
    } catch (err) {
      console.warn('Camera access error:', err);
      setCameraActive(false);
      setCameraError(
        'No se pudo acceder a la cámara en este navegador o permiso denegado. Usa la entrada manual o los códigos de prueba abajo.'
      );
    }
  };

  const handleSearchOpenFoodFacts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setLookupMessage(null);
    const results = await searchProductsOpenFoodFacts(searchQuery);
    setSearchResults(results);
    setIsLoading(false);
    if (results.length === 0) {
      setLookupMessage('Sin resultados en OpenFoodFacts. Puedes ingresar los datos abajo.');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onSubmitProduct({
        target,
        name: name.trim(),
        brand: brand.trim() || 'Genérico',
        barcode: barcode.trim(),
        category,
        quantity: Number(quantity) || 0,
        minQuantity: Number(minQuantity) || 1,
        quantityToBuy: Number(quantityToBuy) || 1,
        unit,
        estimatedPriceCop: Number(estimatedPriceCop) || 0,
        sipsaRefName,
        sipsaPriceCop,
        imageUrl,
        nutriscore,
        location,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Top Drawer Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Escáner OpenFoodFacts y Registro de Producto
            </h2>
            <p className="text-xs text-slate-500">
              Escanea un código de barras EAN-13 o busca en la base abierta de OpenFoodFacts
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            aria-label="Cerrar escáner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex-1 min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                mode === 'camera'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Cámara EAN</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Barcode className="w-4 h-4 shrink-0" />
              <span>Código Manual</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`flex-1 min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                mode === 'search'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />
              <span>Buscar Nombre</span>
            </button>
          </div>

          {/* Mode 1: Camera Scanner */}
          {mode === 'camera' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white">
              <div
                id={readerElementId}
                className="w-full min-h-[200px] rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center"
              >
                {!cameraActive && (
                  <div className="text-center p-6 space-y-3">
                    <Camera className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-xs text-slate-300 max-w-xs mx-auto">
                      Apunta la cámara al código de barras del empaque para consultar OpenFoodFacts automáticamente.
                    </p>
                    <button
                      type="button"
                      onClick={startCameraScanner}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Activar Cámara para Escanear</span>
                    </button>
                  </div>
                )}
              </div>
              {cameraActive && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    Escaneando código de barras EAN-13 / UPC...
                  </span>
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Detener</span>
                  </button>
                </div>
              )}
              {cameraError && (
                <p className="mt-3 text-xs text-amber-300 bg-amber-950/50 border border-amber-800/50 rounded-lg p-3">
                  {cameraError}
                </p>
              )}
            </div>
          )}

          {/* Mode 2: Manual Barcode Input */}
          {mode === 'manual' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ej. 7702004003508 (Código EAN-13)"
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => handleBarcodeLookup(manualCode)}
                  disabled={isLoading || !manualCode.trim()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Consultar EAN</span>
                </button>
              </div>
            </div>
          )}

          {/* Mode 3: Search by Name on OpenFoodFacts */}
          {mode === 'search' && (
            <div className="space-y-3">
              <form onSubmit={handleSearchOpenFoodFacts} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar en OpenFoodFacts Colombia (ej. Avena, Café, Leche, Atún)..."
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="submit"
                  disabled={isLoading || !searchQuery.trim()}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Buscar</span>
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {searchResults.map((item, idx) => (
                    <button
                      key={`${item.barcode}_${idx}`}
                      type="button"
                      onClick={() => applyFoundProduct(item)}
                      className="w-full text-left px-4 py-2.5 hover:bg-emerald-50/60 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.brand} · {item.category} {item.barcode ? `· EAN ${item.barcode}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 shrink-0">
                        Seleccionar
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick-Test Colombian Barcodes Bar */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">
              Prueba rápida con códigos EAN-13 reales de productos en Colombia (OpenFoodFacts):
            </p>
            <div className="flex flex-wrap gap-2">
              {COLOMBIAN_BARCODE_PRESETS.map((preset) => (
                <button
                  key={preset.barcode}
                  type="button"
                  onClick={() => handleBarcodeLookup(preset.barcode, preset.estimatedPriceCop)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-xs text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="font-mono text-[11px] text-slate-500">{preset.barcode}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-900">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {lookupMessage && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-medium text-emerald-900 flex items-center justify-between gap-3">
              <span>{lookupMessage}</span>
              {nutriscore && (
                <span className="font-mono font-semibold text-emerald-800">
                  Nutri-Score: {nutriscore}
                </span>
              )}
            </div>
          )}

          {/* Product Details & Destination Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700">
                ¿Dónde deseas añadir este producto?
              </label>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTarget('inventory')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    target === 'inventory'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>Inventario Casa</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('shopping')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    target === 'shopping'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Lista de Compras</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('both')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    target === 'both'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Ambos</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del Producto *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    const match = findMatchingSipsaProduct(val, selectedMarket);
                    if (match) {
                      setSipsaRefName(match.productName);
                      setSipsaPriceCop(match.wholesalePricePerKgCop);
                    }
                  }}
                  placeholder="Ej. Arroz Blanco Diana 1kg"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Marca / Fabricante
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ej. Diana, Alquería, Plaza Local"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Grupo / Categoría (SIPSA DANE)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {VALID_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ubicación en Casa
                </label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as StorageLocation)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {VALID_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              {(target === 'inventory' || target === 'both') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cantidad Actual en Casa
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Alerta de Stock Mínimo (Notificar al llegar a)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </>
              )}

              {(target === 'shopping' || target === 'both') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cantidad a Comprar
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.5"
                    value={quantityToBuy}
                    onChange={(e) => setQuantityToBuy(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unidad de Medida
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as ProductUnit)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {VALID_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Precio Estimado Unitario (COP $)
                </label>
                <input
                  type="number"
                  min={0}
                  step="100"
                  value={estimatedPriceCop}
                  onChange={(e) => setEstimatedPriceCop(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                {sipsaRefName && sipsaPriceCop > 0 && (
                  <p className="mt-1 text-[11px] text-emerald-700 font-mono">
                    Ref. SIPSA ({sipsaRefName}): {formatCop(sipsaPriceCop)}/kg mayorista
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Guardar Producto</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
