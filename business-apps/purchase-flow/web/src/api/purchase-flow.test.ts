import { beforeEach, describe, expect, test, vi } from 'vitest';
import { http } from './http';
import { commentAndUpdateState, getTasks, get询价项Summary } from './purchase-flow';

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
		);

		expect(mockHttp.patch).toHaveBeenCalledWith('/items/inquiry_items/inq-1', { state: 'WaitingSalesReview' });
	});
});
