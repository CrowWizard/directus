import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import SuppliersView from './suppliers-view.vue';
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../api/purchase-flow';

vi.mock('../api/purchase-flow', () => ({
	createSupplier: vi.fn(),
	deleteSupplier: vi.fn(),
	listSuppliers: vi.fn(),
	updateSupplier: vi.fn(),
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

		expect(createSupplier).toHaveBeenCalledWith(expect.objectContaining({ supplier_name: 'Best Supplier' }));
	});

	test('updates and deletes a supplier', async () => {
		vi.mocked(listSuppliers).mockResolvedValue([{ id: 'supplier-1', supplier_name: 'Best Supplier' }]);
		vi.mocked(updateSupplier).mockResolvedValue({ id: 'supplier-1', supplier_name: 'Better Supplier' });

		const wrapper = mount(SuppliersView, { global });
		await flushPromises();
		await wrapper.find('[data-test="edit-supplier-1"]').trigger('click');
		await wrapper.find('[name="supplier_name"]').setValue('Better Supplier');
		await wrapper.find('form').trigger('submit');
		await wrapper.find('[data-test="delete-supplier-1"]').trigger('click');

		expect(updateSupplier).toHaveBeenCalledWith('supplier-1', expect.objectContaining({ supplier_name: 'Better Supplier' }));
		expect(deleteSupplier).toHaveBeenCalledWith('supplier-1');
	});
});
