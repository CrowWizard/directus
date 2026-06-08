import type {
	CommentAndStatePayload,
	Conversation,
	ConversationPayload,
	Customer,
	CustomerPayload,
	CustomerQuote,
	InquiryItem,
	InquiryItemDetail,
	InquiryItemPayload,
	InquiryItemRow,
	InquiryState,
	RoleScope,
	Supplier,
	SupplierPayload,
	SupplierQuote,
} from '../types/purchase-flow';
import { getLatestStep, type LatestStep } from '../utils/latest-step';
import { http } from './http';

export type TaskWithDetail = InquiryItemDetail;

export type TasksWithDetails = {
	tasks: TaskWithDetail[];
	latestSteps: Record<string, LatestStep>;
};

const summaryFields = ['*'];

const listFields = [
	'id',
	'inquiry_no',
	'product_name',
	'project_name',
	'brand',
	'model',
	'specification',
	'quantity',
	'unit',
	'priority',
	'state',
	'assignment_deadline',
	'accepted_at',
	'updated_at',
	'customer_id.customer_name',
	'sales_owner_id.first_name',
	'sales_owner_id.last_name',
	'buyer_owner_id.first_name',
	'buyer_owner_id.last_name',
];

const TASKS_PAGE_LIMIT = 50;

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

function buildInquiryItemFilter(询价项Id: string | string[]) {
	return Array.isArray(询价项Id)
		? { inquiry_item_id: { _in: 询价项Id } }
		: { inquiry_item_id: { _eq: 询价项Id } };
}

function groupBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, T[]> {
	const result: Record<string, T[]> = {};

	for (const item of items) {
		const k = key(item);

		if (!k) continue;

		(result[k] ??= []).push(item);
	}

	return result;
}

export async function getTasks(roleScope: RoleScope, userId: string, signal?: AbortSignal) {
	const response = await http.get<{ data: InquiryItem[] }>('/items/inquiry_items', {
		params: {
			fields: listFields,
			filter: getTaskFilter(roleScope, userId),
			sort: ['assignment_deadline', '-updated_at'],
			limit: TASKS_PAGE_LIMIT,
		},
		signal,
	});

	return unwrap(response);
}

export async function listInquiryItems(signal?: AbortSignal) {
	const response = await http.get<{ data: InquiryItemRow[] }>('/items/inquiry_items', {
		params: {
			fields: listFields,
			sort: ['-updated_at'],
			limit: TASKS_PAGE_LIMIT,
		},
		signal,
	});

	return unwrap(response);
}

export async function get询价项Summary(询价项Id: string, signal?: AbortSignal) {
	const response = await http.get<{ data: InquiryItem }>(`/items/inquiry_items/${询价项Id}`, {
		params: { fields: summaryFields },
		signal,
	});

	return unwrap(response);
}

export async function getSupplierQuotes(询价项Id: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: SupplierQuote[] }>('/items/supplier_quotes', {
		params: {
			fields: ['*', 'supplier_id.supplier_name', 'inquiry_item_id'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-quoted_at'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function getCustomerQuotes(询价项Id: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: CustomerQuote[] }>('/items/customer_quotes', {
		params: {
			fields: ['*', 'inquiry_item_id'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-quoted_at'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function getConversations(询价项Id: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: Conversation[] }>('/items/conversations', {
		params: {
			fields: ['*', 'inquiry_item_id'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-created_at'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function get询价项Detail(询价项Id: string, signal?: AbortSignal): Promise<InquiryItemDetail> {
	const [summary, conversations, supplierQuotes, customerQuotes] = await Promise.all([
		get询价项Summary(询价项Id, signal),
		getConversations(询价项Id, signal),
		getSupplierQuotes(询价项Id, signal),
		getCustomerQuotes(询价项Id, signal),
	]);

	return { ...summary, conversations, supplier_quotes: supplierQuotes, customer_quotes: customerQuotes };
}

export async function getTasksWithDetails(
	roleScope: RoleScope,
	userId: string,
	signal?: AbortSignal,
): Promise<TasksWithDetails> {
	const tasks = await getTasks(roleScope, userId, signal);

	if (tasks.length === 0) {
		return { tasks: [], latestSteps: {} };
	}

	const taskIds = tasks.map((task) => task.id);

	const [conversations, supplierQuotes, customerQuotes] = await Promise.all([
		getConversations(taskIds, signal),
		getSupplierQuotes(taskIds, signal),
		getCustomerQuotes(taskIds, signal),
	]);

	const conversationsByItem = groupBy(conversations, (conversation) => conversation.inquiry_item_id);
	const supplierQuotesByItem = groupBy(supplierQuotes, (quote) => quote.inquiry_item_id);
	const customerQuotesByItem = groupBy(customerQuotes, (quote) => quote.inquiry_item_id);

	const tasksWithDetail: TaskWithDetail[] = tasks.map((task) => ({
		...task,
		conversations: conversationsByItem[task.id] || [],
		supplier_quotes: supplierQuotesByItem[task.id] || [],
		customer_quotes: customerQuotesByItem[task.id] || [],
	}));

	const latestSteps = Object.fromEntries(
		tasksWithDetail.map((task) => [
			task.id,
			getLatestStep({
				询价项: task,
				conversations: task.conversations,
				customerQuotes: task.customer_quotes,
				supplierQuotes: task.supplier_quotes,
			}),
		]),
	);

	return { tasks: tasksWithDetail, latestSteps };
}

export async function listCustomers(signal?: AbortSignal) {
	const response = await http.get<{ data: Customer[] }>('/items/customers', { params: { sort: ['customer_name'] }, signal });

	return unwrap(response);
}

export async function createCustomer(payload: CustomerPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: Customer }>('/items/customers', payload, { signal });

	return unwrap(response);
}

export async function updateCustomer(id: string, payload: CustomerPayload, signal?: AbortSignal) {
	const response = await http.patch<{ data: Customer }>(`/items/customers/${id}`, payload, { signal });

	return unwrap(response);
}

export async function deleteCustomer(id: string, signal?: AbortSignal) {
	await http.delete(`/items/customers/${id}`, { signal });
}

export async function listSuppliers(signal?: AbortSignal) {
	const response = await http.get<{ data: Supplier[] }>('/items/suppliers', { params: { sort: ['supplier_name'] }, signal });

	return unwrap(response);
}

export async function createSupplier(payload: SupplierPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: Supplier }>('/items/suppliers', payload, { signal });

	return unwrap(response);
}

export async function updateSupplier(id: string, payload: SupplierPayload, signal?: AbortSignal) {
	const response = await http.patch<{ data: Supplier }>(`/items/suppliers/${id}`, payload, { signal });

	return unwrap(response);
}

export async function deleteSupplier(id: string, signal?: AbortSignal) {
	await http.delete(`/items/suppliers/${id}`, { signal });
}

export async function createInquiryItem(payload: InquiryItemPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: InquiryItem }>('/items/inquiry_items', payload, { signal });

	return unwrap(response);
}

export async function createConversation(payload: ConversationPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: Conversation }>('/items/conversations', payload, { signal });

	return unwrap(response);
}

export async function update询价项State(询价项Id: string, state: InquiryState, signal?: AbortSignal) {
	const response = await http.patch<{ data: InquiryItem }>(`/items/inquiry_items/${询价项Id}`, { state }, { signal });

	return unwrap(response);
}

export async function commentAndUpdateState(payload: CommentAndStatePayload, signal?: AbortSignal) {
	await createConversation(
		{
			actor_id: payload.actor_id,
			content: payload.content,
			inquiry_item_id: payload.inquiry_item_id,
			metadata: payload.metadata,
		},
		signal,
	);

	if (payload.state) {
		await update询价项State(payload.inquiry_item_id, payload.state, signal);
	}
}
