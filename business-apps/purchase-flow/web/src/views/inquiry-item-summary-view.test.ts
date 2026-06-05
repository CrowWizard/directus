import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { get询价项Summary } from '../api/purchase-flow';
import 询价项SummaryView from './inquiry-item-summary-view.vue';

vi.mock('../api/purchase-flow', () => ({ get询价项Summary: vi.fn() }));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRoute: () => ({ params: { id: 'inq-1' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

describe('InquiryItemSummaryView', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test('renders inquiry item as 询价项 summary', async () => {
		vi.mocked(get询价项Summary).mockResolvedValue({
			id: 'inq-1',
			inquiry_no: 'INQ-001',
			product_name: 'Bearing',
			state: 'Purchasing',
			supplier_quotes: [{ price: 120, supplier_id: { id: 'supplier-1', supplier_name: 'Best Supplier' } }],
		});

		const wrapper = mount(询价项SummaryView, {
			global: { plugins: [createPinia()], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.text()).toContain('询价项');
		expect(wrapper.text()).toContain('INQ-001');
		expect(wrapper.text()).toContain('Best Supplier');
	});
});
