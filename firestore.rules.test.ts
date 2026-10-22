/**
 * Hardened Security Rules Verification Suite (Phase 0 & Phase 5 Red Team Audit)
 * Validates that all 12 Dirty Dozen payloads against /inventory, /shopping_list,
 * and /price_watches are rejected by firestore.rules.
 */

export interface SecurityPayloadTest {
  id: number;
  title: string;
  collection: 'inventory' | 'shopping_list' | 'price_watches';
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  docId: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityPayloadTest[] = [
  {
    id: 1,
    title: 'Identity Spoofing on Create (uid mismatch)',
    collection: 'inventory',
    operation: 'create',
    docId: 'inv_spoof_1',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { uid: 'victim_uid', name: 'Arroz Diana', quantity: 2 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    title: 'Unverified Email Write',
    collection: 'inventory',
    operation: 'create',
    docId: 'inv_unverified_2',
    auth: { uid: 'user_1', email_verified: false },
    payload: { uid: 'user_1', name: 'Leche Alquería', quantity: 1 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    title: 'Shadow Field Injection on Create',
    collection: 'inventory',
    operation: 'create',
    docId: 'inv_shadow_3',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', name: 'Café Sello Rojo', isVerified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    title: 'Shadow Field Injection on Update',
    collection: 'inventory',
    operation: 'update',
    docId: 'inv_shadow_4',
    auth: { uid: 'user_1', email_verified: true },
    payload: { quantity: 10, role: 'admin' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    title: 'Owner Reassignment on Update',
    collection: 'inventory',
    operation: 'update',
    docId: 'inv_owner_5',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_2', quantity: 3 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    title: 'Timestamp Forgery on Create',
    collection: 'shopping_list',
    operation: 'create',
    docId: 'shop_time_6',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', name: 'Aguacate Hass', createdAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    title: 'Immortal Field Mutation on Update (createdAt)',
    collection: 'shopping_list',
    operation: 'update',
    docId: 'shop_immortal_7',
    auth: { uid: 'user_1', email_verified: true },
    payload: { checked: true, createdAt: '2025-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    title: 'ID Poisoning Attack (Invalid characters in docId)',
    collection: 'inventory',
    operation: 'create',
    docId: 'bad$id!with*spaces',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', name: 'Papa Pastusa' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    title: 'Denial-of-Wallet String Overflow (name > 120 chars)',
    collection: 'inventory',
    operation: 'update',
    docId: 'inv_overflow_9',
    auth: { uid: 'user_1', email_verified: true },
    payload: { name: 'A'.repeat(250) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    title: 'Negative Quantity / Value Poisoning',
    collection: 'inventory',
    operation: 'update',
    docId: 'inv_negative_10',
    auth: { uid: 'user_1', email_verified: true },
    payload: { quantity: -25 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    title: 'Invalid Enum Injection on Category',
    collection: 'inventory',
    operation: 'create',
    docId: 'inv_enum_11',
    auth: { uid: 'user_1', email_verified: true },
    payload: { uid: 'user_1', name: 'Cebolla Cabezona', category: 'InvalidGroup' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    title: 'Cross-Tenant Query Scraping on List',
    collection: 'price_watches',
    operation: 'list',
    docId: '*',
    auth: { uid: 'attacker_uid', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
