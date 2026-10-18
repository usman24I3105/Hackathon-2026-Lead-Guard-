/**
 * SEC-7: Value-masking sweep test
 * Simulates and verifies that for users without the `values.view` permission,
 * NO value-bearing keys appear across:
 * - Opportunities list & detail
 * - Customer 360 view
 * - Dashboard tiles & drill-downs
 * - Audit diffs
 *
 * Usage: npx tsx scripts/masking-sweep.ts
 */
import { maskValues, maskAuditDiff } from '../src/security/masking';

const FORBIDDEN_VALUE_KEYS = [
  'valueCents',
  'value_cents',
  'collected',
  'refundedCents',
  'refunded_cents',
  'totalValue',
  'total_value',
];

function scanForLeakedKeys(obj: unknown, path = ''): string[] {
  const leaks: string[] = [];
  if (obj === null || typeof obj !== 'object') return leaks;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      leaks.push(...scanForLeakedKeys(item, `${path}[${idx}]`));
    });
    return leaks;
  }

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const currentPath = path ? `${path}.${k}` : k;
    if (FORBIDDEN_VALUE_KEYS.includes(k)) {
      leaks.push(currentPath);
    }
    leaks.push(...scanForLeakedKeys(v, currentPath));
  }
  return leaks;
}

function testMaskingSweep(): void {
  console.log('🔒 Starting SEC-7 value-masking sweep across all endpoints...');
  let totalTests = 0;
  let passedTests = 0;

  // 1. Opportunities list payload
  totalTests++;
  const rawOpps = [
    { id: 'opp_1', name: 'Big Deal', value_cents: 500000, stage_id: 'stg_1' },
    { id: 'opp_2', name: 'Small Deal', value_cents: 20000, stage_id: 'stg_2' },
  ];
  const maskedOpps = maskValues(rawOpps, false);
  const oppLeaks = scanForLeakedKeys(maskedOpps);
  if (oppLeaks.length === 0) {
    console.log('✅ Opportunities list: no value leaks detected');
    passedTests++;
  } else {
    console.error('❌ Opportunities list leak:', oppLeaks);
  }

  // 2. Customer 360 view payload
  totalTests++;
  const raw360 = {
    contact: { id: 'con_1', name: 'John Doe' },
    opportunities: [{ id: 'opp_1', name: 'Contract A', value_cents: 120000 }],
    payments: [{ id: 'pay_1', amount_cents: 120000, refunded_cents: 0 }],
  };
  const masked360 = maskValues(raw360, false);
  const leaks360 = scanForLeakedKeys(masked360);
  if (leaks360.length === 0) {
    console.log('✅ Customer 360: no value leaks detected');
    passedTests++;
  } else {
    console.error('❌ Customer 360 leak:', leaks360);
  }

  // 3. Dashboard tiles
  totalTests++;
  const rawDashboard = {
    tiles: {
      newLeads: 12,
      escalated: 5,
      recovery: 2,
      collected: 150000,
      openLeads: 8,
    },
    scope: 'personal',
  };
  const maskedDashboard = maskValues(rawDashboard, false);
  const dashLeaks = scanForLeakedKeys(maskedDashboard);
  if (dashLeaks.length === 0) {
    console.log('✅ Dashboard tiles: collected metric stripped for unauthorized users');
    passedTests++;
  } else {
    console.error('❌ Dashboard tile leak:', dashLeaks);
  }

  // 4. Audit log diff masking
  totalTests++;
  const rawAuditDiff = {
    stage_id: 'stg_won',
    value_cents: 850000,
    name: 'Deal Updated',
  };
  const maskedAudit = maskAuditDiff(rawAuditDiff, false);
  if (maskedAudit && maskedAudit['value_cents'] === '[masked]') {
    console.log('✅ Audit diff: sensitive values masked to [masked]');
    passedTests++;
  } else {
    console.error('❌ Audit diff leak or failure:', maskedAudit);
  }

  console.log(`\n📊 Masking sweep result: ${passedTests}/${totalTests} suites passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

testMaskingSweep();
