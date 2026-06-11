import { beforeEach, describe, expect, test, vi } from 'vitest';
import { http } from './http';
import {
	acceptAssignment,
	approveCustomerQuote,
	closeInquiry,
	commentAndUpdateState,
	completeSupplierQuote,
	createInquiryItem,
	createSupplierQuote,
	deleteSupplierQuote,
	getTasks,
	getTasksWithDetails,
	getSupplierQuotes,
	get询价项Summary,
	listInquiryItems,
	markViewedAsAccepted,
	selectFinalQuote,
	updateInquiryItem,
	updateSupplierQuote,
} from './purchase-flow';

vi.mock('./http', () => ({
	http: {
		delete: vi.fn(),
		get: vi.fn(),
		patch: vi.fn(),
		post: vi.fn(),
	},
}));

const mockHttp = http as unknown as {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	patch: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
};

function mockSequence(responses: Array<{ data: { data: unknown } }>) {
	for (const response of responses) {
		mockHttp.get.mockResolvedValueOnce(response);
	}
}

describe('purchase flow api', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('loads 询价项 summary from inquiry_items', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: { id: 'inq-1' } } });

		await get询价项Summary('inq-1');

		const call = mockHttp.get.mock.calls[0];
		const params = call?.[1]?.params as { fields: string[] };

		expect(call?.[0]).toBe('/items/inquiry_items/inq-1');
		expect(params.fields).toEqual(
			expect.arrayContaining([
				'customer_id.customer_name',
				'sales_owner_id.first_name',
				'buyer_owner_id.first_name',
			]),
		);
		expect(mockHttp.get).toHaveBeenCalledWith(
			'/items/inquiry_items/inq-1',
			expect.objectContaining({
				params: expect.objectContaining({ fields: expect.any(Array) }),
			}),
		);
	});

	test('filters buyer tasks by owner and active buyer states', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [] } });

		await getTasks('Buyer', 'user-1');

		expect(mockHttp.get).toHaveBeenCalledWith(
			'/items/inquiry_items',
			expect.objectContaining({
				params: expect.objectContaining({
					filter: expect.objectContaining({ buyer_owner_id: { _eq: 'user-1' } }),
					limit: 50,
				}),
			}),
		);
	});

	test('uses atomic endpoint when adding conversation with state transition', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1', state: 'WaitingSalesReview' } } });

		await commentAndUpdateState({
			actor_id: 'user-1',
			content: '请补充目标价',
			inquiry_item_id: 'inq-1',
			state: 'WaitingSalesReview',
		});

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/communicate-and-transition',
			{
				content: '请补充目标价',
				inquiry_item_id: 'inq-1',
				next_state: 'WaitingSalesReview',
			},
			expect.objectContaining({ signal: undefined }),
		);

		expect(mockHttp.patch).not.toHaveBeenCalled();
	});

	test('uses action endpoint when adding communication without state transition', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1' } } });

		await commentAndUpdateState({
			actor_id: 'user-1',
			content: '仅补充沟通记录',
			inquiry_item_id: 'inq-1',
			state: null,
		});

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/communicate',
			{
				content: '仅补充沟通记录',
				inquiry_item_id: 'inq-1',
			},
			expect.objectContaining({ signal: undefined }),
		);
	});

	test('completes supplier quote through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1', state: 'WaitingSalesReview' } } });

		const result = await completeSupplierQuote('inq-1');

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/complete-supplier-quote',
			{ changed_fields: [], inquiry_item_id: 'inq-1' },
			expect.objectContaining({ signal: undefined }),
		);
		expect(result.state).toBe('WaitingSalesReview');
	});

	test('selects final quote through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1', customer_quote_id: 'cq-1', approval_required: false, approval_status: 'NotRequired', state: 'Quoted' } } });

		const result = await selectFinalQuote('inq-1', 'quote-1', { currency: 'USD', lead_time: '14天', price: '150', remark: '含利润报价' });

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/select-final-quote',
			{ currency: 'USD', inquiry_item_id: 'inq-1', lead_time: '14天', price: '150', remark: '含利润报价', supplier_quote_id: 'quote-1' },
			expect.objectContaining({ signal: undefined }),
		);
		expect(result.state).toBe('Quoted');
	});

	test('closes inquiry through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1', state: 'Closed' } } });

		const result = await closeInquiry('inq-1', '客户取消');

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/close-inquiry',
			{ inquiry_item_id: 'inq-1', reason: '客户取消' },
			expect.objectContaining({ signal: undefined }),
		);
		expect(result.state).toBe('Closed');
	});

	test('approves customer quote through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { approval_status: 'Rejected', customer_quote_id: 'cq-1', inquiry_item_id: 'inq-1', manager_approval_id: 'approval-1', state: 'WaitingSalesReview' } } });

		const result = await approveCustomerQuote('approval-1', 'Rejected', '利润不足，请调整报价');

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/approve-customer-quote',
			{ approval_id: 'approval-1', decision: 'Rejected', reason: '利润不足，请调整报价' },
			expect.objectContaining({ signal: undefined }),
		);
		expect(result.state).toBe('WaitingSalesReview');
	});

	test('marks viewed buyer task as accepted through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { accepted: true, inquiry_item_id: 'inq-1', state: 'Purchasing' } } });

		const result = await markViewedAsAccepted('inq-1');

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/mark-viewed-as-accepted',
			{ inquiry_item_id: 'inq-1' },
			expect.objectContaining({ signal: undefined }),
		);

		expect(result.accepted).toBe(true);
	});

	test('getTasksWithDetails issues exactly 4 http calls regardless of task count', async () => {
		mockSequence([
			{
				data: {
					data: [
						{ id: 'inq-1', state: 'Assigned' },
						{ id: 'inq-2', state: 'Purchasing' },
						{ id: 'inq-3', state: 'WaitingSalesReview' },
					],
				},
			},
			{ data: { data: [] } },
			{ data: { data: [] } },
			{ data: { data: [] } },
		]);

		const result = await getTasksWithDetails('Buyer', 'user-1');

		expect(mockHttp.get).toHaveBeenCalledTimes(4);
		expect(result.tasks).toHaveLength(3);
		expect(Object.keys(result.latestSteps)).toHaveLength(3);
		expect(result.latestSteps['inq-1']?.title).toBe('等待接单');
		expect(result.latestSteps['inq-2']?.title).toBe('采购处理中');
		expect(result.latestSteps['inq-3']?.title).toBe('等待外贸处理');
	});

	test('getTasksWithDetails uses _in filter with all task ids on the 3 batch calls', async () => {
		mockSequence([
			{
				data: {
					data: [
						{ id: 'inq-1', state: 'Assigned' },
						{ id: 'inq-2', state: 'Purchasing' },
					],
				},
			},
			{
				data: {
					data: [
						{ id: 'c-1', content: '请补充 MOQ', created_at: '2026-06-05T02:00:00Z', inquiry_item_id: 'inq-1' },
						{ id: 'c-2', content: '收到', created_at: '2026-06-05T03:00:00Z', inquiry_item_id: 'inq-2' },
					],
				},
			},
			{ data: { data: [] } },
			{ data: { data: [] } },
		]);

		await getTasksWithDetails('Buyer', 'user-1');

		const getCalls = mockHttp.get.mock.calls.map((call) => call[0]);
		expect(getCalls).toEqual([
			'/items/inquiry_items',
			'/items/conversations',
			'/items/supplier_quotes',
			'/items/customer_quotes',
		]);

		const conversationsCall = mockHttp.get.mock.calls[1][1] as { params: { filter: unknown } };
		expect(conversationsCall.params.filter).toEqual({ inquiry_item_id: { _in: ['inq-1', 'inq-2'] } });
	});

	test('getTasksWithDetails groups related records by inquiry_item_id and computes latest step', async () => {
		mockSequence([
			{
				data: {
					data: [
						{ id: 'inq-1', state: 'Purchasing' },
						{ id: 'inq-2', state: 'WaitingSalesReview' },
					],
				},
			},
			{
				data: {
					data: [
						{ id: 'c-1', content: '请补充 MOQ', created_at: '2026-06-05T02:00:00Z', inquiry_item_id: 'inq-1' },
					],
				},
			},
			{ data: { data: [] } },
			{ data: { data: [] } },
		]);

		const result = await getTasksWithDetails('Buyer', 'user-1');

		expect(result.tasks[0].conversations).toHaveLength(1);
		expect(result.tasks[1].conversations).toHaveLength(0);
		expect(result.latestSteps['inq-1']?.detail).toBe('请补充 MOQ');
		expect(result.latestSteps['inq-2']?.title).toBe('等待外贸处理');
	});

	test('getTasksWithDetails returns empty payload without extra calls when no tasks', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [] } });

		const result = await getTasksWithDetails('Buyer', 'user-1');

		expect(mockHttp.get).toHaveBeenCalledTimes(1);
		expect(result.tasks).toEqual([]);
		expect(result.latestSteps).toEqual({});
	});

	test('listInquiryItems filters sales items by owner', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [{ id: 'inq-1' }, { id: 'inq-2' }] } });

		const result = await listInquiryItems('Sales', 'user-1');

		expect(mockHttp.get).toHaveBeenCalledWith(
			'/items/inquiry_items',
			expect.objectContaining({
				params: expect.objectContaining({
					filter: { sales_owner_id: { _eq: 'user-1' } },
					sort: ['-updated_at'],
					limit: 50,
				}),
			}),
		);

		expect(result).toHaveLength(2);
	});

	test('listInquiryItems lets manager read all items', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [] } });

		await listInquiryItems('Manager', 'manager-1');

		const call = mockHttp.get.mock.calls[0][1] as { params: { filter?: unknown } };
		expect(call.params.filter).toBeUndefined();
	});

	test('createInquiryItem posts to inquiry_items with given payload', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { id: 'new-1', product_name: 'Sensor' } } });

		const payload = { product_name: 'Sensor', priority: 'High', sales_owner_id: 'user-1', state: 'Draft' };
		const result = await createInquiryItem(payload);

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/items/inquiry_items',
			payload,
			expect.objectContaining({ signal: undefined }),
		);

		expect(result.product_name).toBe('Sensor');
	});

	test('updates inquiry item through action endpoint', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1', updated_fields: ['product_name'] } } });

		const result = await updateInquiryItem('inq-1', { product_name: 'Updated Sensor' });

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/purchase-flow-actions/update-inquiry',
			{ inquiry_item_id: 'inq-1', product_name: 'Updated Sensor' },
			expect.objectContaining({ signal: undefined }),
		);
		expect(result.updated_fields).toContain('product_name');
	});

	test('createSupplierQuote posts to supplier_quotes with given payload', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { id: 'quote-1', price: 88 } } });

		const payload = { inquiry_item_id: 'inq-1', price: '88', supplier_id: 'supplier-1' };
		const result = await createSupplierQuote(payload);

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/items/supplier_quotes',
			payload,
			expect.objectContaining({ signal: undefined }),
		);

		expect(result.id).toBe('quote-1');
	});

	test('loads supplier quote supplier id for edit form refill', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [] } });

		await getSupplierQuotes('inq-1');

		const call = mockHttp.get.mock.calls[0];
		const params = call?.[1]?.params as { fields: string[] };

		expect(call?.[0]).toBe('/items/supplier_quotes');
		expect(params.fields).toEqual(expect.arrayContaining(['supplier_id.id', 'supplier_id.supplier_name']));
	});

	test('updateSupplierQuote patches supplier_quotes record', async () => {
		mockHttp.patch.mockResolvedValueOnce({ data: { data: { id: 'quote-1', price: 128 } } });

		const result = await updateSupplierQuote('quote-1', { inquiry_item_id: 'inq-1', price: 128 });

		expect(mockHttp.patch).toHaveBeenCalledWith(
			'/items/supplier_quotes/quote-1',
			expect.objectContaining({ price: 128 }),
			expect.objectContaining({ signal: undefined }),
		);

		expect(result.price).toBe(128);
	});

	test('deleteSupplierQuote deletes supplier_quotes record', async () => {
		mockHttp.delete.mockResolvedValueOnce({});

		await deleteSupplierQuote('quote-1');

		expect(mockHttp.delete).toHaveBeenCalledWith(
			'/items/supplier_quotes/quote-1',
			expect.objectContaining({ signal: undefined }),
		);
	});

	test('acceptAssignment calls accept-json endpoint with token', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: { inquiry_item_id: 'inq-1' } } });

		const result = await acceptAssignment('token-1');

		expect(mockHttp.get).toHaveBeenCalledWith(
			'/purchase-flow-accept/accept-json',
			expect.objectContaining({
				params: { token: 'token-1' },
				signal: undefined,
			}),
		);

		expect(result.inquiry_item_id).toBe('inq-1');
	});
});
