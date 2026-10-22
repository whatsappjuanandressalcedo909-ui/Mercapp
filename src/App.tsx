/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Bell,
  BellRing,
  BookmarkPlus,
  Check,
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  ProductCategory,
  ProductUnit,
  sanitizeNumber,
  sanitizeString,
  StorageLocation,
  VALID_CATEGORIES,
  VALID_LOCATIONS,
} from './firebase';
import {
  BarcodeScannerModal,
  ScannedProductSubmission,
} from './components/BarcodeScannerModal';
import {
  OfflineIndicator,
  PWAInstallButton,
} from './components/PWAInstallButton';
import {
  COLOMBIAN_MARKETS,
  ColombianMarket,
  fetchSipsaOfficialMetadata,
  findMatchingSipsaProduct,
  formatCop,
  getSipsaPricesForMarket,
  SipsaDatasetMetadata,
  SipsaWholesaleEntry,
} from './services/sipsaDaneService';

export interface InventoryItemDoc {
  id: string;
  uid: string;
  name: string;
  brand: string;
  barcode: string;
  category: ProductCategory;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  estimatedPriceCop: number;
  sipsaRefName: string;
  imageUrl: string;
  nutriscore: string;
  location: StorageLocation;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ShoppingItemDoc {
  id: string;
  uid: string;
  name: string;
  brand: string;
  barcode: string;
  category: ProductCategory;
  quantityToBuy: number;
  unit: ProductUnit;
  estimatedPriceCop: number;
  sipsaPriceCop: number;
  checked: boolean;
  inventoryItemId: string;
  imageUrl: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PriceWatchDoc {
  id: string;
  uid: string;
  sipsaProduct: string;
  marketCity: string;
  targetPriceCop: number;
  lastRecordedPriceCop: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

type ActiveTab = 'inventory' | 'shopping' | 'sipsa' | 'alerts';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');

  // Firestore synced state
  const [inventory, setInventory] = useState<InventoryItemDoc[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItemDoc[]>([]);
  const [priceWatches, setPriceWatches] = useState<PriceWatchDoc[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Market & SIPSA state
  const [selectedMarket, setSelectedMarket] = useState<ColombianMarket>(
    'Bogotá, D.C. — Corabastos'
  );
  const [sipsaMetadata, setSipsaMetadata] = useState<SipsaDatasetMetadata | null>(
    null
  );
  const [sipsaGroupFilter, setSipsaGroupFilter] = useState<string>('Todos');
  const [sipsaSearch, setSipsaSearch] = useState('');

  // Inventory filters
  const [locationFilter, setLocationFilter] = useState<string>('Todas');
  const [inventorySearch, setInventorySearch] = useState('');

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'inventory' | 'shopping'>(
    'inventory'
  );

  // Notifications & Feedback banner
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const notifiedLowStockIds = useRef<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setInventory([]);
        setShoppingList([]);
        setPriceWatches([]);
        setDataLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // 2. Fetch SIPSA Official Metadata from datos.gov.co
  useEffect(() => {
    fetchSipsaOfficialMetadata().then(setSipsaMetadata);
  }, []);

  // 3. Firestore Real-Time Listeners
  useEffect(() => {
    if (!authReady || !user) return;
    setDataLoading(true);

    const invQuery = query(
      collection(db, 'inventory'),
      where('uid', '==', user.uid)
    );
    const shopQuery = query(
      collection(db, 'shopping_list'),
      where('uid', '==', user.uid)
    );
    const watchQuery = query(
      collection(db, 'price_watches'),
      where('uid', '==', user.uid)
    );

    const unsubInv = onSnapshot(
      invQuery,
      (snap) => {
        const docs: InventoryItemDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InventoryItemDoc, 'id'>),
        }));
        docs.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setInventory(docs);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory')
    );

    const unsubShop = onSnapshot(
      shopQuery,
      (snap) => {
        const docs: ShoppingItemDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ShoppingItemDoc, 'id'>),
        }));
        docs.sort((a, b) => Number(a.checked) - Number(b.checked));
        setShoppingList(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'shopping_list')
    );

    const unsubWatch = onSnapshot(
      watchQuery,
      (snap) => {
        const docs: PriceWatchDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PriceWatchDoc, 'id'>),
        }));
        setPriceWatches(docs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'price_watches')
    );

    return () => {
      unsubInv();
      unsubShop();
      unsubWatch();
    };
  }, [authReady, user]);

  // 4. Low-stock items & automatic browser notification trigger
  const lowStockItems = useMemo(
    () => inventory.filter((item) => item.quantity <= item.minQuantity),
    [inventory]
  );

  useEffect(() => {
    if (notificationPermission !== 'granted') return;
    lowStockItems.forEach((item) => {
      if (!notifiedLowStockIds.current.has(item.id)) {
        notifiedLowStockIds.current.add(item.id);
        try {
          new Notification(`Stock bajo en casa: ${item.name}`, {
            body: `Quedan ${item.quantity} ${item.unit} en ${item.location} (mínimo ${item.minQuantity} ${item.unit}).`,
            icon: '/pwa-192x192.png',
          });
        } catch {
          // Ignore notification constructor limits in mobile webviews
        }
      }
    });
  }, [lowStockItems, notificationPermission]);

  const requestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      showToast('Este navegador no soporta notificaciones nativas.');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      showToast('Notificaciones de agotamiento activadas.');
      try {
        new Notification('MercApp Casa conectada', {
          body: 'Te avisaremos cuando algún producto de tu alacena o nevera esté por agotarse.',
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Fallback handled via toast
      }
    } else {
      showToast('Permiso de notificaciones denegado por el navegador.');
    }
  };

  // Auth Actions
  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in error:', err);
      showToast('Error al iniciar sesión con Google.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // Firestore Mutations (Strictly validated against firebase-blueprint.json & firestore.rules)
  const handleAddScannedProduct = async (sub: ScannedProductSubmission) => {
    if (!user) return;

    const cleanName = sanitizeString(sub.name, 120, 'Producto');
    const cleanBrand = sanitizeString(sub.brand, 100, 'Genérico');
    const cleanBarcode = sanitizeString(sub.barcode, 64, '');
    const cleanSipsaRef = sanitizeString(sub.sipsaRefName, 120, '');
    const cleanImg = sanitizeString(sub.imageUrl, 500, '');
    const cleanNutri = sanitizeString(sub.nutriscore, 10, '');

    let createdInventoryId = '';

    if (sub.target === 'inventory' || sub.target === 'both') {
      const invRef = doc(collection(db, 'inventory'));
      createdInventoryId = invRef.id;
      try {
        await setDoc(invRef, {
          uid: user.uid,
          name: cleanName,
          brand: cleanBrand,
          barcode: cleanBarcode,
          category: sub.category,
          quantity: sanitizeNumber(sub.quantity, 0, 1000000),
          minQuantity: sanitizeNumber(sub.minQuantity, 0, 1000000),
          unit: sub.unit,
          estimatedPriceCop: sanitizeNumber(sub.estimatedPriceCop, 0, 100000000),
          sipsaRefName: cleanSipsaRef,
          imageUrl: cleanImg,
          nutriscore: cleanNutri,
          location: sub.location,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `inventory/${invRef.id}`);
      }
    }

    if (sub.target === 'shopping' || sub.target === 'both') {
      const shopRef = doc(collection(db, 'shopping_list'));
      try {
        await setDoc(shopRef, {
          uid: user.uid,
          name: cleanName,
          brand: cleanBrand,
          barcode: cleanBarcode,
          category: sub.category,
          quantityToBuy: sanitizeNumber(sub.quantityToBuy, 0.5, 1000000),
          unit: sub.unit,
          estimatedPriceCop: sanitizeNumber(sub.estimatedPriceCop, 0, 100000000),
          sipsaPriceCop: sanitizeNumber(sub.sipsaPriceCop, 0, 100000000),
          checked: false,
          inventoryItemId: sanitizeString(createdInventoryId, 128, ''),
          imageUrl: cleanImg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.CREATE,
          `shopping_list/${shopRef.id}`
        );
      }
    }

    showToast(`"${cleanName}" guardado correctamente.`);
  };

  // Action 1 on /inventory: update quantity & updatedAt
  const handleAdjustInventoryQuantity = async (
    item: InventoryItemDoc,
    delta: number
  ) => {
    const nextQty = Math.max(0, Number((item.quantity + delta).toFixed(2)));
    try {
      await updateDoc(doc(db, 'inventory', item.id), {
        quantity: sanitizeNumber(nextQty, 0, 1000000),
        updatedAt: serverTimestamp(),
      });
      if (nextQty <= item.minQuantity && item.quantity > item.minQuantity) {
        showToast(
          `Alerta: "${item.name}" llegó a stock mínimo (${nextQty} ${item.unit}).`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory/${item.id}`);
    }
  };

  const handleDeleteInventoryItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'inventory', itemId));
      showToast('Producto eliminado del inventario.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${itemId}`);
    }
  };

  // Send low-stock inventory item to Shopping List
  const handleSendInventoryToShopping = async (item: InventoryItemDoc) => {
    if (!user) return;
    const existingInCart = shoppingList.find(
      (s) =>
        s.inventoryItemId === item.id ||
        s.name.toLowerCase() === item.name.toLowerCase()
    );
    if (existingInCart) {
      showToast(`"${item.name}" ya está en tu Lista de Compras.`);
      return;
    }

    const sipsaMatch = findMatchingSipsaProduct(
      item.sipsaRefName || item.name,
      selectedMarket
    );
    const neededQty = Math.max(
      1,
      Number((item.minQuantity * 2 - item.quantity).toFixed(1))
    );
    const shopRef = doc(collection(db, 'shopping_list'));

    try {
      await setDoc(shopRef, {
        uid: user.uid,
        name: sanitizeString(item.name, 120, 'Producto'),
        brand: sanitizeString(item.brand, 100, 'Genérico'),
        barcode: sanitizeString(item.barcode, 64, ''),
        category: item.category,
        quantityToBuy: sanitizeNumber(neededQty, 1, 1000000),
        unit: item.unit,
        estimatedPriceCop: sanitizeNumber(item.estimatedPriceCop, 0, 100000000),
        sipsaPriceCop: sanitizeNumber(
          sipsaMatch ? sipsaMatch.wholesalePricePerKgCop : 0,
          0,
          100000000
        ),
        checked: false,
        inventoryItemId: sanitizeString(item.id, 128, ''),
        imageUrl: sanitizeString(item.imageUrl, 500, ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`"${item.name}" añadido a tu Lista de Compras.`);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `shopping_list/${shopRef.id}`
      );
    }
  };

  const handleSendAllLowStockToShopping = async () => {
    if (!user || lowStockItems.length === 0) return;
    let addedCount = 0;
    for (const item of lowStockItems) {
      const exists = shoppingList.some(
        (s) =>
          s.inventoryItemId === item.id ||
          s.name.toLowerCase() === item.name.toLowerCase()
      );
      if (!exists) {
        await handleSendInventoryToShopping(item);
        addedCount++;
      }
    }
    showToast(
      addedCount > 0
        ? `Se añadieron ${addedCount} productos por agotarse a la Lista de Compras.`
        : 'Todos los productos con bajo stock ya están en la Lista de Compras.'
    );
    setActiveTab('shopping');
  };

  // Shopping list actions
  const handleToggleShoppingChecked = async (shopItem: ShoppingItemDoc) => {
    try {
      await updateDoc(doc(db, 'shopping_list', shopItem.id), {
        checked: !shopItem.checked,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `shopping_list/${shopItem.id}`
      );
    }
  };

  const handleAdjustShoppingQty = async (
    shopItem: ShoppingItemDoc,
    delta: number
  ) => {
    const nextQty = Math.max(0.5, Number((shopItem.quantityToBuy + delta).toFixed(1)));
    try {
      await updateDoc(doc(db, 'shopping_list', shopItem.id), {
        quantityToBuy: sanitizeNumber(nextQty, 0.5, 1000000),
        estimatedPriceCop: shopItem.estimatedPriceCop,
        sipsaPriceCop: shopItem.sipsaPriceCop,
        checked: shopItem.checked,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `shopping_list/${shopItem.id}`
      );
    }
  };

  const handleDeleteShoppingItem = async (shopId: string) => {
    try {
      await deleteDoc(doc(db, 'shopping_list', shopId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `shopping_list/${shopId}`);
    }
  };

  // Complete purchase: move checked items from shopping_list into household inventory
  const handleRestockCheckedItems = async () => {
    if (!user) return;
    const checkedItems = shoppingList.filter((i) => i.checked);
    if (checkedItems.length === 0) return;

    for (const item of checkedItems) {
      const linkedInv = inventory.find(
        (inv) =>
          inv.id === item.inventoryItemId ||
          inv.name.toLowerCase() === item.name.toLowerCase()
      );

      if (linkedInv) {
        try {
          await updateDoc(doc(db, 'inventory', linkedInv.id), {
            quantity: sanitizeNumber(
              linkedInv.quantity + item.quantityToBuy,
              0,
              1000000
            ),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.UPDATE,
            `inventory/${linkedInv.id}`
          );
        }
      } else {
        const invRef = doc(collection(db, 'inventory'));
        const sipsaMatch = findMatchingSipsaProduct(item.name, selectedMarket);
        try {
          await setDoc(invRef, {
            uid: user.uid,
            name: sanitizeString(item.name, 120, 'Producto'),
            brand: sanitizeString(item.brand, 100, 'Genérico'),
            barcode: sanitizeString(item.barcode, 64, ''),
            category: item.category,
            quantity: sanitizeNumber(item.quantityToBuy, 0, 1000000),
            minQuantity: 1,
            unit: item.unit,
            estimatedPriceCop: sanitizeNumber(
              item.estimatedPriceCop,
              0,
              100000000
            ),
            sipsaRefName: sanitizeString(
              sipsaMatch ? sipsaMatch.productName : '',
              120,
              ''
            ),
            imageUrl: sanitizeString(item.imageUrl, 500, ''),
            nutriscore: '',
            location:
              item.category === 'Lácteos y huevos' ||
              item.category === 'Verduras y hortalizas'
                ? 'Nevera'
                : 'Alacena',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(
            error,
            OperationType.CREATE,
            `inventory/${invRef.id}`
          );
        }
      }

      try {
        await deleteDoc(doc(db, 'shopping_list', item.id));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `shopping_list/${item.id}`
        );
      }
    }

    showToast(
      `Se reabastecieron ${checkedItems.length} productos en tu inventario de casa.`
    );
  };

  // Add SIPSA item directly to Shopping List or Price Watch
  const handleAddSipsaToShopping = async (entry: SipsaWholesaleEntry) => {
    if (!user) return;
    const shopRef = doc(collection(db, 'shopping_list'));
    try {
      await setDoc(shopRef, {
        uid: user.uid,
        name: sanitizeString(entry.productName, 120, 'Alimento SIPSA'),
        brand: 'Plaza / Mercado Local',
        barcode: '',
        category: entry.group,
        quantityToBuy: 1,
        unit: 'kg',
        estimatedPriceCop: sanitizeNumber(
          entry.estimatedRetailPricePerKgCop,
          0,
          100000000
        ),
        sipsaPriceCop: sanitizeNumber(
          entry.wholesalePricePerKgCop,
          0,
          100000000
        ),
        checked: false,
        inventoryItemId: '',
        imageUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`"${entry.productName}" añadido a la Lista de Compras.`);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `shopping_list/${shopRef.id}`
      );
    }
  };

  const handlePinSipsaPriceWatch = async (entry: SipsaWholesaleEntry) => {
    if (!user) return;
    const exists = priceWatches.some(
      (w) =>
        w.sipsaProduct === entry.productName && w.marketCity === entry.marketCity
    );
    if (exists) {
      showToast(`Ya sigues el precio de "${entry.productName}" en ${entry.marketCity}.`);
      return;
    }

    const watchRef = doc(collection(db, 'price_watches'));
    try {
      await setDoc(watchRef, {
        uid: user.uid,
        sipsaProduct: sanitizeString(entry.productName, 120, 'Producto'),
        marketCity: sanitizeString(entry.marketCity, 120, selectedMarket),
        targetPriceCop: sanitizeNumber(
          Math.round((entry.wholesalePricePerKgCop * 0.95) / 50) * 50,
          0,
          100000000
        ),
        lastRecordedPriceCop: sanitizeNumber(
          entry.wholesalePricePerKgCop,
          0,
          100000000
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast(`Seguimiento SIPSA activado para "${entry.productName}".`);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `price_watches/${watchRef.id}`
      );
    }
  };

  const handleDeletePriceWatch = async (watchId: string) => {
    try {
      await deleteDoc(doc(db, 'price_watches', watchId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `price_watches/${watchId}`);
    }
  };

  // Seed Sample Colombian Household Basket
  const handleSeedColombianPantry = async () => {
    if (!user) return;
    const sampleItems: Array<{
      name: string;
      brand: string;
      barcode: string;
      category: ProductCategory;
      quantity: number;
      minQuantity: number;
      unit: ProductUnit;
      estimatedPriceCop: number;
      sipsaRefName: string;
      location: StorageLocation;
      nutriscore: string;
    }> = [
      {
        name: 'Arroz Diana Blanco (1kg)',
        brand: 'Diana',
        barcode: '7702025101119',
        category: 'Granos y cereales',
        quantity: 1,
        minQuantity: 2,
        unit: 'kg',
        estimatedPriceCop: 4600,
        sipsaRefName: 'Arroz blanco de primera',
        location: 'Alacena',
        nutriscore: 'B',
      },
      {
        name: 'Leche Entera Alquería (1.1L)',
        brand: 'Alquería',
        barcode: '7702001053902',
        category: 'Lácteos y huevos',
        quantity: 1,
        minQuantity: 2,
        unit: 'L',
        estimatedPriceCop: 5600,
        sipsaRefName: 'Leche entera larga vida',
        location: 'Nevera',
        nutriscore: 'B',
      },
      {
        name: 'Café Sello Rojo Tradicional (500g)',
        brand: 'Sello Rojo',
        barcode: '7702129001106',
        category: 'Procesados',
        quantity: 0,
        minQuantity: 1,
        unit: 'paq',
        estimatedPriceCop: 18500,
        sipsaRefName: 'Café molido tradicional',
        location: 'Alacena',
        nutriscore: 'A',
      },
      {
        name: 'Aguacate Hass Fresco',
        brand: 'Plaza Local',
        barcode: '',
        category: 'Frutas',
        quantity: 3,
        minQuantity: 2,
        unit: 'kg',
        estimatedPriceCop: 8400,
        sipsaRefName: 'Aguacate Hass',
        location: 'Nevera',
        nutriscore: 'A',
      },
      {
        name: 'Tomate Chonto Madurado',
        brand: 'Plaza Local',
        barcode: '',
        category: 'Verduras y hortalizas',
        quantity: 0.5,
        minQuantity: 1.5,
        unit: 'kg',
        estimatedPriceCop: 4450,
        sipsaRefName: 'Tomate chonto',
        location: 'Nevera',
        nutriscore: 'A',
      },
      {
        name: 'Papa Pastusa Limpia',
        brand: 'Plaza Local',
        barcode: '',
        category: 'Tubérculos, raíces y plátanos',
        quantity: 4,
        minQuantity: 2,
        unit: 'kg',
        estimatedPriceCop: 2850,
        sipsaRefName: 'Papa pastusa',
        location: 'Alacena',
        nutriscore: 'A',
      },
    ];

    for (const item of sampleItems) {
      const invRef = doc(collection(db, 'inventory'));
      try {
        await setDoc(invRef, {
          uid: user.uid,
          name: item.name,
          brand: item.brand,
          barcode: item.barcode,
          category: item.category,
          quantity: item.quantity,
          minQuantity: item.minQuantity,
          unit: item.unit,
          estimatedPriceCop: item.estimatedPriceCop,
          sipsaRefName: item.sipsaRefName,
          imageUrl: '',
          nutriscore: item.nutriscore,
          location: item.location,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `inventory/${invRef.id}`);
      }
    }

    showToast('Canasta familiar colombiana de ejemplo cargada en tu inventario.');
  };

  // Filtered Views & Metrics
  const sipsaList = useMemo(
    () => getSipsaPricesForMarket(selectedMarket),
    [selectedMarket]
  );

  const filteredSipsaList = useMemo(() => {
    return sipsaList.filter((entry) => {
      const matchesGroup =
        sipsaGroupFilter === 'Todos' || entry.group === sipsaGroupFilter;
      const matchesSearch =
        !sipsaSearch.trim() ||
        entry.productName.toLowerCase().includes(sipsaSearch.toLowerCase()) ||
        entry.group.toLowerCase().includes(sipsaSearch.toLowerCase());
      return matchesGroup && matchesSearch;
    });
  }, [sipsaList, sipsaGroupFilter, sipsaSearch]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesLoc =
        locationFilter === 'Todas' || item.location === locationFilter;
      const matchesSearch =
        !inventorySearch.trim() ||
        item.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
        item.brand.toLowerCase().includes(inventorySearch.toLowerCase()) ||
        item.barcode.includes(inventorySearch.trim());
      return matchesLoc && matchesSearch;
    });
  }, [inventory, locationFilter, inventorySearch]);

  const shoppingSummary = useMemo(() => {
    const totalEstimatedCop = shoppingList.reduce(
      (acc, item) => acc + item.estimatedPriceCop * item.quantityToBuy,
      0
    );
    const totalSipsaBenchmarkCop = shoppingList.reduce(
      (acc, item) =>
        acc +
        (item.sipsaPriceCop > 0 ? item.sipsaPriceCop : item.estimatedPriceCop * 0.82) *
          item.quantityToBuy,
      0
    );
    const checkedCount = shoppingList.filter((i) => i.checked).length;
    return {
      totalEstimatedCop,
      totalSipsaBenchmarkCop,
      checkedCount,
      pendingCount: shoppingList.length - checkedCount,
    };
  }, [shoppingList]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 md:pb-12 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white/95 backdrop-blur-md border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('inventory');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          MercApp Casa
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'inventory'
                ? 'text-slate-900 font-semibold underline decoration-emerald-600 decoration-2 underline-offset-8'
                : 'hover:text-slate-900'
            }`}
          >
            Inventario ({inventory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('shopping')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'shopping'
                ? 'text-slate-900 font-semibold underline decoration-emerald-600 decoration-2 underline-offset-8'
                : 'hover:text-slate-900'
            }`}
          >
            Lista de Compras ({shoppingList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sipsa')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'sipsa'
                ? 'text-slate-900 font-semibold underline decoration-emerald-600 decoration-2 underline-offset-8'
                : 'hover:text-slate-900'
            }`}
          >
            Precios SIPSA DANE
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'alerts'
                ? 'text-slate-900 font-semibold underline decoration-emerald-600 decoration-2 underline-offset-8'
                : 'hover:text-slate-900'
            }`}
          >
            Alertas ({lowStockItems.length})
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => {
                setScannerTarget(
                  activeTab === 'shopping' ? 'shopping' : 'inventory'
                );
                setScannerOpen(true);
              }}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Barcode className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Escanear Código</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Iniciar Sesión</span>
            </button>
          )}
        </div>
      </header>

      {/* Toast Notification Feedback */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 max-w-sm rounded-xl bg-slate-900 text-white px-4 py-3 text-xs font-medium shadow-lg border border-slate-700 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MAIN CONTAINER (1440px desktop presence + Mobile-first touch ergonomics) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {/* Workspace Toolbar: Market City Selector, PWA Install, Notifications & User Session */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Control de Mercado, Alacena y Precios SIPSA
            </h1>
            <p className="text-sm text-slate-600">
              Escanea códigos de barras con OpenFoodFacts · Recibe alertas de agotamiento · Compara precios mayoristas DANE
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 min-h-[40px]">
              <label
                htmlFor="market-select"
                className="text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                Central SIPSA:
              </label>
              <select
                id="market-select"
                value={selectedMarket}
                onChange={(e) =>
                  setSelectedMarket(e.target.value as ColombianMarket)
                }
                className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
              >
                {COLOMBIAN_MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <PWAInstallButton />

            {user && (
              <button
                type="button"
                onClick={requestBrowserNotifications}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {notificationPermission === 'granted' ? (
                  <>
                    <BellRing className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Alertas Activas</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Activar Notificaciones</span>
                  </>
                )}
              </button>
            )}

            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-600 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                title={`Conectado como ${user.email}`}
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Salir</span>
              </button>
            )}
          </div>
        </section>

        {/* Full-Width 4-Column KPI Summary Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white p-5 border border-slate-200">
            <p className="text-xs font-medium text-slate-500">
              Productos en Casa (Inventario)
            </p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
              {inventory.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Alacena · Nevera · Congelador · Aseo
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 border border-slate-200">
            <p className="text-xs font-medium text-slate-500">
              Por Agotarse / Stock Bajo
            </p>
            <p
              className={`mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums ${
                lowStockItems.length > 0 ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {lowStockItems.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {lowStockItems.length > 0
                ? 'Requieren reposición pronta'
                : 'Todo el inventario abastecido'}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 border border-slate-200">
            <p className="text-xs font-medium text-slate-500">
              Presupuesto Lista de Compras
            </p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900">
              {formatCop(shoppingSummary.totalEstimatedCop)}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {shoppingSummary.pendingCount} pendientes · {shoppingSummary.checkedCount} en carrito
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 border border-slate-200">
            <p className="text-xs font-medium text-slate-500">
              Referencia Mayorista SIPSA
            </p>
            <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700">
              {formatCop(shoppingSummary.totalSipsaBenchmarkCop)}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {selectedMarket.split('—')[0].trim()} · DANE SIPSA_P
            </p>
          </div>
        </section>

        {/* Authentication Prompt if Guest */}
        {authReady && !user && (
          <section className="rounded-2xl bg-white border border-slate-200 p-8 text-center max-w-2xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 text-balance">
              Sincroniza el mercado de tu hogar en todos tus dispositivos
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              Inicia sesión con tu cuenta de Google para guardar tu inventario de alacena y nevera, crear listas de compras colaborativas, escanear productos con OpenFoodFacts y consultar los precios mayoristas de SIPSA (DANE).
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSignIn}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Continuar con Google</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sipsa')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Explorar Precios SIPSA (DANE)
              </button>
            </div>
          </section>
        )}

        {/* Low Stock Alert Strip when authenticated and items are running out */}
        {user && lowStockItems.length > 0 && activeTab !== 'alerts' && (
          <section className="rounded-2xl bg-amber-50/90 border border-amber-200 p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Tienes {lowStockItems.length}{' '}
                  {lowStockItems.length === 1
                    ? 'producto por agotarse'
                    : 'productos por agotarse'}{' '}
                  en casa
                </p>
                <p className="text-xs text-slate-600">
                  {lowStockItems
                    .slice(0, 4)
                    .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSendAllLowStockToShopping}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                Pasar todos a Lista de Compras
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('alerts')}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-100/50 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                Ver Alertas
              </button>
            </div>
          </section>
        )}

        {/* TAB 1: INVENTARIO DE CASA */}
        {activeTab === 'inventory' && user && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Interactive Segmented Location Filter */}
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
                {['Todas', ...VALID_LOCATIONS].map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setLocationFilter(loc)}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      locationFilter === loc
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    placeholder="Buscar producto o EAN..."
                    className="w-full min-h-[42px] pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setScannerTarget('inventory');
                    setScannerOpen(true);
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Añadir Producto</span>
                </button>
              </div>
            </div>

            {dataLoading ? (
              <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center text-sm text-slate-500">
                Cargando inventario del hogar...
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-4">
                <Package className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-base font-bold text-slate-900">
                    Tu inventario está vacío en esta vista
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Escanea un código de barras con OpenFoodFacts o carga la canasta familiar colombiana de ejemplo para empezar a controlar cantidades y alertas de agotamiento.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTarget('inventory');
                      setScannerOpen(true);
                    }}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Barcode className="w-4 h-4 text-emerald-400" />
                    <span>Escanear con OpenFoodFacts</span>
                  </button>
                  {inventory.length === 0 && (
                    <button
                      type="button"
                      onClick={handleSeedColombianPantry}
                      className="min-h-[44px] px-5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Cargar Canasta Familiar Colombiana</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {filteredInventory.map((item) => {
                  const isLow = item.quantity <= item.minQuantity;
                  const sipsaRef = findMatchingSipsaProduct(
                    item.sipsaRefName || item.name,
                    selectedMarket
                  );

                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 truncate">
                            {item.name}
                          </h3>
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {item.quantity === 0 ? 'Agotado' : 'Por agotarse'}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Zero-Pill Unboxed Metadata with Typographic Separators */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="font-medium text-slate-700">
                            {item.location}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.brand}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          {item.barcode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">EAN {item.barcode}</span>
                            </>
                          )}
                          {item.nutriscore && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                Nutri-Score {item.nutriscore}
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            Mínimo: {item.minQuantity} {item.unit}
                          </span>
                          {sipsaRef && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-700 font-mono tabular-nums">
                                SIPSA: {formatCop(sipsaRef.wholesalePricePerKgCop)}/kg
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right Controls: Touch-friendly +/- Stepper & Quick Send to Shopping List */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleAdjustInventoryQuantity(item, -1)}
                            className="min-h-[40px] min-w-[40px] rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-2xs transition-colors cursor-pointer"
                            aria-label={`Disminuir cantidad de ${item.name}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <div className="min-w-[76px] text-center px-2">
                            <span
                              className={`text-sm font-bold font-mono tabular-nums ${
                                isLow ? 'text-amber-700' : 'text-slate-900'
                              }`}
                            >
                              {item.quantity}
                            </span>{' '}
                            <span className="text-xs text-slate-500 font-mono">
                              {item.unit}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAdjustInventoryQuantity(item, 1)}
                            className="min-h-[40px] min-w-[40px] rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-2xs transition-colors cursor-pointer"
                            aria-label={`Aumentar cantidad de ${item.name}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSendInventoryToShopping(item)}
                          className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 text-xs font-semibold text-slate-700 hover:text-emerald-800 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          title="Enviar a la Lista de Compras"
                        >
                          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden lg:inline">A Compras</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteInventoryItem(item.id)}
                          className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                          aria-label={`Eliminar ${item.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: LISTA DE COMPRAS */}
        {activeTab === 'shopping' && user && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Lista de Compras del Hogar
                </h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Total estimado: {formatCop(shoppingSummary.totalEstimatedCop)} · Referencia mayorista SIPSA:{' '}
                  {formatCop(shoppingSummary.totalSipsaBenchmarkCop)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {shoppingSummary.checkedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleRestockCheckedItems}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <PackageCheck className="w-4 h-4 shrink-0" />
                    <span>
                      Guardar Comprados en Alacena ({shoppingSummary.checkedCount})
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setScannerTarget('shopping');
                    setScannerOpen(true);
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Agregar / Escanear Producto</span>
                </button>
              </div>
            </div>

            {shoppingList.length === 0 ? (
              <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center space-y-4">
                <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-base font-bold text-slate-900">
                    Tu lista de compras está vacía
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Añade productos escaneando su código de barras, desde las alertas de bajo stock o directamente desde el boletín de precios mayoristas SIPSA (DANE).
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScannerTarget('shopping');
                      setScannerOpen(true);
                    }}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Barcode className="w-4 h-4 text-emerald-400" />
                    <span>Escanear o Buscar Producto</span>
                  </button>
                  {lowStockItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSendAllLowStockToShopping}
                      className="min-h-[44px] px-5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>
                        Importar {lowStockItems.length} Productos por Agotarse
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {shoppingList.map((item) => {
                  const lineTotal = item.estimatedPriceCop * item.quantityToBuy;
                  return (
                    <div
                      key={item.id}
                      className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        item.checked ? 'bg-slate-50/80' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleShoppingChecked(item)}
                          className={`min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                            item.checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-300 text-transparent hover:border-emerald-500'
                          }`}
                          aria-label={`Marcar ${item.name} como comprado`}
                        >
                          <Check className="w-5 h-5" />
                        </button>

                        <div className="min-w-0 space-y-1">
                          <p
                            className={`text-base font-bold truncate ${
                              item.checked
                                ? 'line-through text-slate-400'
                                : 'text-slate-900'
                            }`}
                          >
                            {item.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>{item.brand}</span>
                            <span aria-hidden="true">·</span>
                            <span>{item.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-700">
                              Unitario: {formatCop(item.estimatedPriceCop)}/{item.unit}
                            </span>
                            {item.sipsaPriceCop > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-emerald-700">
                                  Mayorista SIPSA: {formatCop(item.sipsaPriceCop)}/kg
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right mr-2">
                          <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
                            {formatCop(lineTotal)}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                            Subtotal
                          </p>
                        </div>

                        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleAdjustShoppingQty(item, -1)}
                            className="min-h-[38px] min-w-[38px] rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-2xs cursor-pointer"
                            aria-label="Menos cantidad"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="min-w-[60px] text-center text-xs font-bold font-mono tabular-nums text-slate-900">
                            {item.quantityToBuy} {item.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustShoppingQty(item, 1)}
                            className="min-h-[38px] min-w-[38px] rounded-lg bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center shadow-2xs cursor-pointer"
                            aria-label="Más cantidad"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteShoppingItem(item.id)}
                          className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                          aria-label={`Quitar ${item.name} de la lista`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: PRECIOS MAYORISTAS SIPSA (DANE) */}
        {(activeTab === 'sipsa' || !user) && (
          <section className="space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-900">
                    Monitor de Precios de Alimentos SIPSA (DANE) — {selectedMarket}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      Fuente oficial: Sistema de Información de Precios y Abastecimiento del Sector Agropecuario (SIPSA_P)
                    </span>
                    {sipsaMetadata && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">
                          Dataset Socrata: {sipsaMetadata.resourceId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <a
                          href={sipsaMetadata.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          <span>datos.gov.co</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sipsaSearch}
                    onChange={(e) => setSipsaSearch(e.target.value)}
                    placeholder="Buscar alimento en SIPSA (ej. Aguacate, Papa)..."
                    className="w-full min-h-[42px] pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Interactive Food Group Filter Bar */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
                {[
                  'Todos',
                  ...VALID_CATEGORIES.slice(0, 8),
                ].map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setSipsaGroupFilter(grp)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sipsaGroupFilter === grp
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            {/* SIPSA Wholesale Price Table / Cards */}
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                      <th className="py-3.5 px-6">Alimento / Grupo SIPSA</th>
                      <th className="py-3.5 px-4">Presentación Mayorista</th>
                      <th className="py-3.5 px-4 text-right">
                        Precio Mayorista / kg
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Rango (Mín – Máx)
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Est. Detal / Supermercado
                      </th>
                      <th className="py-3.5 px-4 text-right">Variación Semanal</th>
                      <th className="py-3.5 px-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSipsaList.map((entry) => {
                      const isDown = entry.weeklyVariationPct < 0;
                      const isUp = entry.weeklyVariationPct > 0;

                      return (
                        <tr
                          key={entry.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3.5 px-6">
                            <p className="font-bold text-slate-900">
                              {entry.productName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {entry.group} · {entry.supplyTrend}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600">
                            {entry.unitPresentation}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                            {formatCop(entry.wholesalePricePerKgCop)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                            {formatCop(entry.minPriceCop)} –{' '}
                            {formatCop(entry.maxPriceCop)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                            {formatCop(entry.estimatedRetailPricePerKgCop)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold">
                            <span
                              className={`inline-flex items-center justify-end gap-1 ${
                                isDown
                                  ? 'text-emerald-700'
                                  : isUp
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {isDown && <ArrowDownRight className="w-3.5 h-3.5" />}
                              {isUp && <ArrowUpRight className="w-3.5 h-3.5" />}
                              <span>
                                {entry.weeklyVariationPct > 0 ? '+' : ''}
                                {entry.weeklyVariationPct}%
                              </span>
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            {user ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAddSipsaToShopping(entry)}
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  <span>Comprar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePinSipsaPriceWatch(entry)}
                                  className="min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors inline-flex items-center justify-center cursor-pointer"
                                  title="Seguir precio en Alertas"
                                >
                                  <BookmarkPlus className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                Inicia sesión para añadir
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: ALERTAS Y SEGUIMIENTO DE PRECIOS */}
        {activeTab === 'alerts' && user && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Column 1: Low-Stock & Out-of-Stock Alerts */}
            <div className="rounded-2xl bg-white border border-slate-200 p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Alertas de Agotamiento en Casa
                    </h2>
                    <p className="text-xs text-slate-500">
                      Productos cuya cantidad actual es igual o inferior al stock mínimo definido
                    </p>
                  </div>
                  {lowStockItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSendAllLowStockToShopping}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Enviar todos a Compras
                    </button>
                  )}
                </div>

                {lowStockItems.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-900">
                      Ningún producto está por agotarse
                    </p>
                    <p className="text-xs text-slate-500">
                      Todas las existencias de tu alacena y nevera superan el umbral mínimo.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {lowStockItems.map((item) => (
                      <div
                        key={item.id}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            Quedan: {item.quantity} {item.unit} · Mínimo: {item.minQuantity}{' '}
                            {item.unit} · {item.location}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSendInventoryToShopping(item)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-900 hover:text-white text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          + Lista de Compras
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4 text-xs text-slate-500">
                <span>
                  Estado de notificaciones del navegador:{' '}
                  <strong className="text-slate-800">
                    {notificationPermission === 'granted'
                      ? 'Activadas'
                      : notificationPermission === 'denied'
                      ? 'Bloqueadas'
                      : 'Pendiente de permiso'}
                  </strong>
                </span>
                {notificationPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={requestBrowserNotifications}
                    className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                  >
                    Habilitar ahora
                  </button>
                )}
              </div>
            </div>

            {/* Column 2: Pinned SIPSA Price Watches & Best Harvest Drops */}
            <div className="rounded-2xl bg-white border border-slate-200 p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Seguimiento de Precios SIPSA y Cosecha
                    </h2>
                    <p className="text-xs text-slate-500">
                      Alimentos monitoreados y mayores bajas de precio esta semana en {selectedMarket.split('—')[0]}
                    </p>
                  </div>
                  <TrendingDown className="w-5 h-5 text-emerald-600 shrink-0" />
                </div>

                {priceWatches.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-500">
                      Tus alimentos fijados ({priceWatches.length})
                    </h3>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl px-4">
                      {priceWatches.map((w) => (
                        <div
                          key={w.id}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {w.sipsaProduct}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              {w.marketCity.split('—')[0]} · SIPSA actual:{' '}
                              {formatCop(w.lastRecordedPriceCop)}/kg · Meta:{' '}
                              {formatCop(w.targetPriceCop)}/kg
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePriceWatch(w.id)}
                            className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer"
                            aria-label="Eliminar seguimiento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Alimentos a la baja esta semana (Oportunidad de compra SIPSA)
                  </h3>
                  <div className="divide-y divide-slate-100">
                    {sipsaList
                      .filter((e) => e.weeklyVariationPct < -1.5)
                      .slice(0, 5)
                      .map((entry) => (
                        <div
                          key={entry.id}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {entry.productName}
                            </p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              Mayorista: {formatCop(entry.wholesalePricePerKgCop)}/kg ·{' '}
                              <span className="text-emerald-700 font-semibold">
                                {entry.weeklyVariationPct}% esta semana
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddSipsaToShopping(entry)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-900 hover:text-white text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Aprovechar Precio
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                <span>Datos sincronizados con boletín mayorista DANE SIPSA</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('sipsa')}
                  className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Ver tabla completa
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR (Ergonomic Thumb Zone <= 15% Sticky Cap) */}
      {user && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center h-16 px-2">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
              activeTab === 'inventory' ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-0.5">
              Inventario
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shopping')}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
              activeTab === 'shopping' ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-0.5">
              Compras ({shoppingList.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sipsa')}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
              activeTab === 'sipsa' ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <TrendingDown className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-0.5">
              SIPSA DANE
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`min-h-[44px] flex flex-col items-center justify-center cursor-pointer ${
              activeTab === 'alerts' ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px] font-semibold tracking-tight mt-0.5">
              Alertas ({lowStockItems.length})
            </span>
          </button>
        </nav>
      )}

      {/* Barcode Scanner & OpenFoodFacts Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        initialTarget={scannerTarget}
        selectedMarket={selectedMarket}
        onClose={() => setScannerOpen(false)}
        onSubmitProduct={handleAddScannedProduct}
      />

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
}
