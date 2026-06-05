import { describe, expect, test } from 'vitest';
import { getLatestStep } from './latest-step';

describe('getLatestStep', () => {
	test('uses latest conversation as 询价项 latest step', () => {
		const result = getLatestStep({
			询价项: { id: 'inq-1', state: 'Purchasing', updated_at: '2026-06-05T01:00:00Z' },
			conversations: [{ content: '请补充 MOQ', created_at: '2026-06-05T02:00:00Z' }],
			supplierQuotes: [],
			customerQuotes: [],
		});

		expect(result.title).toBe('最新沟通');
		expect(result.detail).toContain('请补充 MOQ');
	});

	test('uses latest supplier quote when newer than conversations', () => {
		const result = getLatestStep({
			询价项: { id: 'inq-1', state: 'Purchasing', updated_at: '2026-06-05T01:00:00Z' },
			conversations: [{ content: '旧沟通', created_at: '2026-06-05T02:00:00Z' }],
			supplierQuotes: [{ price: 120, currency: 'USD', quoted_at: '2026-06-05T03:00:00Z' }],
			customerQuotes: [],
		});

		expect(result.title).toBe('最新供应商报价');
		expect(result.detail).toContain('120');
	});

	test('uses latest customer quote when newest', () => {
		const result = getLatestStep({
			询价项: { id: 'inq-1', state: 'WaitingSalesReview', updated_at: '2026-06-05T01:00:00Z' },
			conversations: [],
			supplierQuotes: [{ price: 120, quoted_at: '2026-06-05T02:00:00Z' }],
			customerQuotes: [{ price: 160, currency: 'USD', quoted_at: '2026-06-05T04:00:00Z' }],
		});

		expect(result.title).toBe('最新客户报价');
		expect(result.ownerScope).toBe('Sales');
	});

	test('uses accepted task fallback before state fallback', () => {
		const result = getLatestStep({
			询价项: { id: 'inq-1', accepted_at: '2026-06-05T02:00:00Z', state: 'Purchasing' },
			conversations: [],
			supplierQuotes: [],
			customerQuotes: [],
		});

		expect(result.title).toBe('采购员已接单');
	});

	test('keeps state fallback copy explicit', () => {
		expect(
			getLatestStep({
				询价项: { id: 'inq-1', state: 'Assigned' },
				conversations: [],
				supplierQuotes: [],
				customerQuotes: [],
			}).detail,
		).toContain('等待采购员接单');

		expect(
			getLatestStep({
				询价项: { id: 'inq-1', state: 'WaitingSalesReview' },
				conversations: [],
				supplierQuotes: [],
				customerQuotes: [],
			}).detail,
		).toContain('等待外贸补充报价信息');
	});
});
