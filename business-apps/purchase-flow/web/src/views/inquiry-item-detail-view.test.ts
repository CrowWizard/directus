import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { commentAndUpdateState, get询价项Detail } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import 询价项DetailView from './inquiry-item-detail-view.vue';

vi.mock('../api/purchase-flow', () => ({
	commentAndUpdateState: vi.fn(),
	get询价项Detail: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRoute: () => ({ params: { id: 'inq-1' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

describe('InquiryItemDetailView', () => {
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
		vi.clearAllMocks();

		const auth = useAuthStore();
		auth.currentUser = { id: 'user-1', role: { name: '采购员' } };
	});

	test('adds conversation and sends 询价项 back to sales', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		vi.mocked(commentAndUpdateState).mockResolvedValue(undefined);

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.find('[name="content"]').setValue('请补充目标价');
		await wrapper.find('[name="state_action"]').setValue('WaitingSalesReview');
		await wrapper.find('[data-test="conversation-form"]').trigger('submit');
		await flushPromises();

		expect(commentAndUpdateState).toHaveBeenCalledWith(
			expect.objectContaining({
				content: '请补充目标价',
				state: 'WaitingSalesReview',
			}),
			expect.anything(),
		);
	});
});
