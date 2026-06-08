import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTasksWithDetails } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import TasksView from './tasks-view.vue';

vi.mock('../api/purchase-flow', () => ({
	getTasksWithDetails: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRouter: () => ({ push: vi.fn() }),
}));

const mockGetTasksWithDetails = vi.mocked(getTasksWithDetails);

describe('TasksView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();

		const auth = useAuthStore();
		auth.accessToken = 'token-1';
		auth.currentUser = { id: 'buyer-1', role: { name: '采购员' } };
	});

	test('shows buyer active tasks with latest step', async () => {
		mockGetTasksWithDetails.mockResolvedValue({
			latestSteps: {
				'inq-1': { at: '2026-06-05T02:00:00Z', detail: '请补充 MOQ', ownerScope: null, title: '最新沟通' },
			},
			tasks: [
				{
					id: 'inq-1',
					brand: 'Best Brand',
					conversations: [],
					customer_quotes: [],
					inquiry_no: 'INQ-001',
					priority: 'High',
					product_name: 'Bearing',
					state: 'Assigned',
					supplier_quotes: [],
				},
			],
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
