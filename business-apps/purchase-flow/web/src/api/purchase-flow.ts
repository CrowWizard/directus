import type {
	CommentAndStatePayload,
	FinalQuotePayload,
	Conversation,
	ConversationPayload,
	Customer,
	CustomerContact,
	CustomerPayload,
	CustomerQuote,
	CustomerQuotePayload,
	BuyerProfile,
	BuyerProfilePayload,
	DirectusRole,
	Employee,
	EmployeePayload,
	InquiryItem,
	InquiryItemDetail,
	InquiryItemPayload,
	InquiryItemRow,
	InquiryState,
	PurchaseTag,
	PurchaseTagPayload,
	RoleScope,
	Supplier,
	SupplierContact,
	SupplierPayload,
	SupplierQuote,
	SupplierQuotePayload,
	ManagerApproval,
	UserTaskSummary,
} from '../types/purchase-flow';
import { getLatestStep, type LatestStep } from '../utils/latest-step';
import { http } from './http';

export type TaskWithDetail = InquiryItemDetail;

export type TasksWithDetails = {
	tasks: TaskWithDetail[];
	latestSteps: Record<string, LatestStep>;
};

export type AcceptAssignmentResult = {
	inquiry_item_id: string;
};

export type MarkViewedAsAcceptedResult = {
	accepted: boolean;
	inquiry_item_id: string;
	state: InquiryState;
};

export type CompleteSupplierQuoteResult = {
	inquiry_item_id: string;
	state: InquiryState;
};

export type UpdateInquiryResult = {
	inquiry_item_id: string;
	state?: InquiryState;
	updated_fields: string[];
};

export type SelectFinalQuoteResult = {
	approval_required: boolean;
	approval_status: string;
	customer_quote_id: string;
	inquiry_item_id: string;
	manager_approval_id?: string | null;
	state: InquiryState;
};

export type CloseInquiryResult = {
	inquiry_item_id: string;
	state: InquiryState;
};

export type UploadedFile = {
	id: string;
	filename_download?: string | null;
};

export type ApproveCustomerQuoteDecision = 'Approved' | 'Rejected';

export type ApproveCustomerQuoteResult = {
	approval_status: string;
	customer_quote_id: string;
	inquiry_item_id: string;
	manager_approval_id: string;
	state: InquiryState;
};

export type ApiErrorDetail = Error & {
	status?: number;
	code?: string;
};

const summaryFields = [
	'*',
	'customer_id.id',
	'customer_id.customer_code',
	'customer_id.customer_name',
	'sales_owner_id.id',
	'sales_owner_id.email',
	'sales_owner_id.first_name',
	'sales_owner_id.last_name',
	'buyer_owner_id.id',
	'buyer_owner_id.email',
	'buyer_owner_id.first_name',
	'buyer_owner_id.last_name',
];

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
	'target_price',
	'expected_quote_at',
	'priority',
	'state',
	'remark',
	'tags',
	'assignment_deadline',
	'accepted_at',
	'completed_at',
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

function getInquiryItemsFilter(roleScope: RoleScope, userId: string) {
	if (roleScope === 'Buyer') {
		return { buyer_owner_id: { _eq: userId } };
	}

	if (roleScope === 'Sales') {
		return { sales_owner_id: { _eq: userId } };
	}

	return undefined;
}

function buildInquiryItemFilter(询价项Id: string | string[]) {
	return Array.isArray(询价项Id)
		? { inquiry_item_id: { _in: 询价项Id } }
		: { inquiry_item_id: { _eq: 询价项Id } };
}

function relationId(value?: { id: string } | string | null) {
	if (!value) return undefined;
	if (typeof value === 'string') return value;

	return value.id;
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

export async function listInquiryItems(roleScope: RoleScope, userId: string, signal?: AbortSignal) {
	const response = await http.get<{ data: InquiryItemRow[] }>('/items/inquiry_items', {
		params: {
			fields: listFields,
			filter: getInquiryItemsFilter(roleScope, userId),
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
			fields: ['*', 'supplier_id.id', 'supplier_id.supplier_name', 'supplier_id.supplier_code', 'quoted_by.first_name', 'quoted_by.last_name', 'inquiry_item_id'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-quoted_at'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function createSupplierQuote(payload: SupplierQuotePayload, signal?: AbortSignal) {
	const response = await http.post<{ data: SupplierQuote }>('/items/supplier_quotes', payload, { signal });

	return unwrap(response);
}

export async function updateSupplierQuote(id: string, payload: SupplierQuotePayload, signal?: AbortSignal) {
	const response = await http.patch<{ data: SupplierQuote }>(`/items/supplier_quotes/${id}`, payload, { signal });

	return unwrap(response);
}

export async function deleteSupplierQuote(id: string, signal?: AbortSignal) {
	await http.delete(`/items/supplier_quotes/${id}`, { signal });
}

export async function getCustomerQuotes(询价项Id: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: CustomerQuote[] }>('/items/customer_quotes', {
		params: {
			fields: ['*', 'customer_id.customer_name', 'quoted_by.first_name', 'quoted_by.last_name', 'inquiry_item_id'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-quoted_at'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function createCustomerQuote(payload: CustomerQuotePayload, signal?: AbortSignal) {
	const response = await http.post<{ data: CustomerQuote }>('/items/customer_quotes', payload, { signal });

	return unwrap(response);
}

export async function getManagerApprovals(询价项Id: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: ManagerApproval[] }>('/items/manager_approvals', {
		params: {
			fields: ['*', 'customer_quote_id.*', 'requested_by.first_name', 'requested_by.last_name', 'approved_by.first_name', 'approved_by.last_name'],
			filter: buildInquiryItemFilter(询价项Id),
			sort: ['-created_at'],
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
	const [summary, conversations, supplierQuotes, customerQuotes, managerApprovals] = await Promise.all([
		get询价项Summary(询价项Id, signal),
		getConversations(询价项Id, signal),
		getSupplierQuotes(询价项Id, signal),
		getCustomerQuotes(询价项Id, signal),
		getManagerApprovals(询价项Id, signal).catch(() => []),
	]);

	return { ...summary, conversations, supplier_quotes: supplierQuotes, customer_quotes: customerQuotes, manager_approvals: managerApprovals };
}

export async function markViewedAsAccepted(询价项Id: string, signal?: AbortSignal) {
	const response = await http.post<{ data: MarkViewedAsAcceptedResult }>(
		'/purchase-flow-actions/mark-viewed-as-accepted',
		{ inquiry_item_id: 询价项Id },
		{ signal },
	);

	return unwrap(response);
}

export async function completeSupplierQuote(询价项Id: string, changedFields: string[] = [], signal?: AbortSignal) {
	const response = await http.post<{ data: CompleteSupplierQuoteResult }>(
		'/purchase-flow-actions/complete-supplier-quote',
		{ changed_fields: changedFields, inquiry_item_id: 询价项Id },
		{ signal },
	);

	return unwrap(response);
}

export async function selectFinalQuote(询价项Id: string, supplierQuoteId: string, payload: FinalQuotePayload = {}, signal?: AbortSignal) {
	const response = await http.post<{ data: SelectFinalQuoteResult }>(
		'/purchase-flow-actions/select-final-quote',
		{ ...payload, inquiry_item_id: 询价项Id, supplier_quote_id: supplierQuoteId },
		{ signal },
	);

	return unwrap(response);
}

export async function closeInquiry(询价项Id: string, reason = '', signal?: AbortSignal) {
	const response = await http.post<{ data: CloseInquiryResult }>(
		'/purchase-flow-actions/close-inquiry',
		{ inquiry_item_id: 询价项Id, reason },
		{ signal },
	);

	return unwrap(response);
}

export async function approveCustomerQuote(approvalId: string, decision: ApproveCustomerQuoteDecision, reason = '', signal?: AbortSignal) {
	const response = await http.post<{ data: ApproveCustomerQuoteResult }>(
		'/purchase-flow-actions/approve-customer-quote',
		{ approval_id: approvalId, decision, reason },
		{ signal },
	);

	return unwrap(response);
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
	const supplierQuotesByItem = groupBy(supplierQuotes, (quote) => relationId(quote.inquiry_item_id));
	const customerQuotesByItem = groupBy(customerQuotes, (quote) => quote.inquiry_item_id);

	const tasksWithDetail: TaskWithDetail[] = tasks.map((task) => ({
		...task,
		conversations: conversationsByItem[task.id] || [],
		supplier_quotes: supplierQuotesByItem[task.id] || [],
		customer_quotes: customerQuotesByItem[task.id] || [],
		manager_approvals: [],
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

export async function getUserTaskSummary(userId: string, signal?: AbortSignal) {
	const response = await http.get<{ data: UserTaskSummary[] }>('/items/user_task_summaries', {
		params: {
			fields: ['*'],
			filter: { user_id: { _eq: userId } },
			limit: 1,
		},
		signal,
	});

	return unwrap(response)[0] || null;
}

export async function listCustomers(signal?: AbortSignal) {
	const response = await http.get<{ data: Customer[] }>('/items/customers', { params: { sort: ['customer_name'] }, signal });

	return unwrap(response);
}

export async function getCustomer(id: string, signal?: AbortSignal) {
	const response = await http.get<{ data: Customer }>(`/items/customers/${id}`, { signal });

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

export async function updateCustomerStatus(id: string, status: string, signal?: AbortSignal) {
	const response = await http.patch<{ data: Customer }>(`/items/customers/${id}`, { status }, { signal });

	return unwrap(response);
}

export async function listCustomerContacts(customerId: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: CustomerContact[] }>('/items/customer_contacts', {
		params: {
			fields: ['*', 'customer_id'],
			filter: Array.isArray(customerId) ? { customer_id: { _in: customerId } } : { customer_id: { _eq: customerId } },
			sort: ['name'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function listCustomerInquiryHistory(customerId: string, signal?: AbortSignal) {
	const response = await http.get<{ data: InquiryItemRow[] }>('/items/inquiry_items', {
		params: {
			fields: listFields,
			filter: { customer_id: { _eq: customerId } },
			sort: ['-updated_at'],
			limit: 10,
		},
		signal,
	});

	return unwrap(response);
}

export async function listSuppliers(signal?: AbortSignal) {
	const response = await http.get<{ data: Supplier[] }>('/items/suppliers', {
		params: { fields: ['*', 'buyer_id.first_name', 'buyer_id.last_name', 'buyer_id.email'], sort: ['supplier_name'] },
		signal,
	});

	return unwrap(response);
}

export async function listRoles(signal?: AbortSignal) {
	const response = await http.get<{ data: DirectusRole[] }>('/roles', {
		params: {
			fields: ['id', 'name'],
			filter: { name: { _in: ['外贸员', '采购员', '经理'] } },
			sort: ['name'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function listEmployees(signal?: AbortSignal) {
	const response = await http.get<{ data: Employee[] }>('/users', {
		params: {
			fields: ['id', 'email', 'first_name', 'last_name', 'role.id', 'role.name', 'status', 'wechat_work_userid'],
			sort: ['first_name', 'email'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function getEmployee(id: string, signal?: AbortSignal) {
	const response = await http.get<{ data: Employee }>(`/users/${id}`, {
		params: { fields: ['id', 'email', 'first_name', 'last_name', 'role.id', 'role.name', 'status', 'wechat_work_userid'] },
		signal,
	});

	return unwrap(response);
}

export async function createEmployee(payload: EmployeePayload, signal?: AbortSignal) {
	const response = await http.post<{ data: Employee }>('/users', payload, { signal });

	return unwrap(response);
}

export async function updateEmployee(id: string, payload: EmployeePayload, signal?: AbortSignal) {
	const response = await http.patch<{ data: Employee }>(`/users/${id}`, payload, { signal });

	return unwrap(response);
}

export async function updateEmployeeStatus(id: string, status: string, signal?: AbortSignal) {
	const response = await http.patch<{ data: Employee }>(`/users/${id}`, { status }, { signal });

	return unwrap(response);
}

export async function listBuyerProfiles(signal?: AbortSignal) {
	const response = await http.get<{ data: BuyerProfile[] }>('/items/buyer_profiles', {
		params: {
			fields: ['*', 'buyer_id.id', 'buyer_id.email', 'buyer_id.first_name', 'buyer_id.last_name'],
			sort: ['buyer_id.first_name'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function upsertBuyerProfile(buyerId: string, payload: BuyerProfilePayload, signal?: AbortSignal) {
	const existingResponse = await http.get<{ data: BuyerProfile[] }>('/items/buyer_profiles', {
		params: { fields: ['id'], filter: { buyer_id: { _eq: buyerId } }, limit: 1 },
		signal,
	});

	const existing = unwrap(existingResponse)[0];
	const profilePayload = { ...payload, buyer_id: buyerId };

	if (existing?.id) {
		const response = await http.patch<{ data: BuyerProfile }>(`/items/buyer_profiles/${existing.id}`, profilePayload, { signal });

		return unwrap(response);
	}

	const response = await http.post<{ data: BuyerProfile }>('/items/buyer_profiles', profilePayload, { signal });

	return unwrap(response);
}

export async function listPurchaseTags(signal?: AbortSignal) {
	const response = await http.get<{ data: PurchaseTag[] }>('/items/purchase_tags', {
		params: { fields: ['*'], sort: ['tag_name'], limit: -1 },
		signal,
	});

	return unwrap(response);
}

export async function createPurchaseTag(payload: PurchaseTagPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: PurchaseTag }>('/items/purchase_tags', payload, { signal });

	return unwrap(response);
}

export async function updatePurchaseTag(id: string, payload: PurchaseTagPayload, signal?: AbortSignal) {
	const response = await http.patch<{ data: PurchaseTag }>(`/items/purchase_tags/${id}`, payload, { signal });

	return unwrap(response);
}

export async function deletePurchaseTag(id: string, signal?: AbortSignal) {
	await http.delete(`/items/purchase_tags/${id}`, { signal });
}

export async function getSupplier(id: string, signal?: AbortSignal) {
	const response = await http.get<{ data: Supplier }>(`/items/suppliers/${id}`, { signal });

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

export async function updateSupplierStatus(id: string, status: string, signal?: AbortSignal) {
	const response = await http.patch<{ data: Supplier }>(`/items/suppliers/${id}`, { status }, { signal });

	return unwrap(response);
}

export async function listSupplierContacts(supplierId: string | string[], signal?: AbortSignal) {
	const response = await http.get<{ data: SupplierContact[] }>('/items/supplier_contacts', {
		params: {
			fields: ['*', 'supplier_id'],
			filter: Array.isArray(supplierId) ? { supplier_id: { _in: supplierId } } : { supplier_id: { _eq: supplierId } },
			sort: ['name'],
			limit: -1,
		},
		signal,
	});

	return unwrap(response);
}

export async function listSupplierQuoteHistory(supplierId: string, signal?: AbortSignal) {
	const response = await http.get<{ data: SupplierQuote[] }>('/items/supplier_quotes', {
		params: {
			fields: ['*', 'inquiry_item_id.inquiry_no', 'inquiry_item_id.product_name'],
			filter: { supplier_id: { _eq: supplierId } },
			sort: ['-quoted_at'],
			limit: 10,
		},
		signal,
	});

	return unwrap(response);
}

export async function createInquiryItem(payload: InquiryItemPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: InquiryItem }>('/items/inquiry_items', payload, { signal });

	return unwrap(response);
}

export async function uploadFile(file: File, signal?: AbortSignal) {
	const formData = new FormData();
	formData.append('file', file);

	const response = await http.post<{ data: UploadedFile }>('/files', formData, { signal });

	return unwrap(response);
}

export async function updateInquiryItem(询价项Id: string, payload: InquiryItemPayload, signal?: AbortSignal) {
	const response = await http.post<{ data: UpdateInquiryResult }>(
		'/purchase-flow-actions/update-inquiry',
		{ ...payload, inquiry_item_id: 询价项Id },
		{ signal },
	);

	return unwrap(response);
}

export async function acceptAssignment(token: string, signal?: AbortSignal) {
	try {
		const response = await http.get<{ data: AcceptAssignmentResult }>('/purchase-flow-accept/accept-json', {
			params: { token },
			signal,
		});

		return unwrap(response);
	} catch (error) {
		throw normalizeApiError(error);
	}
}

function normalizeApiError(error: unknown): ApiErrorDetail {
	const source = error as {
		message?: string;
		response?: { status?: number; data?: { errors?: Array<{ extensions?: { code?: string }; message?: string }> } };
	};
	const firstError = source.response?.data?.errors?.[0];
	const normalized = new Error(firstError?.message || source.message || '请求失败') as ApiErrorDetail;
	normalized.status = source.response?.status;
	normalized.code = firstError?.extensions?.code;

	return normalized;
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
	if (payload.state) {
		const response = await http.post<{ data: { inquiry_item_id: string; previous_state: InquiryState; state: InquiryState } }>(
			'/purchase-flow-actions/communicate-and-transition',
			{
				content: payload.content,
				inquiry_item_id: payload.inquiry_item_id,
				next_state: payload.state,
			},
			{ signal },
		);

		return unwrap(response);
	}

	const response = await http.post<{ data: { inquiry_item_id: string } }>(
		'/purchase-flow-actions/communicate',
		{
			content: payload.content,
			inquiry_item_id: payload.inquiry_item_id,
		},
		{ signal },
	);

	return unwrap(response);
}
