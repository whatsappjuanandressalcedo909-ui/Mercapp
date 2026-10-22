# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Ownership & Isolation (`uid`)**: Every document in `/inventory/{itemId}`, `/shopping_list/{shopId}`, and `/price_watches/{watchId}` is strictly owned by a single authenticated, email-verified user (`uid == request.auth.uid`). No user may read, list, update, or delete another user's documents.
2. **Strict Schema & Shadow Field Rejection**: All documents must contain the exact required keys (`hasAll` and `hasOnly`). Any extra or undocumented field (e.g., `isAdmin`, `role`, `shadowField`) is rejected on both `create` and `update`.
3. **Path Variable Hardening (`isValidId`)**: Document IDs (`{itemId}`, `{shopId}`, `{watchId}`) on single-document operations (`get`, `create`, `update`, `delete`) must match `^[a-zA-Z0-9_\-]+$` and be between 1 and 128 characters.
4. **Volumetric & Type Boundaries**: Every string field enforces `.size() <= maxLength` matching `firebase-blueprint.json`. Numeric quantities and prices must be non-negative bounded numbers (`>= 0 && <= 100000000`).
5. **Temporal & Identity Immutability**: On `create`, `createdAt == request.time` and `updatedAt == request.time`. On `update`, `uid == existing().uid`, `createdAt == existing().createdAt`, and `updatedAt == request.time`.
6. **Secure List Queries**: `allow list` rules explicitly validate `resource.data.uid == request.auth.uid` without using `get()` or `exists()` calls.

---

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Create**: Creating `/inventory/item_1` with `uid: "victim_user_99"` while signed in as `attacker_user_1`.
2. **Unverified Email Write**: Creating `/inventory/item_1` when `request.auth.token.email_verified == false`.
3. **Shadow Field Injection on Create**: Creating `/inventory/item_1` with all valid fields plus `"isVerified": true`.
4. **Shadow Field Injection on Update**: Updating `/inventory/item_1` with `"quantity": 5, "role": "admin"`.
5. **Owner Reassignment on Update**: Updating `/inventory/item_1` to change `uid` from `user_1` to `user_2`.
6. **Timestamp Forgery on Create**: Creating `/shopping_list/shop_1` with a client-supplied past timestamp (`createdAt != request.time`).
7. **Immortal Field Mutation on Update**: Updating `/shopping_list/shop_1` with a modified `createdAt` timestamp.
8. **ID Poisoning Attack**: Creating `/inventory/invalid$id!with*special/chars` or an ID exceeding 128 chars.
9. **Denial-of-Wallet String Overflow**: Updating `/inventory/item_1` with a `name` of 5,000 characters (`maxLength` is 120).
10. **Negative Quantity / Value Poisoning**: Updating `/inventory/item_1` with `quantity: -50` or `quantity: "ten"`.
11. **Invalid Enum Injection**: Creating `/inventory/item_1` with `category: "HackedCategory"` or `location: "Basement"`.
12. **Cross-Tenant Query Scraping**: Listing `/shopping_list` without `where('uid', '==', request.auth.uid)` or attempting to read another user's shopping list item.

---

## 3. Test Runner (`firestore.rules.test.ts`)

```ts
// Verification suite ensuring all 12 Dirty Dozen payloads return PERMISSION_DENIED
export const DIRTY_DOZEN_ASSERTIONS = [
  { id: 1, name: 'Identity Spoofing on Create', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Unverified Email Write', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Shadow Field Injection on Create', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow Field Injection on Update', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Owner Reassignment on Update', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'Timestamp Forgery on Create', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Immortal Field Mutation on Update', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'ID Poisoning Attack', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Denial-of-Wallet String Overflow', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'Negative Quantity / Value Poisoning', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Invalid Enum Injection', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Cross-Tenant Query Scraping', expected: 'PERMISSION_DENIED' },
];
```
