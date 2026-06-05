import type {
	CommentAndStatePayload,
	Conversation,
	ConversationPayload,
	Customer,
	CustomerPayload,
	CustomerQuote,
	InquiryItem,
	InquiryItemDetail,
	InquiryState,
	RoleScope,
	Supplier,
	SupplierPayload,
	SupplierQuote,
} from '../types/purchase-flow';
import { http } from './http';

const summaryFields = [
	'*',
	'customer_id.*',
	'sales_owner_id.*',
	'buyer_owner_id.*',
	'supplier_quotes.*',
	'supplier_quotes.supplier_id.*',
	'customer_quotes.*',
];

const listFields = [
	'id',
	'inquiry_no',
	'inquiry_item_name',
	'product_name',
	'brand',
	'priority',
	'state',
	'assignment_deadline',
	'updated_at',
];

function unwrap<T>(response: { data: { data: T } }) {
	return response.data.data;
}

function getTaskFilter(roleScope: RoleScope, userId: string) {
	if (roleScope === 'Buyer') {
		return { buyer_owner_id: { _eq: userId }, state: { _in: ['Assigned', 'Purchasing'] } };
	}

	if (roleScope === 'Sales') {
		return { sales_owner_id: { _eq: userId }, state: { _in: ['Draft', 'WaitingSalesReview'] } };
	}

	return { state: { _in: ['Assigned', 'Purchasing', 'WaitingSalesReview'] } };
}

export async function getTasks(roleScope: RoleScope, userId: string) {
	const response = await http.get<{ data: InquiryItem[] }>('/items/inquiry_items', {
		params: {
			fields: listFields,
			filter: getTaskFilter(roleScope, userId),
			sort: ['assignment_deadline', '-updated_at'],
		},
	});

	return unwrap(response);
}

export async function get询价项Summary(询价项Id: string) {
	const response = await http.get<{ data: InquiryItem }>(`/items/inquiry_items/${询价项Id}`, {
		params: { fields: summaryFields },
	});

	return unwrap(response);
}

export async function getSupplierQuotes(询价项Id: string) {
	const response = await http.get<{ data: SupplierQuote[] }>('/items/supplier_quotes', {
		params: {
			fields: ['*', 'supplier_id.*', 'quoted_by.*'],
			filter: { inquiry_item_id: { _eq: 询价项Id } },
			sort: ['-quoted_at'],
		},
	});

	return unwrap(response);
}

export async function getCustomerQuotes(询价项Id: string) {
	const response = await http.get<{ data: CustomerQuote[] }>('/items/customer_quotes', {
		params: {
			fields: ['*', 'customer_id.*', 'quoted_by.*'],
			filter: { inquiry_item_id: { _eq: 询价项Id } },
			sort: ['-quoted_at'],
		},
	});

	return unwrap(response);
}

export async function getConversations(询价项Id: string) {
	const response = await http.get<{ data: Conversation[] }>('/items/conversations', {
		params: {
			fields: ['*', 'actor_id.*'],
			filter: { inquiry_item_id: { _eq: 询价项Id } },
			sort: ['-created_at'],
		},
	});

	return unwrap(response);
}

export async function get询价项Detail(询价项Id: string): Promise<InquiryItemDetail> {
	const [summary, conversations, supplierQuotes, customerQuotes] = await Promise.all([
		get询价项Summary(询价项Id),
		getConversations(询价项Id),
		getSupplierQuotes(询价项Id),
		getCustomerQuotes(询价项Id),
	]);

	return { ...summary, conversations, supplier_quotes: supplierQuotes, customer_quotes: customerQuotes };
}

export async function listCustomers() {
	const response = await http.get<{ data: Customer[] }>('/items/customers', { params: { sort: ['customer_name'] } });

	return unwrap(response);
}

export async function createCustomer(payload: CustomerPayload) {
	const response = await http.post<{ data: Customer }>('/items/customers', payload);

	return unwrap(response);
}

export async function updateCustomer(id: string, payload: CustomerPayload) {
	const response = await http.patch<{ data: Customer }>(`/items/customers/${id}`, payload);

	return unwrap(response);
}

export async function deleteCustomer(id: string) {
	await http.delete(`/items/customers/${id}`);
}

export async function listSuppliers() {
	const response = await http.get<{ data: Supplier[] }>('/items/suppliers', { params: { sort: ['supplier_name'] } });

	return unwrap(response);
}

export async function createSupplier(payload: SupplierPayload) {
	const response = await http.post<{ data: Supplier }>('/items/suppliers', payload);

	return unwrap(response);
}

export async function updateSupplier(id: string, payload: SupplierPayload) {
	const response = await http.patch<{ data: Supplier }>(`/items/suppliers/${id}`, payload);

	return unwrap(response);
}

export async function deleteSupplier(id: string) {
	await http.delete(`/items/suppliers/${id}`);
}

export async function createConversation(payload: ConversationPayload) {
	const response = await http.post<{ data: Conversation }>('/items/conversations', payload);

	return unwrap(response);
}

export async function update询价项State(询价项Id: string, state: InquiryState) {
	const response = await http.patch<{ data: InquiryItem }>(`/items/inquiry_items/${询价项Id}`, { state });

	return unwrap(response);
}

export async function commentAndUpdateState(payload: CommentAndStatePayload) {
	await createConversation({
		actor_id: payload.actor_id,
		content: payload.content,
		inquiry_item_id: payload.inquiry_item_id,
		metadata: payload.metadata,
	});

	if (payload.state) {
		await update询价项State(payload.inquiry_item_id, payload.state);
	}
}
