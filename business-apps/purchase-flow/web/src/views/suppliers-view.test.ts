import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../api/purchase-flow';
import SuppliersView from './suppliers-view.vue';

vi.mock('../api/purchase-flow', () => ({
	createSupplier: vi.fn(),
	deleteSupplier: vi.fn(),
	listSuppliers: vi.fn(),
	updateSupplier: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRouter: () => ({ push: vi.fn() }),
}));

describe('SuppliersView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	const global = { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } };

	test('creates a supplier', async () => {
		vi.mocked(listSuppliers).mockResolvedValue([]);
		vi.mocked(createSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Best Supplier' });

		const wrapper = mount(SuppliersView, { global });
		await flushPromises();
		await wrapper.find('[name="supplier_name"]').setValue('Best Supplier');
		await wrapper.find('form').trigger('submit');

		expect(createSupplier).toHaveBeenCalledWith(expect.objectContaining({ supplier_name: 'Best Supplier' }), expect.anything());
	});

	test('updates and deletes a supplier', async () => {
		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: 'Best' }]);
		vi.mocked(updateSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Best Co' });

		const wrapper = mount(SuppliersView, { global });
		await flushPromises();
		await wrapper.find('[data-test="edit-supplier-1"]').trigger('click');
		await wrapper.find('[name="supplier_name"]').setValue('Best Co');
		await wrapper.find('form').trigger('submit');
		await flushPromises();
		await wrapper.find('[data-test="delete-supplier-1"]').trigger('click');
		await flushPromises();

		expect(updateSupplier).toHaveBeenCalledWith(
			'supplier-1',
			expect.objectContaining({ supplier_name: 'Best Co' }),
			expect.anything(),
		);
		expect(deleteSupplier).toHaveBeenCalledWith('supplier-1', expect.anything());
	});
});
