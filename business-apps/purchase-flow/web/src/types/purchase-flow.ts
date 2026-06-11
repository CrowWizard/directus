import type { DirectusUser } from '../api/auth';
import type { RoleScope } from '../stores/auth';

export type InquiryState = 'Draft' | 'Assigned' | 'Purchasing' | 'WaitingSalesReview' | 'Quoted' | 'Closed';

export type Customer = {
	id: string;
	customer_code?: string;
	customer_name?: string;
	country?: string;
	address?: string;
	website?: string;
	status?: string;
	remark?: string;
};

export type CustomerContact = {
	id: string;
	customer_id?: Customer | string | null;
	name?: string | null;
	position?: string | null;
	phone?: string | null;
	email?: string | null;
	wechat?: string | null;
	remark?: string | null;
};

export type Supplier = {
	id: string;
	supplier_code?: string;
	supplier_name?: string;
	supplier_type?: string;
	buyer_id?: DirectusUser | string | null;
	country?: string;
	tax_rate?: number | string;
	payment_term?: string;
	website?: string;
	status?: string;
	remark?: string;
};

export type SupplierContact = {
	id: string;
	supplier_id?: Supplier | string | null;
	name?: string | null;
	position?: string | null;
	phone?: string | null;
	email?: string | null;
	wechat?: string | null;
	remark?: string | null;
};

export type SupplierQuote = {
	id?: string;
	inquiry_item_id?: InquiryItem | string;
	supplier_id?: Supplier | string | null;
	quoted_by?: DirectusUser | string | null;
	price?: number | string | null;
	inquiry_price?: number | string | null;
	currency?: string | null;
	lead_time?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
	attachment_ids?: unknown;
	is_recommended?: boolean | null;
};

export type CustomerQuote = {
	id?: string;
	inquiry_item_id?: string;
	customer_id?: Customer | string | null;
	quoted_by?: DirectusUser | string | null;
	price?: number | string | null;
	currency?: string | null;
	lead_time?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
	attachment_ids?: unknown;
	approval_status?: string | null;
};

export type ManagerApproval = {
	id?: string;
	inquiry_item_id?: string;
	customer_quote_id?: CustomerQuote | string | null;
	requested_by?: DirectusUser | string | null;
	approved_by?: DirectusUser | string | null;
	status?: string | null;
	reason?: string | null;
	created_at?: string | null;
	approved_at?: string | null;
};

export type Conversation = {
	id?: string;
	inquiry_item_id?: string;
	actor_id?: DirectusUser | string | null;
	content: string;
	metadata?: Record<string, unknown> | null;
	created_at?: string | null;
};

export type InquiryItem = {
	id: string;
	inquiry_no?: string;
	product_name?: string;
	project_name?: string;
	brand?: string;
	model?: string;
	specification?: string;
	quantity?: number | null;
	unit?: string;
	target_price?: number | string | null;
	priority?: string;
	state: InquiryState;
	remark?: string | null;
	attachment_ids?: unknown;
	tags?: string | null;
	assignment_deadline?: string | null;
	accepted_at?: string | null;
	completed_at?: string | null;
	updated_at?: string | null;
	customer_id?: Customer | string | null;
	sales_owner_id?: DirectusUser | string | null;
	buyer_owner_id?: DirectusUser | string | null;
	supplier_quotes?: SupplierQuote[];
	customer_quotes?: CustomerQuote[];
};

export type InquiryItemRow = InquiryItem & {
	customer_id?: { customer_name?: string } | string | null;
	sales_owner_id?: { first_name?: string | null; last_name?: string | null } | string | null;
	buyer_owner_id?: { first_name?: string | null; last_name?: string | null } | string | null;
};

export type InquiryItemDetail = InquiryItem & {
	conversations: Conversation[];
	supplier_quotes: SupplierQuote[];
	customer_quotes: CustomerQuote[];
	manager_approvals?: ManagerApproval[];
};

export type UserTaskSummaryDetail = {
	id?: string;
	inquiry_item_id?: string;
	inquiry_no?: string;
	product_name?: string;
	state?: string;
	status?: string;
	priority?: string;
	deadline?: string | null;
	assignment_deadline?: string | null;
	customer?: string;
	customer_name?: string;
	owner?: string;
	owner_name?: string;
	buyer?: string;
	buyer_name?: string;
	sales?: string;
	sales_name?: string;
	updated_at?: string | null;
	completed_at?: string | null;
	[key: string]: unknown;
};

export type UserTaskSummary = {
	id: string;
	user_id?: DirectusUser | string | null;
	role_scope?: RoleScope | string | null;
	active_task_count?: number | null;
	total_completed_task_count?: number | null;
	weekly_completed_task_count?: number | null;
	active_task_details?: UserTaskSummaryDetail[] | Record<string, unknown> | string | null;
	weekly_completed_task_details?: UserTaskSummaryDetail[] | Record<string, unknown> | string | null;
};

export type InquiryItemPayload = {
	customer_id?: string | null;
	project_name?: string;
	product_name?: string;
	brand?: string;
	model?: string;
	specification?: string;
	quantity?: number | null;
	unit?: string;
	target_price?: number | string | null;
	priority?: string;
	sales_owner_id?: string;
	buyer_owner_id?: string | null;
	remark?: string;
	tags?: string;
};

export type CustomerPayload = Omit<Partial<Customer>, 'id'>;
export type SupplierPayload = Omit<Partial<Supplier>, 'id'>;

export type SupplierQuotePayload = {
	inquiry_item_id: string;
	supplier_id?: string | null;
	price?: number | string | null;
	inquiry_price?: number | string | null;
	currency?: string | null;
	lead_time?: string | null;
	quoted_by?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
	attachment_ids?: unknown;
	is_recommended?: boolean | null;
};

export type CustomerQuotePayload = {
	inquiry_item_id: string;
	customer_id?: string | null;
	price?: number | string | null;
	currency?: string | null;
	lead_time?: string | null;
	quoted_by?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
	approval_status?: string | null;
};

export type FinalQuotePayload = {
	price?: number | string | null;
	currency?: string | null;
	lead_time?: string | null;
	remark?: string | null;
	approval_reason?: string | null;
};

export type ConversationPayload = {
	inquiry_item_id: string;
	actor_id: string;
	content: string;
	metadata?: Record<string, unknown>;
};

export type CommentAndStatePayload = ConversationPayload & {
	state?: InquiryState | null;
};

export type { RoleScope };
