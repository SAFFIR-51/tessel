import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import * as F from './flow-core';
import * as M from './finance';
import { seed } from './seed';
import { createWorkOrder } from './production';

test.each(['2026-10-12', '2026-10-18', '2027-01-15'])('샘플 예정일이 지난 %s에도 초기화되고 신규 생산의 과거 예정일은 거부', today => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T12:00:00`));
  try {
    const s = seed('epure');
    assert.equal(s.workOrders.length, 3);
    assert.equal(s.workOrders.find(w => w.id === 'MO-202610-002')?.due, '2026-10-10');
    assert.equal(s.workOrders.find(w => w.id === 'MO-202610-003')?.due, '2026-10-17');
    assert.equal(s.workOrders.find(w => w.id === 'MO-202610-001')?.status, '완료');
    assert.throws(() => createWorkOrder(s, { productCode: 'FG-001', qty: 1, due: '2026-10-10' }), /완료 예정일/);
    assert.doesNotThrow(() => seed('other'));
  } finally {
    vi.useRealTimers();
  }
});

test('샘플 데이터: 재고와 입출고 이력 합계 일치, 미수·미지급 계산 가능', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    for (const i of s.items) {
      const sum = F.round(s.movements.filter(m => m.code === i[0] && m.stockType !== '불량').reduce((t, m) => t + m.qty, 0));
      assert.equal(sum, i[4], `${company} ${i[0]} 재고 = 이력 합계`);
    }
    assert.ok(s.movements.every(m => m.ref === 'OPENING' || s.sales.some(x => x.id === m.ref) || s.orders.some(x => x.id === m.ref) || s.workOrders.some(x => x.id === m.ref) || s.inv.transfers.some(x => x.id === m.ref) || s.books.fxDeals.some(x => x.id === m.ref)), '이력의 관련 문서가 모두 존재');
    assert.equal(M.receivables(s, '2026-10-07').length, 3, '8월 · 10월 2건 판매 미수');
    assert.ok(M.receivables(s, '2026-10-07')[0].balance > 0);
    assert.ok(M.payables(s, '2026-10-07').some(p => p.settled === 1000000), '선지급 100만');
  }
});
