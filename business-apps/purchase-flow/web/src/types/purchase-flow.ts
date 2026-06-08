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

export type Supplier = {
	id: string;
	supplier_code?: string;
	supplier_name?: string;
	supplier_type?: string;
	country?: string;
	tax_rate?: number | string;
	payment_term?: string;
	website?: string;
	status?: string;
	remark?: string;
};

export type SupplierQuote = {
	id?: string;
	inquiry_item_id?: string;
	supplier_id?: Supplier | string | null;
	quoted_by?: DirectusUser | string | null;
	price?: number | string | null;
	currency?: string | null;
	moq?: number | string | null;
	lead_time?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
};

export type CustomerQuote = {
	id?: string;
	inquiry_item_id?: string;
	customer_id?: Customer | string | null;
	quoted_by?: DirectusUser | string | null;
	price?: number | string | null;
	currency?: string | null;
	quoted_at?: string | null;
	remark?: string | null;
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
	priority?: string;
	state: InquiryState;
	assignment_deadline?: string | null;
	accepted_at?: string | null;
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
