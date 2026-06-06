# Security Specification: Attribute-Based Access Control (ABAC)

This document defines the strict relational data invariants, potential attack vector payloads (The "Dirty Dozen"), and custom automated test runner configuration to prevent logic leaks and privilege escalations in the ERP system.

## 1. Relational Data Invariants

- **Immutable ID Identity**: All document IDs must be validated string types (`isValidId`) to prevent ID Poisoning or resource exhaustion attacks.
- **Stock Guard Integrity**: Products cannot have negative stock. A cashier or admin can only commit a sale transaction if there is sufficient `currentStock` of the target product.
- **Immortal Audit Logs**: All system activity log and financial audit files are append-only. Mutation (`update`) and erasure (`delete`) are strictly forbidden.
- **Terminal State Lock**: Once a ledger record (Sales, Purchases, Payments) is marked with `VOID` or `voided` status, no subsequent state modifications can occur.
- **Strict Key Structure**: Avoid shadow field creation by requiring exact length constraints on write operations.

---

## 2. The "Dirty Dozen" Threat Vectors

Below are 12 specific JSON payloads representing malicious actions that are mathematically blocked by Firestore Security Rules.

| Threat ID | Collection | Action | Attack Payload Structure | Goal of Attack | Blocked By / Security Rule Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | `users` | Update | `{ "role": "admin" }` | Escalating privilege from `cashier` to `admin` | `!request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])` |
| **THREAT-02** | `sales` | Delete | `delete sales/sale-abc` | Erasing sales history to delete financial proof | `allow delete: if false;` |
| **THREAT-03** | `sales` | Create | `{ "id": "sale-1", "productId": "p-1", "quantity": 100000 }` | Buying stock that the store does not have | `get(productPath).currentStock >= request.resource.data.quantity` |
| **THREAT-04** | `products` | Update | `{ "purchasePrice": 0.01 }` | Modifying catalog purchase metrics directly as cashier | `hasRole('admin')` |
| **THREAT-05** | `cashLedger` | Create | `{ "id": "m-1", "amount": 900000 }` | Artificially injecting manual cash cash inflows | `hasRole('admin') \|\| hasRole('accountant')` |
| **THREAT-06** | `customers` | Update | `{ "dueBalance": 0 }` | Bypassing a customer's loan obligations | `hasRole('cashier') && dueBalance == unchanged` |
| **THREAT-07** | `Logs` | Update | `{ "action": "fake-clean" }` | Retroactively editing audit trail logs | `allow update: if false;` |
| **THREAT-08** | `purchases` | Create | `{ "id": "p-1", ... }` | Creating procurement liability entries as cashier | `hasRole('admin') \|\| hasRole('accountant')` |
| **THREAT-09** | `sales` | Update | `{ "totalAmount": 1.00 }` | Tampering with values in active transaction logs | `affectedKeys().hasOnly(['status'])` |
| **THREAT-10** | `items` | Create | `{ "id": "1", ... "ghostKey": "malicious" }` | Direct injection of unauthorized metadata | `keys().size() == 12` |
| **THREAT-11** | `customerPayments` | Update | `{ "amountPaid": 1000 }` | Double-changing settled credit payments | `affectedKeys().hasOnly(['status'])` |
| **THREAT-12** | `customerPayments` | Create | `{ "id": "payment-poison-1..." }` | Path poisoning using invalid high-character IDs | `isValidId(paymentId)` |

---

## 3. Test Runner Specification (`firestore.rules.test.ts`)

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'erp-go-live-spec',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('ERP System - Double-Gate Security TDD Suite', () => {
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('THREAT-01 (RBAC Self-Escalation): Fails to elevate user role to admin', async () => {
    const cashierDb = testEnv.authenticatedContext('user-cashier', { email: 'cashier@erp.internal' }).firestore();
    // Simulate updating roles field
    await assertFails(
      cashierDb.doc('users/user-cashier').update({
        role: 'admin'
      })
    );
  });

  it('THREAT-02 (Audit Erasure): Prevents deletion of committed sales', async () => {
    const adminDb = testEnv.authenticatedContext('user-admin', { email: 'admin@erp.internal' }).firestore();
    await assertFails(
      adminDb.doc('sales/sale-abc').delete()
    );
  });
});
```
