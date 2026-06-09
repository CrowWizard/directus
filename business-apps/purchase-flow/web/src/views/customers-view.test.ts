import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from '../api/purchase-flow';
import CustomerCreateView from './customer-create-view.vue';
import CustomerEditView from './customer-edit-view.vue';
import CustomersView from './customers-view.vue';

const push = vi.fn();
let routeParams: Record<string, string> = {};

vi.mock('../api/purchase-flow', () => ({
	createCustomer: vi.fn(),
	deleteCustomer: vi.fn(),
	getCustomer: vi.fn(),
	listCustomers: vi.fn(),
	updateCustomer: vi.fn(),
}));

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
	useRoute: () => ({ params: routeParams }),
	useRouter: () => ({ push }),
}));

describe('CustomersView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		routeParams = {};
		vi.clearAllMocks();
	});

	const global = { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } };

	test('renders customer list without inline form', async () => {
		vi.mocked(listCustomers).mockResolvedValue([{ id: 'customer-1', customer_name: 'ACME' }]);

		const wrapper = mount(CustomersView, { global });
		await flushPromises();

		expect(wrapper.text()).toContain('ACME');
		expect(wrapper.find('form').exists()).toBe(false);
	});

	test('deletes a customer from the list', async () => {
		vi.mocked(listCustomers).mockResolvedValue([{ id: 'customer-1', customer_name: 'ACME' }]);

		const wrapper = mount(CustomersView, { global });
		await flushPromises();
		await wrapper.find('[data-test="delete-customer-1"]').trigger('click');
		await flushPromises();

		expect(deleteCustomer).toHaveBeenCalledWith('customer-1', expect.anything());
	});

	test('creates a customer on a standalone page', async () => {
		vi.mocked(createCustomer).mockResolvedValue({ id: 'customer-1', customer_name: 'ACME' });

		const wrapper = mount(CustomerCreateView, { global });
		await wrapper.find('[name="customer_name"]').setValue('ACME');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ customer_name: 'ACME' }), expect.anything());
		expect(push).toHaveBeenCalledWith('/customers');
	});

	test('updates a customer on a standalone page', async () => {
		routeParams = { id: 'customer-1' };
		vi.mocked(getCustomer).mockResolvedValue({ id: 'customer-1', customer_name: 'ACME' });
		vi.mocked(updateCustomer).mockResolvedValue({ id: 'customer-1', customer_name: 'ACME CN' });

		const wrapper = mount(CustomerEditView, { global });
		await flushPromises();
		await wrapper.find('[name="customer_name"]').setValue('ACME CN');
		await wrapper.find('form').trigger('submit');
		await flushPromises();

		expect(getCustomer).toHaveBeenCalledWith('customer-1', expect.anything());
		expect(updateCustomer).toHaveBeenCalledWith(
			'customer-1',
			expect.objectContaining({ customer_name: 'ACME CN' }),
			expect.anything(),
		);
		expect(push).toHaveBeenCalledWith('/customers');
	});
});
