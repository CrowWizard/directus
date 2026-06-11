import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	approveCustomerQuote,
	commentAndUpdateState,
	closeInquiry,
	completeSupplierQuote,
	createSupplierQuote,
	deleteSupplierQuote,
	get询价项Detail,
	listSuppliers,
	markViewedAsAccepted,
	selectFinalQuote,
	updateInquiryItem,
	updateSupplierQuote,
} from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import 询价项DetailView from './inquiry-item-detail-view.vue';

vi.mock('../api/purchase-flow', () => ({
	approveCustomerQuote: vi.fn(),
	commentAndUpdateState: vi.fn(),
	closeInquiry: vi.fn(),
	completeSupplierQuote: vi.fn(),
	createSupplierQuote: vi.fn(),
	deleteSupplierQuote: vi.fn(),
	get询价项Detail: vi.fn(),
	listSuppliers: vi.fn(),
	markViewedAsAccepted: vi.fn(),
	selectFinalQuote: vi.fn(),
	updateInquiryItem: vi.fn(),
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
		auth.accessToken = 'token-1';
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

		vi.mocked(commentAndUpdateState).mockResolvedValue({ inquiry_item_id: 'inq-1' });

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

	test('filters conversation state actions by current role', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const buyerWrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(buyerWrapper.text()).toContain('交给外贸员补充报价信息');
		expect(buyerWrapper.text()).not.toContain('交给采购员再次报价');
		buyerWrapper.unmount();

		pinia = createPinia();
		setActivePinia(pinia);
		vi.mocked(listSuppliers).mockResolvedValue([]);

		const auth = useAuthStore();
		auth.accessToken = 'token-1';
		auth.currentUser = { id: 'sales-1', role: { name: '外贸员' } };

		const salesWrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(salesWrapper.text()).not.toContain('交给外贸员补充报价信息');
		expect(salesWrapper.text()).toContain('交给采购员再次报价');
	});

	test('shows customer and current owner names in detail instead of ids', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'manager-1', role: { name: '经理' } };

		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: { id: 'buyer-1', first_name: '采购', last_name: 'B', email: 'buyer@example.com' },
			conversations: [],
			customer_id: { id: 'customer-1', customer_code: 'CUST-001', customer_name: 'Acme Industrial Ltd' },
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.text()).toContain('Acme Industrial Ltd');
		expect(wrapper.text()).toContain('采购 B');
		expect(wrapper.text()).not.toContain('customer-1');
		expect(wrapper.text()).not.toContain('buyer-1');
	});

	test('always shows basic information for buyer', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'user-1',
			conversations: [],
			customer_id: { id: 'customer-1', customer_name: 'Acme Industrial Ltd' },
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			project_name: '测试项目',
			sales_owner_id: 'sales-1',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.text()).toContain('基础信息区');
		expect(wrapper.text()).toContain('Acme Industrial Ltd');
		expect(wrapper.text()).toContain('测试项目');
		expect(wrapper.text()).not.toContain('审批状态展示');
	});

	test('lets sales owner edit inquiry before final quote is completed', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'sales-1', role: { name: '外贸员' } };

		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				brand: 'ABB',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				model: 'S200',
				product_name: '传感器',
				sales_owner_id: 'sales-1',
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				brand: 'ABB',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				model: 'S200',
				product_name: '更新后的传感器',
				sales_owner_id: 'sales-1',
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			});

		vi.mocked(updateInquiryItem).mockResolvedValue({ inquiry_item_id: 'inq-1', updated_fields: ['product_name'] });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.findAll('button').find((button) => button.text() === '编辑询价项')!.trigger('click');
		await wrapper.find('[name="product_name"]').setValue('更新后的传感器');
		await wrapper.find('[data-test="inquiry-edit-form"]').trigger('submit');
		await flushPromises();

		expect(updateInquiryItem).toHaveBeenCalledWith('inq-1', expect.objectContaining({ product_name: '更新后的传感器' }), expect.anything());
		expect(wrapper.text()).toContain('询价项已更新，并通知采购查看最新需求。');
	});

	test('marks own assigned buyer task as accepted when opening detail', async () => {
		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				accepted_at: null,
				buyer_owner_id: 'user-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				state: 'Assigned',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				accepted_at: '2026-06-10T03:00:00Z',
				buyer_owner_id: 'user-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				state: 'Purchasing',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			});

		vi.mocked(markViewedAsAccepted).mockResolvedValue({ accepted: true, inquiry_item_id: 'inq-1', state: 'Purchasing' });

		mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(markViewedAsAccepted).toHaveBeenCalledWith('inq-1', expect.anything());
		expect(get询价项Detail).toHaveBeenCalledTimes(2);
	});

	test('selects inquiry content and shows final quote recommendations', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'sales-1', role: { name: '外贸员' } };

		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			brand: 'ABB',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			model: 'S200',
			sales_owner_id: 'sales-1',
			specification: '2P 16A',
			state: 'Purchasing',
			supplier_quotes: [
				{
					id: 'quote-1',
					currency: 'CNY',
					lead_time: '7天',
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

		const finalQuoteSection = wrapper.find('[data-test="final-quote-section"]');

		expect(finalQuoteSection.text()).not.toContain('一号供应商');
		expect(finalQuoteSection.text()).not.toContain('ABB S200 2P 16A 相似报价');
		expect(finalQuoteSection.text()).not.toContain('二号供应商');

		await wrapper.find('input[type="radio"]').setValue(true);
		await flushPromises();

		expect(wrapper.text()).toContain('一号供应商');
		expect(wrapper.text()).toContain('ABB S200 2P 16A 相似报价');
		expect(wrapper.find('[name="final_price"]').element).toHaveProperty('value', '120');
		expect(wrapper.text()).toContain('二号供应商');
		expect(wrapper.find('[data-test="toggle-supplier-quote-form"]').exists()).toBe(false);
	});

	test('lets sales owner edit selected final quote before submit', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'sales-1', role: { name: '外贸员' } };

		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				sales_owner_id: 'sales-1',
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', currency: 'CNY', lead_time: '7天', price: 120, quoted_by: 'user-1' }],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				sales_owner_id: 'sales-1',
				state: 'Quoted',
				supplier_quotes: [{ id: 'quote-1', currency: 'CNY', lead_time: '7天', price: 120, quoted_by: 'user-1' }],
			});

		vi.mocked(selectFinalQuote).mockResolvedValue({ approval_required: false, approval_status: 'NotRequired', customer_quote_id: 'customer-quote-1', inquiry_item_id: 'inq-1', state: 'Quoted' });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.find('input[name="supplier_quote_selection"]').setValue(true);
		await flushPromises();
		await wrapper.find('[name="final_price"]').setValue('150');
		await wrapper.find('[name="final_currency"]').setValue('USD');
		await wrapper.find('[name="final_lead_time"]').setValue('14天');
		await wrapper.find('[name="final_remark"]').setValue('含利润报价');
		await wrapper.find('[data-test="final-quote-form"]').trigger('submit');
		await flushPromises();

		expect(selectFinalQuote).toHaveBeenCalledWith(
			'inq-1',
			'quote-1',
			expect.objectContaining({ currency: 'USD', lead_time: '14天', price: 150, remark: '含利润报价' }),
			expect.anything(),
		);
	});

	test('hides final quote from non-sales owner', async () => {
		pinia = createPinia();
		setActivePinia(pinia);
		vi.mocked(listSuppliers).mockResolvedValue([]);

		const auth = useAuthStore();
		auth.$patch({ accessToken: 'token-1', currentUser: { id: 'user-1', role: { name: 'Buyer' } } });

		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'user-1',
			conversations: [],
			customer_quotes: [],
			inquiry_no: 'INQ-001',
			manager_approvals: [{ id: 'approval-1', status: 'Pending', reason: '需要审批' }],
			sales_owner_id: 'sales-1',
			state: 'Purchasing',
			supplier_quotes: [],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.text()).not.toContain('最终报价内容');
	});

	test('lets manager reject pending approval with remark and return to final quote review', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'manager-1', role: { name: '经理' } };

		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [],
				customer_quotes: [{ id: 'customer-quote-1', approval_status: 'Pending', currency: 'CNY', price: 150 }],
				inquiry_no: 'INQ-001',
				manager_approvals: [{ id: 'approval-1', status: 'Pending', reason: '超过审批阈值' }],
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', currency: 'CNY', price: 120 }],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				conversations: [{ content: '审批拒绝', created_at: '2026-06-10' }],
				customer_quotes: [{ id: 'customer-quote-1', approval_status: 'Rejected', currency: 'CNY', price: 150 }],
				inquiry_no: 'INQ-001',
				manager_approvals: [{ id: 'approval-1', status: 'Rejected', reason: '利润不足，请调整报价' }],
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', currency: 'CNY', price: 120 }],
			});

		vi.mocked(approveCustomerQuote).mockResolvedValue({ approval_status: 'Rejected', customer_quote_id: 'customer-quote-1', inquiry_item_id: 'inq-1', manager_approval_id: 'approval-1', state: 'WaitingSalesReview' });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.find('[name="approval_reason"]').setValue('利润不足，请调整报价');
		const rejectButton = wrapper.findAll('[data-test="approval-form"] button').find((button) => button.text() === '审批拒绝');

		expect(rejectButton).toBeTruthy();
		await rejectButton!.trigger('click');
		await flushPromises();

		expect(approveCustomerQuote).toHaveBeenCalledWith('approval-1', 'Rejected', '利润不足，请调整报价', expect.anything());
		expect(wrapper.text()).toContain('审批已拒绝，已退回外贸修改最终报价。');
	});

	test('locks conversation and final quote when inquiry is completed', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'sales-1', role: { name: '外贸员' } };

		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [{ content: '已完成报价', created_at: '2026-06-10' }],
			customer_quotes: [{ id: 'customer-quote-1', currency: 'CNY', price: 150 }],
			inquiry_no: 'INQ-001',
			sales_owner_id: 'sales-1',
			state: 'Quoted',
			supplier_quotes: [{ id: 'quote-1', currency: 'CNY', price: 120 }],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.find('[data-test="final-quote-section"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="final-quote-form"]').exists()).toBe(false);
		expect(wrapper.text()).toContain('客户报价历史');
		expect(wrapper.text()).toContain('150 CNY');
		expect(wrapper.find('[data-test="conversation-form"]').exists()).toBe(false);
		expect(wrapper.text()).toContain('询价项已完成或已结束，不能再提交沟通。');
	});

	test('shows final quote history to manager without submit form', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'manager-1', role: { name: '经理' } };

		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			conversations: [],
			customer_quotes: [{ id: 'customer-quote-1', approval_status: 'Approved', currency: 'CNY', price: 150 }],
			inquiry_no: 'INQ-001',
			manager_approvals: [{ id: 'approval-1', status: 'Approved', reason: '同意报价' }],
			sales_owner_id: 'sales-1',
			state: 'Quoted',
			supplier_quotes: [{ id: 'quote-1', currency: 'CNY', price: 120 }],
		});

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.find('[data-test="final-quote-section"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="final-quote-form"]').exists()).toBe(false);
		expect(wrapper.text()).toContain('客户报价历史');
		expect(wrapper.text()).toContain('150 CNY');
	});

	test('lets buyer complete supplier quote and notify sales', async () => {
		vi.mocked(get询价项Detail)
			.mockResolvedValueOnce({
				id: 'inq-1',
				buyer_owner_id: 'user-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				sales_owner_id: 'sales-1',
				state: 'Purchasing',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			})
			.mockResolvedValueOnce({
				id: 'inq-1',
				buyer_owner_id: 'user-1',
				conversations: [],
				customer_quotes: [],
				inquiry_no: 'INQ-001',
				sales_owner_id: 'sales-1',
				state: 'WaitingSalesReview',
				supplier_quotes: [{ id: 'quote-1', price: 88, quoted_by: 'user-1' }],
			});

		vi.mocked(completeSupplierQuote).mockResolvedValue({ inquiry_item_id: 'inq-1', state: 'WaitingSalesReview' });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();
		await wrapper.findAll('button').find((button) => button.text() === '完成报价')!.trigger('click');
		await flushPromises();

		expect(completeSupplierQuote).toHaveBeenCalledWith('inq-1', [], expect.anything());
		expect(wrapper.text()).toContain('已完成报价，并通知外贸确认最终报价。');
	});

	test('creates supplier quote from inline inquiry flow', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'user-1',
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
				price: 88,
				quoted_by: 'user-1',
				quoted_at: '2026-06-08',
				remark: '供应商报价流程录入',
				supplier_id: 'supplier-1',
			}),
			expect.anything(),
		);

		expect(wrapper.text()).toContain('一号供应商');
		expect(wrapper.text()).toContain('询价已保存。如已确认报价完整，请点击完成报价通知外贸。');
	});

	test('hides supplier quote creation from non-assigned buyer', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'other-buyer',
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

		expect(wrapper.find('[data-test="toggle-supplier-quote-form"]').exists()).toBe(false);
	});

	test('shows inline validation when required quote fields are missing', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'user-1',
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
		expect((wrapper.find('[name="supplier_id"]').element as HTMLSelectElement).value).toBe('supplier-1');
		await wrapper.find('[name="price"]').setValue('128');
		await wrapper.find('[data-test="supplier-quote-form"]').trigger('submit');
		await flushPromises();

		expect(updateSupplierQuote).toHaveBeenCalledWith('quote-1', expect.objectContaining({ price: 128 }), expect.anything());
		expect(wrapper.text()).toContain('询价已更新，修改项：采购价格：120 -> 128。');
		expect(wrapper.text()).not.toContain('币种：CNY -> CNY');
		expect(wrapper.text()).not.toContain('货期：7天 -> 7天');

		await wrapper.findAll('button').find((button) => button.text() === '删除')!.trigger('click');
		await flushPromises();
		expect(deleteSupplierQuote).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('再次点击确认删除该供应商报价。');

		await wrapper.findAll('button').find((button) => button.text() === '确认删除')!.trigger('click');
		await flushPromises();

		expect(deleteSupplierQuote).toHaveBeenCalledWith('quote-1', expect.anything());
		expect(wrapper.text()).toContain('询价已删除。');
	});

	test('lets assigned buyer edit inquiry content created by another user', async () => {
		vi.mocked(get询价项Detail).mockResolvedValue({
			id: 'inq-1',
			buyer_owner_id: 'user-1',
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
					quoted_by: 'other-user',
					supplier_id: { id: 'supplier-1', supplier_name: '一号供应商' },
				},
			],
		});

		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: '一号供应商' }]);
		vi.mocked(updateSupplierQuote).mockResolvedValue({ id: 'quote-1', price: 128 });

		const wrapper = mount(询价项DetailView, {
			global: { plugins: [pinia], stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
		});

		await flushPromises();

		expect(wrapper.findAll('button').some((button) => button.text() === '编辑')).toBe(true);

		await wrapper.findAll('button').find((button) => button.text() === '编辑')!.trigger('click');
		await wrapper.find('[name="price"]').setValue('128');
		await wrapper.find('[data-test="supplier-quote-form"]').trigger('submit');
		await flushPromises();

		expect(updateSupplierQuote).toHaveBeenCalledWith('quote-1', expect.objectContaining({ price: 128 }), expect.anything());
	});
});
