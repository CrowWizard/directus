import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import TasksView from './tasks-view.vue';
import { getTasks, get询价项Detail } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';

vi.mock('../api/purchase-flow', () => ({
	getTasks: vi.fn(),
	get询价项Detail: vi.fn(),
}));

vi.mock('vue-router', () => ({
	useRouter: () => ({ push: vi.fn() }),
}));

const mockGetTasks = vi.mocked(getTasks);
const mockGet询价项Detail = vi.mocked(get询价项Detail);

describe('TasksView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();

		const auth = useAuthStore();
		auth.accessToken = 'token-1';
		auth.currentUser = { id: 'buyer-1', role: { name: '采购员' } };
	});

	test('shows buyer active tasks with latest step', async () => {
		mockGetTasks.mockResolvedValue([
			{
				id: 'inq-1',
				brand: 'Best Brand',
				inquiry_no: 'INQ-001',
				priority: 'High',
				product_name: 'Bearing',
				state: 'Assigned',
			},
		]);
		mockGet询价项Detail.mockResolvedValue({
			id: 'inq-1',
			conversations: [{ content: '请补充 MOQ', created_at: '2026-06-05T02:00:00Z' }],
			customer_quotes: [],
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const wrapper = mount(TasksView, {
			global: {
				stubs: {
					RouterLink: { props: ['to'], template: '<a><slot /></a>' },
				},
			},
		});

		await flushPromises();

		expect(wrapper.text()).toContain('INQ-001');
		expect(wrapper.text()).toContain('请补充 MOQ');
	});
});
