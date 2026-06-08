import { beforeEach, describe, expect, test, vi } from 'vitest';
import { http } from './http';
import { commentAndUpdateState, createInquiryItem, getTasks, getTasksWithDetails, get询价项Summary, listInquiryItems } from './purchase-flow';

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

	test('creates conversation before optional state update', async () => {
		mockHttp.post.mockResolvedValueOnce({ data: { data: { id: 'conversation-1' } } });
		mockHttp.patch.mockResolvedValueOnce({ data: { data: { id: 'inq-1' } } });

		await commentAndUpdateState({
			actor_id: 'user-1',
			content: '请补充目标价',
			inquiry_item_id: 'inq-1',
			state: 'WaitingSalesReview',
		});

		expect(mockHttp.post).toHaveBeenCalledWith(
			'/items/conversations',
			expect.objectContaining({ content: '请补充目标价' }),
			expect.objectContaining({ signal: undefined }),
		);

		expect(mockHttp.patch).toHaveBeenCalledWith(
			'/items/inquiry_items/inq-1',
			{ state: 'WaitingSalesReview' },
			expect.objectContaining({ signal: undefined }),
		);
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

	test('listInquiryItems fetches all items without role filter', async () => {
		mockHttp.get.mockResolvedValueOnce({ data: { data: [{ id: 'inq-1' }, { id: 'inq-2' }] } });

		const result = await listInquiryItems();

		expect(mockHttp.get).toHaveBeenCalledWith(
			'/items/inquiry_items',
			expect.objectContaining({
				params: expect.objectContaining({
					sort: ['-updated_at'],
					limit: 50,
				}),
			}),
		);

		expect(result).toHaveLength(2);
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
});
