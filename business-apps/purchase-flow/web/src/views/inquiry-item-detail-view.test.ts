import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	commentAndUpdateState,
	createSupplierQuote,
	deleteSupplierQuote,
	get询价项Detail,
	listSuppliers,
	updateSupplierQuote,
} from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import 询价项DetailView from './inquiry-item-detail-view.vue';

vi.mock('../api/purchase-flow', () => ({
	commentAndUpdateState: vi.fn(),
	createSupplierQuote: vi.fn(),
	deleteSupplierQuote: vi.fn(),
	get询价项Detail: vi.fn(),
	listSuppliers: vi.fn(),
	updateSupplierQuote: vi.fn(),
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
		vi.mocked(listSuppliers).mockResolvedValue([]);

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

	test('selects inquiry content and shows final quote recommendations', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			brand: 'ABB',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			model: 'S200',
			specification: '2P 16A',
			state: 'Purchasing',
			supplier_quotes: [
				{
					id: 'quote-1',
					currency: 'CNY',
					lead_time: '7天',
					moq: 1,
					price: 120,
					quoted_at: '2026-06-08',
					remark: 'ABB S200 2P 16A 相似报价',
					supplier_id: { id: 'supplier-1', supplier_name: '一号供应商' },
				},
				{
					id: 'quote-2',
					currency: 'CNY',
					price: 130,
					supplier_id: { id: 'supplier-2', supplier_name: '二号供应商' },
				},
			],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.text()).toContain('询价内容');
		expect(wrapper.text()).toContain('最终报价内容');
		expect(wrapper.text()).toContain('询价推荐');

		await wrapper.find('input[type="checkbox"]').setValue(true);

		expect(wrapper.text()).toContain('一号供应商');
		expect(wrapper.text()).toContain('ABB S200 2P 16A 相似报价');

		await wrapper.find('[data-test="toggle-supplier-quote-form"]').trigger('click');

		expect(wrapper.text()).toContain('二号供应商');
	});

	test('creates supplier quote from inline inquiry flow', async () => {
		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				state: 'Purchasing',
				supplier_quotes: [],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				state: 'Purchasing',
				supplier_quotes: [{ id: 'quote-1', price: 88, supplier_id: { id: 'supplier-1', supplier_name: '一号供应商' } }],
			});

		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: '一号供应商' }]);
		vi.mocked(createSupplierQuote).mockResolvedValue({ id: 'quote-1', price: 88 });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.find('[data-test="toggle-supplier-quote-form"]').trigger('click');
		await wrapper.find('[name="supplier_id"]').setValue('supplier-1');
		await wrapper.find('[name="price"]').setValue('88');
		await wrapper.find('[name="currency"]').setValue('USD');
		await wrapper.find('[name="moq"]').setValue('2');
		await wrapper.find('[name="lead_time"]').setValue('10天');
		await wrapper.find('[name="quoted_at"]').setValue('2026-06-08');
		await wrapper.find('[name="remark"]').setValue('供应商报价流程录入');
		await wrapper.find('[data-test="supplier-quote-form"]').trigger('submit');
		await flushPromises();

		expect(createSupplierQuote).toHaveBeenCalledWith(
			expect.objectContaining({
				currency: 'USD',
				inquiry_item_id: 'inq-1',
				inquiry_price: 88,
				lead_time: '10天',
				moq: 2,
				price: 88,
				quoted_by: 'user-1',
				quoted_at: '2026-06-08',
				remark: '供应商报价流程录入',
				supplier_id: 'supplier-1',
			}),
			expect.anything(),
		);

		expect(get询价项Detail).toHaveBeenCalledTimes(2);
		expect(wrapper.text()).toContain('一号供应商');
		expect(wrapper.text()).toContain('询价已保存。');
	});

	test('shows inline validation when required quote fields are missing', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.find('[data-test="toggle-supplier-quote-form"]').trigger('click');
		await wrapper.find('[data-test="supplier-quote-form"]').trigger('submit');

		expect(createSupplierQuote).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('请选择供应商。');
	});

	test('lets quote creator edit and delete inquiry content', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			state: 'Purchasing',
			supplier_quotes: [
				{
					id: 'quote-1',
					currency: 'CNY',
					lead_time: '7天',
					price: 120,
					quoted_at: '2026-06-08',
					quoted_by: 'user-1',
					supplier_id: { id: 'supplier-1', supplier_name: '一号供应商' },
				},
			],
		});

		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: '一号供应商' }]);
		vi.mocked(updateSupplierQuote).mockResolvedValue({ id: 'quote-1', price: 128 });
		vi.mocked(deleteSupplierQuote).mockResolvedValue(undefined);

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.findAll('button').find((button) => button.text() === '编辑')!.trigger('click');
		await wrapper.find('[name="price"]').setValue('128');
		await wrapper.find('[data-test="supplier-quote-form"]').trigger('submit');
		await flushPromises();

		expect(updateSupplierQuote).toHaveBeenCalledWith('quote-1', expect.objectContaining({ price: 128 }), expect.anything());
		expect(wrapper.text()).toContain('询价已更新。');

		await wrapper.findAll('button').find((button) => button.text() === '删除')!.trigger('click');
		await flushPromises();

		expect(deleteSupplierQuote).toHaveBeenCalledWith('quote-1', expect.anything());
		expect(wrapper.text()).toContain('询价已删除。');
	});
});
