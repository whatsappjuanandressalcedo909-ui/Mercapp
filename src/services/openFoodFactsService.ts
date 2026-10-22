import { ProductCategory, ProductUnit } from '../firebase';

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand: string;
  category: ProductCategory;
  quantityText: string;
  suggestedUnit: ProductUnit;
  suggestedQuantity: number;
  imageUrl: string;
  nutriscore: string;
  ingredientsText?: string;
}

export interface SampleBarcodePreset {
  barcode: string;
  label: string;
  brand: string;
  category: ProductCategory;
  estimatedPriceCop: number;
}

// Authentic Colombian barcodes available on OpenFoodFacts for 1-tap testing or physical scanning
export const COLOMBIAN_BARCODE_PRESETS: SampleBarcodePreset[] = [
  {
    barcode: '7702004003508',
    label: 'Chocolate Corona Tradicional 500g',
    brand: 'Corona',
    category: 'Procesados',
    estimatedPriceCop: 14900,
  },
  {
    barcode: '7702001053902',
    label: 'Leche Entera Alquería 1.1L',
    brand: 'Alquería',
    category: 'Lácteos y huevos',
    estimatedPriceCop: 5800,
  },
  {
    barcode: '7702129001106',
    label: 'Café Sello Rojo Tradicional 500g',
    brand: 'Sello Rojo',
    category: 'Procesados',
    estimatedPriceCop: 18500,
  },
  {
    barcode: '7702025101119',
    label: 'Arroz Diana Blanco 1kg',
    brand: 'Diana',
    category: 'Granos y cereales',
    estimatedPriceCop: 4600,
  },
  {
    barcode: '7702004000118',
    label: 'Galletas Ducales Taco 294g',
    brand: 'Noel',
    category: 'Procesados',
    estimatedPriceCop: 8200,
  },
  {
    barcode: '7702011011019',
    label: 'Spaghetti Doria 500g',
    brand: 'Doria',
    category: 'Granos y cereales',
    estimatedPriceCop: 4200,
  },
];

function inferCategoryFromTags(tags: string[] = [], name = ''): ProductCategory {
  const joined = [...tags, name].join(' ').toLowerCase();
  if (/leche|queso|yogur|kumis|mantequilla|dairy|milk|cheese|huevo/.test(joined)) {
    return 'Lácteos y huevos';
  }
  if (/arroz|avena|frijol|lenteja|garbanzo|cereal|pasta|harina|pan|grain|rice|bread/.test(joined)) {
    return 'Granos y cereales';
  }
  if (/fruta|jugo de fruta|manzana|banano|mora|lulo|limon|naranja|fruit/.test(joined)) {
    return 'Frutas';
  }
  if (/verdura|hortaliza|tomate|cebolla|zanahoria|lechuga|vegetable/.test(joined)) {
    return 'Verduras y hortalizas';
  }
  if (/papa|yuca|platano|tuberculo|arracacha/.test(joined)) {
    return 'Tubérculos, raíces y plátanos';
  }
  if (/carne|pollo|res|cerdo|jamon|salchicha|meat|poultry/.test(joined)) {
    return 'Carnes';
  }
  if (/atun|pescado|sardina|camaron|fish|seafood|tuna/.test(joined)) {
    return 'Pescados';
  }
  if (/jabon|detergente|limpiador|cloro|papel|aseo|shampoo/.test(joined)) {
    return 'Aseo y hogar';
  }
  if (/agua|gaseosa|refresco|cerveza|bebida|beverage/.test(joined)) {
    return 'Bebidas y otros';
  }
  return 'Procesados';
}

function parseUnitFromQuantity(qStr = ''): { unit: ProductUnit; amount: number } {
  const clean = qStr.trim().toLowerCase();
  const match = clean.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|lb|unid|paq)/i);
  if (!match) {
    return { unit: 'unid', amount: 1 };
  }
  const rawUnit = match[2].toLowerCase();
  if (rawUnit === 'kg') return { unit: 'kg', amount: 1 };
  if (rawUnit === 'l') return { unit: 'L', amount: 1 };
  if (rawUnit === 'lb') return { unit: 'lb', amount: 1 };
  return { unit: 'unid', amount: 1 };
}

export async function lookupBarcodeOpenFoodFacts(
  barcode: string
): Promise<OpenFoodFactsProduct | null> {
  const cleanCode = barcode.replace(/[^0-9]/g, '');
  if (!cleanCode) return null;

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleanCode)}.json`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 1 && data.product) {
        const p = data.product;
        const name =
          p.product_name_es ||
          p.product_name ||
          p.generic_name_es ||
          p.generic_name ||
          `Producto ${cleanCode}`;
        const brand = p.brands ? String(p.brands).split(',')[0].trim() : 'Genérico';
        const quantityText = p.quantity ? String(p.quantity) : '';
        const category = inferCategoryFromTags(p.categories_tags || [], `${name} ${brand}`);
        const { unit, amount } = parseUnitFromQuantity(quantityText);
        const nutriscore = p.nutriscore_grade
          ? String(p.nutriscore_grade).toUpperCase().slice(0, 1)
          : '';
        const imageUrl = p.image_front_small_url || p.image_url || '';

        return {
          barcode: cleanCode,
          name: `${name}${quantityText && !name.toLowerCase().includes(quantityText.toLowerCase()) ? ` (${quantityText})` : ''}`.slice(0, 120),
          brand: brand.slice(0, 100),
          category,
          quantityText,
          suggestedUnit: unit,
          suggestedQuantity: amount,
          imageUrl: imageUrl.slice(0, 500),
          nutriscore,
          ingredientsText: p.ingredients_text_es || p.ingredients_text || '',
        };
      }
    }
  } catch (err) {
    console.warn('OpenFoodFacts network lookup warning:', err);
  }

  // Fallback to known Colombian preset if offline or unindexed in OpenFoodFacts
  const preset = COLOMBIAN_BARCODE_PRESETS.find((item) => item.barcode === cleanCode);
  if (preset) {
    return {
      barcode: preset.barcode,
      name: preset.label,
      brand: preset.brand,
      category: preset.category,
      quantityText: '',
      suggestedUnit: 'unid',
      suggestedQuantity: 1,
      imageUrl: '',
      nutriscore: 'B',
    };
  }

  return null;
}

export async function searchProductsOpenFoodFacts(
  queryText: string
): Promise<OpenFoodFactsProduct[]> {
  const cleanQuery = queryText.trim();
  if (cleanQuery.length < 2) return [];

  try {
    const url = `https://co.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      cleanQuery
    )}&search_simple=1&action=process&json=1&page_size=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.products)) return [];

    return data.products
      .filter((p: Record<string, unknown>) => p && (p.product_name_es || p.product_name))
      .map((p: Record<string, unknown>) => {
        const name = String(p.product_name_es || p.product_name || 'Producto');
        const brand = p.brands ? String(p.brands).split(',')[0].trim() : 'Genérico';
        const barcode = String(p.code || '');
        const quantityText = p.quantity ? String(p.quantity) : '';
        const tags = Array.isArray(p.categories_tags) ? (p.categories_tags as string[]) : [];
        const category = inferCategoryFromTags(tags, `${name} ${brand}`);
        const { unit, amount } = parseUnitFromQuantity(quantityText);
        const nutriscore = p.nutriscore_grade
          ? String(p.nutriscore_grade).toUpperCase().slice(0, 1)
          : '';
        const imageUrl = String(p.image_front_small_url || p.image_url || '');

        return {
          barcode: barcode.slice(0, 64),
          name: `${name}${quantityText ? ` (${quantityText})` : ''}`.slice(0, 120),
          brand: brand.slice(0, 100),
          category,
          quantityText,
          suggestedUnit: unit,
          suggestedQuantity: amount,
          imageUrl: imageUrl.slice(0, 500),
          nutriscore,
        };
      });
  } catch (err) {
    console.warn('Error searching OpenFoodFacts:', err);
    return [];
  }
}
