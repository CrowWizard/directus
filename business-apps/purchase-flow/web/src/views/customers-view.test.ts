import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from '../api/purchase-flow';
import CustomersView from './customers-view.vue';

vi.mock('../api/purchase-flow', () => ({
	createCustomer: vi.fn(),
	deleteCustomer: vi.fn(),
	listCustomers: vi.fn(),
	updateCustomer: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRouter: () => ({ push: vi.fn() }),
}));

describe('CustomersView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	const global = { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } };

	test('creates a customer', async () => {
		vi.mocked(listCustomers).mockResolvedValue([]);
		vi.mocked(createCustomer).mockResolvedValue({ id: 'customer-1', customer_name: 'ACME' });

		const wrapper = mount(CustomersView, { global });
		await flushPromises();
		await wrapper.find('[name="customer_name"]').setValue('ACME');
		await wrapper.find('form').trigger('submit');

		expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'ACME' }), expect.anything());
	});

	test('updates and deletes a customer', async () => {
		vi.mocked(listCustomers).mockResolvedValue([{ id: 'customer-1', customer_name: 'ACME' }]);
		vi.mocked(updateCustomer).mockResolvedValue({ id: 'customer-1', customer_name: 'ACME CN' });

		const wrapper = mount(CustomersView, { global });
		await flushPromises();
		await wrapper.find('[data-test="edit-customer-1"]').trigger('click');
		await wrapper.find('[name="customer_name"]').setValue('ACME CN');
		await wrapper.find('form').trigger('submit');
		await flushPromises();
		await wrapper.find('[data-test="delete-customer-1"]').trigger('click');
		await flushPromises();

		expect(updateCustomer).toHaveBeenCalledWith(
			'customer-1',
			expect.objectContaining({ customer_name: 'ACME CN' }),
			expect.anything(),
		);
		expect(deleteCustomer).toHaveBeenCalledWith('customer-1', expect.anything());
	});
});
