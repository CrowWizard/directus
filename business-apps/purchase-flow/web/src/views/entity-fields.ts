import type { EntityFormField } from '../components/entity-form-card.vue';

export const customerFields: EntityFormField[] = [
	{ key: 'customer_code', label: '客户编码', autocomplete: 'off' },
	{ key: 'customer_name', label: '客户名称', autocomplete: 'organization' },
	{ key: 'country', label: '国家', autocomplete: 'country-name' },
	{ key: 'address', label: '地址', autocomplete: 'street-address' },
	{ key: 'website', label: '网站', type: 'url', autocomplete: 'url' },
	{ key: 'status', label: '状态', autocomplete: 'off' },
	{ key: 'remark', label: '备注', autocomplete: 'off' },
];

export const supplierFields: EntityFormField[] = [
	{ key: 'supplier_code', label: '供应商编码', autocomplete: 'off' },
	{ key: 'supplier_name', label: '供应商名称', autocomplete: 'organization' },
	{ key: 'supplier_type', label: '类型', autocomplete: 'off' },
	{ key: 'country', label: '国家', autocomplete: 'country-name' },
	{ key: 'tax_rate', label: '税率', type: 'number', autocomplete: 'off', inputmode: 'decimal' },
	{ key: 'payment_term', label: '付款条件', autocomplete: 'off' },
	{ key: 'website', label: '网站', type: 'url', autocomplete: 'url' },
	{ key: 'status', label: '状态', autocomplete: 'off' },
	{ key: 'remark', label: '备注', autocomplete: 'off' },
];
