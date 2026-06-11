import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from '../api/purchase-flow';
import { useAuthStore } from '../stores/auth';
import SupplierCreateView from './supplier-create-view.vue';
import SupplierEditView from './supplier-edit-view.vue';
import SuppliersView from './suppliers-view.vue';

const push = vi.fn();
let routeParams: Record<string, string> = {};

vi.mock('../api/purchase-flow', () => ({
	createSupplier: vi.fn(),
	deleteSupplier: vi.fn(),
	getSupplier: vi.fn(),
	listSuppliers: vi.fn(),
	updateSupplier: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRoute: () => ({ params: routeParams }),
	useRouter: () => ({ push }),
}));

describe('SuppliersView', () => {
	let pinia: ReturnType<typeof createPinia>;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
		const auth = useAuthStore();
		auth.currentUser = { id: 'manager-1', role: { name: '经理' } };
		routeParams = {};
		vi.clearAllMocks();
	});

	const getGlobal = () => ({ plugins: [pinia], stubs: { RouterLink: { template: '<a><slot /></a>' } } });

	test('renders supplier list without inline form', async () => {
		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: 'Best Supplier' }]);

		const wrapper = mount(SuppliersView, { global: getGlobal() });
		await flushPromises();

		expect(wrapper.text()).toContain('Best Supplier');
		expect(wrapper.find('form').exists()).toBe(false);
	});

	test('deletes a supplier from the list', async () => {
		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: 'Best Supplier' }]);

		const wrapper = mount(SuppliersView, { global: getGlobal() });
		await flushPromises();
		await wrapper.find('[data-test="delete-supplier-1"]').trigger('click');
		await flushPromises();

		expect(deleteSupplier).toHaveBeenCalledWith('supplier-1', expect.anything());
	});

	test('hides supplier write actions for non-manager roles', async () => {
		const auth = useAuthStore();
		auth.currentUser = { id: 'buyer-1', role: { name: '采购员' } };
		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: 'Best Supplier' }]);

		const wrapper = mount(SuppliersView, { global: getGlobal() });
		await flushPromises();

		expect(wrapper.text()).not.toContain('新增供应商');
		expect(wrapper.text()).not.toContain('编辑');
		expect(wrapper.find('[data-test="delete-supplier-1"]').exists()).toBe(false);
	});

	test('creates a supplier on a standalone page', async () => {
		vi.mocked(createSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Best Supplier' });

		const wrapper = mount(SupplierCreateView, { global: getGlobal() });
		await wrapper.find('[name="supplier_name"]').setValue('Best Supplier');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(createSupplier).toHaveBeenCalledWith(
			expect.objectContaining({ supplier_name: 'Best Supplier' }),
			expect.anything(),
		);
		expect(push).toHaveBeenCalledWith('/suppliers');
	});

	test('updates a supplier on a standalone page', async () => {
		routeParams = { id: 'supplier-1' };
		vi.mocked(getSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Best' });
		vi.mocked(updateSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Best Co' });

		const wrapper = mount(SupplierEditView, { global: getGlobal() });
		await flushPromises();
		await wrapper.find('[name="supplier_name"]').setValue('Best Co');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(getSupplier).toHaveBeenCalledWith('supplier-1', expect.anything());
		expect(updateSupplier).toHaveBeenCalledWith(
			'supplier-1',
			expect.objectContaining({ supplier_name: 'Best Co' }),
			expect.anything(),
		);
		expect(push).toHaveBeenCalledWith('/suppliers');
	});
});
