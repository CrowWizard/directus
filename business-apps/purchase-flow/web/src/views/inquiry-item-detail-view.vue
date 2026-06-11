<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
	approveCustomerQuote,
	commentAndUpdateState,
	closeInquiry,
	completeSupplierQuote,
	createSupplierQuote,
	deleteSupplierQuote,
	get询价项Detail,
	listSuppliers,
	markViewedAsAccepted,
	selectFinalQuote,
	updateInquiryItem,
	updateSupplierQuote,
} from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import ConversationPanel from '../components/conversation-panel.vue';
import InquiryItemKeyInfo from '../components/inquiry-item-key-info.vue';
import { mapRoleScope, useAuthStore } from '../stores/auth';
import type { Customer, CustomerQuote, InquiryItemDetail, InquiryState, Supplier, SupplierQuote } from '../types/purchase-flow';

const route = useRoute();
const auth = useAuthStore();
const item = ref<InquiryItemDetail | null>(null);
const loading = ref(true);
const submitting = ref(false);
const quoteSubmitting = ref(false);
const error = ref('');
const quoteError = ref('');
const quoteSuccess = ref('');
const customerQuoteError = ref('');
const customerQuoteSuccess = ref('');
const approvalError = ref('');
const approvalSuccess = ref('');
const approvalReason = ref('');
const quoteErrorField = ref('');
const inquiryEditError = ref('');
const inquiryEditSuccess = ref('');
const selectedQuoteKey = ref('');
const suppliers = ref<Supplier[]>([]);
const showQuoteForm = ref(false);
const showInquiryEditForm = ref(false);
const editingQuoteId = ref<string | null>(null);
const pendingSupplierQuoteDeleteKey = ref<string | null>(null);
const lastSupplierQuoteChangedFields = ref<string[]>([]);

const customerQuoteSubmitting = ref(false);
const completeQuoteSubmitting = ref(false);
const inquiryEditSubmitting = ref(false);
const closeInquirySubmitting = ref(false);
const approvalSubmitting = ref(false);

const inquiryEditForm = reactive({
	customer_id: '',
	project_name: '',
	product_name: '',
	brand: '',
	model: '',
	specification: '',
	quantity: '',
	unit: '',
	target_price: '',
	priority: 'Normal',
	remark: '',
	tags: '',
});

const quoteForm = reactive({
	supplier_id: '',
	price: '',
	currency: 'CNY',
	lead_time: '',
	quoted_at: '',
	remark: '',
	attachment_url: '',
	is_recommended: false,
});

const finalQuoteForm = reactive({
	price: '',
	currency: 'CNY',
	lead_time: '',
	remark: '',
});

const closeReason = ref('');

const requestController = new AbortController();
let activeRequest = 0;
const autoAcceptedItemIds = new Set<string>();

const quoteKeys = computed(() => item.value?.supplier_quotes.map(getQuoteKey) || []);

const selectedQuote = computed(() => {
	if (!item.value) return null;

	return item.value.supplier_quotes.find((quote) => getQuoteKey(quote) === selectedQuoteKey.value) || null;
});

const recommendedQuotes = computed(() => {
	if (!item.value) return [];

	return item.value.supplier_quotes.filter((quote) => quote.is_recommended || isRecommendedQuote(item.value!, quote));
});

const latestCustomerQuote = computed(() => item.value?.customer_quotes[0] || null);
const managerApprovals = computed(() => item.value?.manager_approvals || []);
const pendingApproval = computed(() => managerApprovals.value.find((approval) => approval.status === 'Pending') || null);
const currentRoleScope = computed(() => {
	const role = auth.currentUser?.role;
	const roleName = typeof role === 'string' ? role : role?.name || '';

	return mapRoleScope(roleName);
});
const canViewApprovalStatus = computed(() => currentRoleScope.value === 'Manager');
const isInquiryLocked = computed(() => Boolean(item.value && ['Quoted', 'Closed'].includes(item.value.state)));
const canViewFinalQuote = computed(() => Boolean(item.value && (currentRoleScope.value === 'Manager' || (currentRoleScope.value === 'Sales' && userId(item.value.sales_owner_id) === auth.currentUser?.id))));
const canSubmitFinalQuote = computed(() => Boolean(item.value && !isInquiryLocked.value && currentRoleScope.value === 'Sales' && userId(item.value.sales_owner_id) === auth.currentUser?.id));
const canAddSupplierQuote = computed(() => Boolean(item.value && !isInquiryLocked.value && currentRoleScope.value === 'Buyer' && userId(item.value.buyer_owner_id) === auth.currentUser?.id));
const canCompleteSupplierQuote = computed(() => Boolean(item.value && !isInquiryLocked.value && currentRoleScope.value === 'Buyer' && item.value.state === 'Purchasing' && userId(item.value.buyer_owner_id) === auth.currentUser?.id));
const canEditInquiry = computed(() => Boolean(item.value && currentRoleScope.value === 'Sales' && userId(item.value.sales_owner_id) === auth.currentUser?.id && !['Quoted', 'Closed'].includes(item.value.state)));
const canCloseInquiry = computed(() => Boolean(item.value && ['Manager', 'Sales'].includes(currentRoleScope.value) && item.value.state !== 'Closed'));

function getQuoteKey(quote: SupplierQuote) {
	return quote.id || `${quote.supplier_id || 'supplier'}-${quote.price || 'price'}-${quote.quoted_at || 'time'}`;
}

function supplierName(supplier: SupplierQuote['supplier_id']) {
	if (!supplier) return '-';
	if (typeof supplier === 'string') return supplier;

	return (supplier as Supplier).supplier_name || (supplier as Supplier).supplier_code || '-';
}

function customerName(customer: CustomerQuote['customer_id'] | InquiryItemDetail['customer_id']) {
	if (!customer) return '-';
	if (typeof customer === 'string') return customer;

	return (customer as Customer).customer_name || (customer as Customer).customer_code || '-';
}

function relationId(value?: { id: string } | string | null) {
	if (!value) return '';
	if (typeof value === 'string') return value;

	return value.id;
}

function actorName(user: SupplierQuote['quoted_by']) {
	if (!user) return '-';
	if (typeof user === 'string') return user;

	return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || user.id;
}

function userId(user: SupplierQuote['quoted_by']) {
	if (!user) return '';
	if (typeof user === 'string') return user;

	return user.id;
}

function canManageQuote(quote: SupplierQuote) {
	if (isInquiryLocked.value || !item.value || !quote.id || !auth.currentUser?.id) return false;

	const isQuoteCreator = userId(quote.quoted_by) === auth.currentUser.id;
	const isAssignedBuyer = currentRoleScope.value === 'Buyer' && item.value.state === 'Purchasing' && userId(item.value.buyer_owner_id) === auth.currentUser.id;

	return isQuoteCreator || isAssignedBuyer;
}

function isCurrentBuyerAssignedTask(currentItem: InquiryItemDetail) {
	return (
		currentRoleScope.value === 'Buyer' &&
		currentItem.state === 'Assigned' &&
		!currentItem.accepted_at &&
		Boolean(auth.currentUser?.id) &&
		userId(currentItem.buyer_owner_id) === auth.currentUser?.id
	);
}

function getQuoteText(quote: SupplierQuote) {
	return `${quote.price || '-'} ${quote.currency || ''}`.trim();
}

function fillInquiryEditForm(currentItem: InquiryItemDetail) {
	inquiryEditForm.customer_id = relationId(currentItem.customer_id);
	inquiryEditForm.project_name = currentItem.project_name || '';
	inquiryEditForm.product_name = currentItem.product_name || '';
	inquiryEditForm.brand = currentItem.brand || '';
	inquiryEditForm.model = currentItem.model || '';
	inquiryEditForm.specification = currentItem.specification || '';
	inquiryEditForm.quantity = currentItem.quantity === null || currentItem.quantity === undefined ? '' : String(currentItem.quantity);
	inquiryEditForm.unit = currentItem.unit || '';
	inquiryEditForm.target_price = currentItem.target_price === null || currentItem.target_price === undefined ? '' : String(currentItem.target_price);
	inquiryEditForm.priority = currentItem.priority || 'Normal';
	inquiryEditForm.remark = currentItem.remark || '';
	inquiryEditForm.tags = currentItem.tags || '';
}

function toggleInquiryEditForm() {
	if (!item.value) return;
	fillInquiryEditForm(item.value);
	inquiryEditError.value = '';
	inquiryEditSuccess.value = '';
	showInquiryEditForm.value = !showInquiryEditForm.value;
}

function normalizeText(value?: string | null) {
	return String(value || '')
		.trim()
		.toLowerCase();
}

function isRecommendedQuote(currentItem: InquiryItemDetail, quote: SupplierQuote) {
	const currentBrand = normalizeText(currentItem.brand);
	const currentModel = normalizeText(currentItem.model);
	const currentSpecification = normalizeText(currentItem.specification);
	const quoteRemark = normalizeText(quote.remark);

	const hasBrandMatch = currentBrand && quoteRemark.includes(currentBrand);
	const hasModelMatch = currentModel && quoteRemark.includes(currentModel);
	const hasSpecificationMatch = currentSpecification && quoteRemark.includes(currentSpecification);

	return Boolean(hasBrandMatch && (hasModelMatch || hasSpecificationMatch));
}

function trackRequest(): AbortSignal {
	activeRequest += 1;
	return requestController.signal;
}

async function load(signal?: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		const detail = await get询价项Detail(String(route.params.id), signal);
		item.value = detail;

		if (isCurrentBuyerAssignedTask(detail)) {
			await markCurrentTaskViewedAsAccepted(detail, signal);
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '询价项详情加载失败';
	} finally {
		loading.value = false;
	}
}

async function markCurrentTaskViewedAsAccepted(currentItem: InquiryItemDetail, signal?: AbortSignal) {
	if (autoAcceptedItemIds.has(currentItem.id)) return;

	autoAcceptedItemIds.add(currentItem.id);

	try {
		const result = await markViewedAsAccepted(currentItem.id, signal);

		if (result.accepted) {
			item.value = await get询价项Detail(currentItem.id, signal);
		}
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '自动开始处理失败';
		autoAcceptedItemIds.delete(currentItem.id);
	}
}

async function loadSuppliers(signal?: AbortSignal) {
	try {
		suppliers.value = await listSuppliers(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	}
}

async function submitConversation(payload: { content: string; state: InquiryState | null }) {
	if (isInquiryLocked.value) {
		error.value = '询价项已完成或已结束，不能再提交沟通。';
		return;
	}

	if (!auth.currentUser?.id) {
		error.value = '无法识别当前用户，请重新登录。';
		return;
	}

	submitting.value = true;

	try {
		await commentAndUpdateState(
			{
				actor_id: auth.currentUser.id,
				content: payload.content,
				inquiry_item_id: String(route.params.id),
				state: payload.state,
			},
			requestController.signal,
		);

		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '提交沟通失败';
	} finally {
		submitting.value = false;
	}
}

function resetQuoteForm() {
	editingQuoteId.value = null;
	quoteErrorField.value = '';
	quoteForm.supplier_id = '';
	quoteForm.price = '';
	quoteForm.currency = 'CNY';
	quoteForm.lead_time = '';
	quoteForm.quoted_at = '';
	quoteForm.remark = '';
	quoteForm.attachment_url = '';
	quoteForm.is_recommended = false;
}

function editSupplierQuote(quote: SupplierQuote) {
	if (!quote.id || !canManageQuote(quote)) return;

	editingQuoteId.value = quote.id;
	pendingSupplierQuoteDeleteKey.value = null;
	quoteError.value = '';
	quoteSuccess.value = '';
	quoteErrorField.value = '';
	quoteForm.supplier_id = typeof quote.supplier_id === 'string' ? quote.supplier_id : quote.supplier_id?.id || '';
	quoteForm.price = quote.price === null || quote.price === undefined ? '' : String(quote.price);
	quoteForm.currency = quote.currency || 'CNY';
	quoteForm.lead_time = quote.lead_time || '';
	quoteForm.quoted_at = quote.quoted_at ? quote.quoted_at.slice(0, 10) : '';
	quoteForm.remark = quote.remark || '';
	quoteForm.attachment_url = getFirstAttachment(quote.attachment_ids);
	quoteForm.is_recommended = Boolean(quote.is_recommended);
	showQuoteForm.value = true;
}

function getSupplierQuoteChangedFields(quote: SupplierQuote | undefined) {
	if (!quote) return [];

	const checks: Array<[string, unknown, unknown]> = [
		['供应商', relationId(quote.supplier_id), quoteForm.supplier_id],
		['采购价格', quote.price, quoteForm.price],
		['币种', quote.currency || 'CNY', quoteForm.currency],
		['货期', quote.lead_time, quoteForm.lead_time],
		['报价时间', quote.quoted_at ? quote.quoted_at.slice(0, 10) : '', quoteForm.quoted_at],
		['备注', quote.remark, quoteForm.remark],
		['推荐报价', Boolean(quote.is_recommended), quoteForm.is_recommended],
	];

	return checks
		.filter(([, before, after]) => normalizeChangedValue(before) !== normalizeChangedValue(after))
		.map(([label, before, after]) => `${label}：${formatChangedValue(before)} -> ${formatChangedValue(after)}`);
}

function normalizeChangedValue(value: unknown) {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(',');

	return String(value).trim();
}

function formatChangedValue(value: unknown) {
	const normalizedValue = normalizeChangedValue(value);

	return normalizedValue || '空';
}

function getFirstAttachment(value: unknown) {
	if (!value) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return String(value[0] || '');

	return '';
}

function getAttachments(value: unknown) {
	if (!value) return [];
	if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
	if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);

	return [];
}

function isPositiveNumber(value: string) {
	const numericValue = Number(value);

	return Number.isFinite(numericValue) && numericValue > 0;
}

function isCurrencyCode(value: string) {
	return /^[A-Z]{3}$/.test(value.trim());
}

async function submitSupplierQuote() {
	quoteError.value = '';
	quoteSuccess.value = '';
	quoteErrorField.value = '';

	if (!auth.currentUser?.id) {
		quoteError.value = '无法识别当前用户，请重新登录。';
		return;
	}

	if (isInquiryLocked.value) {
		quoteError.value = '最终报价完成后不能再修改供应商报价。';
		return;
	}

	if (!quoteForm.supplier_id) {
		quoteError.value = '请选择供应商。';
		quoteErrorField.value = 'supplier-quote-supplier';
		return;
	}

	if (!isPositiveNumber(quoteForm.price)) {
		quoteError.value = '请填写大于 0 的采购价格。';
		quoteErrorField.value = 'supplier-quote-price';
		return;
	}

	if (!isCurrencyCode(quoteForm.currency)) {
		quoteError.value = '币种必须为 3 位大写字母，例如 CNY、USD。';
		quoteErrorField.value = 'supplier-quote-currency';
		return;
	}

	if (!quoteForm.lead_time) {
		quoteError.value = '请填写交期。';
		quoteErrorField.value = 'supplier-quote-lead-time';
		return;
	}

	if (!quoteForm.quoted_at) {
		quoteError.value = '请选择报价时间。';
		quoteErrorField.value = 'supplier-quote-quoted-at';
		return;
	}

	quoteSubmitting.value = true;

	try {
		const isEditing = Boolean(editingQuoteId.value);
		const editingQuote = item.value?.supplier_quotes.find((quote) => quote.id === editingQuoteId.value);
		const changedFields = isEditing ? getSupplierQuoteChangedFields(editingQuote) : ['新增报价'];
		const payload = {
			attachment_ids: quoteForm.attachment_url ? [quoteForm.attachment_url] : null,
			currency: quoteForm.currency || null,
			inquiry_item_id: String(route.params.id),
			inquiry_price: quoteForm.price,
			is_recommended: quoteForm.is_recommended,
			lead_time: quoteForm.lead_time || null,
			price: quoteForm.price,
			quoted_by: auth.currentUser.id,
			quoted_at: quoteForm.quoted_at || null,
			remark: quoteForm.remark || null,
			supplier_id: quoteForm.supplier_id || null,
		};

		if (editingQuoteId.value) {
			await updateSupplierQuote(editingQuoteId.value, payload, requestController.signal);
		} else {
			await createSupplierQuote(payload, requestController.signal);
		}

		resetQuoteForm();
		showQuoteForm.value = false;
		await load(requestController.signal);
		lastSupplierQuoteChangedFields.value = changedFields;
		quoteSuccess.value = isEditing ? `询价已更新，修改项：${changedFields.join('、') || '无变化'}。如已确认报价完整，请点击完成报价通知外贸。` : '询价已保存。如已确认报价完整，请点击完成报价通知外贸。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		quoteError.value = err instanceof Error ? err.message : '询价保存失败';
	} finally {
		quoteSubmitting.value = false;
	}
}

async function submitFinalQuote() {
	customerQuoteError.value = '';
	customerQuoteSuccess.value = '';

	if (!auth.currentUser?.id) {
		customerQuoteError.value = '无法识别当前用户，请重新登录。';
		return;
	}

	if (!item.value) return;

	if (isInquiryLocked.value) {
		customerQuoteError.value = '询价项已完成或已结束，不能再提交最终报价。';
		return;
	}

	if (!selectedQuote.value?.id) {
		customerQuoteError.value = '请选择一条询价内容作为最终报价。';
		return;
	}

	if (!isPositiveNumber(finalQuoteForm.price)) {
		customerQuoteError.value = '请填写大于 0 的最终报价。';
		return;
	}

	if (!isCurrencyCode(finalQuoteForm.currency)) {
		customerQuoteError.value = '币种必须为 3 位大写字母，例如 CNY、USD。';
		return;
	}

	if (!finalQuoteForm.lead_time.trim()) {
		customerQuoteError.value = '请填写最终报价货期。';
		return;
	}

	customerQuoteSubmitting.value = true;

	try {
		const result = await selectFinalQuote(
			item.value.id,
			selectedQuote.value.id,
			{
				currency: finalQuoteForm.currency,
				lead_time: finalQuoteForm.lead_time.trim(),
				price: finalQuoteForm.price,
				remark: finalQuoteForm.remark.trim() || null,
			},
			requestController.signal,
		);
		await load(requestController.signal);
		customerQuoteSuccess.value = result.approval_required ? '最终报价已提交经理审批。' : '最终报价已形成，询价已完成。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		customerQuoteError.value = err instanceof Error ? err.message : '最终报价保存失败';
	} finally {
		customerQuoteSubmitting.value = false;
	}
}

async function saveInquiryEdit() {
	if (!item.value || inquiryEditSubmitting.value) return;

	inquiryEditError.value = '';
	inquiryEditSuccess.value = '';

	if (!inquiryEditForm.product_name.trim()) {
		inquiryEditError.value = '产品名称不能为空。';
		return;
	}

	inquiryEditSubmitting.value = true;

	try {
		await updateInquiryItem(
			item.value.id,
			{
				brand: inquiryEditForm.brand.trim(),
				customer_id: inquiryEditForm.customer_id || null,
				model: inquiryEditForm.model.trim(),
				priority: inquiryEditForm.priority,
				product_name: inquiryEditForm.product_name.trim(),
				project_name: inquiryEditForm.project_name.trim(),
				quantity: inquiryEditForm.quantity ? Number(inquiryEditForm.quantity) : null,
				remark: inquiryEditForm.remark.trim(),
				specification: inquiryEditForm.specification.trim(),
				tags: inquiryEditForm.tags.trim(),
				target_price: inquiryEditForm.target_price ? Number(inquiryEditForm.target_price) : null,
				unit: inquiryEditForm.unit.trim(),
			},
			requestController.signal,
		);

		showInquiryEditForm.value = false;
		await load(requestController.signal);
		inquiryEditSuccess.value = '询价项已更新，并通知采购查看最新需求。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		inquiryEditError.value = err instanceof Error ? err.message : '询价项保存失败';
	} finally {
		inquiryEditSubmitting.value = false;
	}
}

async function completeCurrentSupplierQuote() {
	if (!item.value || completeQuoteSubmitting.value) return;

	if (item.value.supplier_quotes.length === 0) {
		quoteError.value = '请先添加至少一条供应商报价，再完成报价。';
		return;
	}

	completeQuoteSubmitting.value = true;
	quoteError.value = '';
	quoteSuccess.value = '';

	try {
		await completeSupplierQuote(item.value.id, lastSupplierQuoteChangedFields.value, requestController.signal);
		await load(requestController.signal);
		quoteSuccess.value = '已完成报价，并通知外贸确认最终报价。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		quoteError.value = err instanceof Error ? err.message : '完成报价失败';
	} finally {
		completeQuoteSubmitting.value = false;
	}
}

async function removeSupplierQuote(quote: SupplierQuote) {
	if (!quote.id || !canManageQuote(quote) || quoteSubmitting.value) return;

	const quoteKey = getQuoteKey(quote);

	if (pendingSupplierQuoteDeleteKey.value !== quoteKey) {
		pendingSupplierQuoteDeleteKey.value = quoteKey;
		quoteError.value = '';
		quoteSuccess.value = '再次点击确认删除该供应商报价。';
		return;
	}

	quoteSubmitting.value = true;
	quoteError.value = '';
	quoteSuccess.value = '';

	try {
		await deleteSupplierQuote(quote.id, requestController.signal);
		await load(requestController.signal);
		quoteSuccess.value = '询价已删除。';
		pendingSupplierQuoteDeleteKey.value = null;
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		quoteError.value = err instanceof Error ? err.message : '询价删除失败';
	} finally {
		quoteSubmitting.value = false;
	}
}

async function closeCurrentInquiry() {
	if (!item.value || closeInquirySubmitting.value) return;

	closeInquirySubmitting.value = true;
	error.value = '';

	try {
		await closeInquiry(item.value.id, closeReason.value, requestController.signal);
		closeReason.value = '';
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '结束询价失败';
	} finally {
		closeInquirySubmitting.value = false;
	}
}

async function submitApproval(decision: 'Approved' | 'Rejected') {
	if (!pendingApproval.value?.id || approvalSubmitting.value) return;

	approvalSubmitting.value = true;
	approvalError.value = '';
	approvalSuccess.value = '';

	try {
		const result = await approveCustomerQuote(pendingApproval.value.id, decision, approvalReason.value.trim(), requestController.signal);
		approvalReason.value = '';
		await load(requestController.signal);
		approvalSuccess.value = result.state === 'Quoted' ? '审批已通过，询价已完成。' : '审批已拒绝，已退回外贸修改最终报价。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		approvalError.value = err instanceof Error ? err.message : '审批提交失败';
	} finally {
		approvalSubmitting.value = false;
	}
}

watch(
	quoteKeys,
	(keys) => {
		if (selectedQuoteKey.value && !keys.includes(selectedQuoteKey.value)) selectedQuoteKey.value = '';
	},
	{ immediate: true },
);

watch(
	selectedQuote,
	(quote) => {
		finalQuoteForm.price = quote?.price === null || quote?.price === undefined ? '' : String(quote.price);
		finalQuoteForm.currency = quote?.currency || 'CNY';
		finalQuoteForm.lead_time = quote?.lead_time || '';
		finalQuoteForm.remark = quote?.remark || '';
	},
	{ immediate: true },
);

onMounted(() => {
	const signal = trackRequest();
	load(signal);
	loadSuppliers(signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Detail</p>
				<h2>询价项完整详情</h2>
			</div>
			<RouterLink class="text-link" to="/inquiry-items">返回列表</RouterLink>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载详情...</p>
		<p v-else-if="!item && error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else-if="item" class="detail-grid">
			<p v-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
			<InquiryItemKeyInfo :item="item" />
			<section class="info-card">
				<div class="card-header-row">
					<div>
						<h3>基础信息区</h3>
						<p class="muted">最终报价完成前，发起外贸员可以修改询价项需求。</p>
					</div>
					<button v-if="canEditInquiry" type="button" class="ghost-button" :disabled="inquiryEditSubmitting" @click="toggleInquiryEditForm">
						{{ showInquiryEditForm ? '收起编辑' : '编辑询价项' }}
					</button>
				</div>
				<p v-if="inquiryEditError" class="form-message error" role="status" aria-live="polite">{{ inquiryEditError }}</p>
				<p v-if="inquiryEditSuccess" class="form-message success" role="status" aria-live="polite">{{ inquiryEditSuccess }}</p>
				<dl class="meta-grid">
					<div><dt>客户</dt><dd>{{ customerName(item.customer_id) }}</dd></div>
					<div><dt>项目</dt><dd>{{ item.project_name || '-' }}</dd></div>
					<div><dt>型号</dt><dd>{{ item.model || '-' }}</dd></div>
					<div><dt>规格</dt><dd>{{ item.specification || '-' }}</dd></div>
					<div><dt>数量</dt><dd>{{ item.quantity || '-' }} {{ item.unit || '' }}</dd></div>
					<div><dt>目标价格</dt><dd>{{ item.target_price || '-' }}</dd></div>
					<div><dt>接单时间</dt><dd>{{ item.accepted_at || '-' }}</dd></div>
					<div><dt>完成时间</dt><dd>{{ item.completed_at || '-' }}</dd></div>
				</dl>
				<p v-if="item.remark" class="note-block">{{ item.remark }}</p>
				<form v-if="showInquiryEditForm" class="quote-form" data-test="inquiry-edit-form" :aria-busy="inquiryEditSubmitting ? 'true' : undefined" @submit.prevent="saveInquiryEdit">
					<div class="form-row">
						<label for="inquiry-edit-product">产品名称 *<input id="inquiry-edit-product" v-model="inquiryEditForm.product_name" name="product_name" required :disabled="inquiryEditSubmitting" /></label>
						<label for="inquiry-edit-priority">优先级<select id="inquiry-edit-priority" v-model="inquiryEditForm.priority" name="priority" :disabled="inquiryEditSubmitting"><option value="Low">低</option><option value="Normal">普通</option><option value="High">高</option><option value="Urgent">紧急</option></select></label>
					</div>
					<div class="form-row">
						<label for="inquiry-edit-project">项目<input id="inquiry-edit-project" v-model="inquiryEditForm.project_name" name="project_name" :disabled="inquiryEditSubmitting" /></label>
						<label for="inquiry-edit-customer">客户 ID<input id="inquiry-edit-customer" v-model="inquiryEditForm.customer_id" name="customer_id" :disabled="inquiryEditSubmitting" /></label>
					</div>
					<div class="form-row">
						<label for="inquiry-edit-brand">品牌<input id="inquiry-edit-brand" v-model="inquiryEditForm.brand" name="brand" :disabled="inquiryEditSubmitting" /></label>
						<label for="inquiry-edit-model">型号<input id="inquiry-edit-model" v-model="inquiryEditForm.model" name="model" :disabled="inquiryEditSubmitting" /></label>
					</div>
					<label for="inquiry-edit-specification">规格<textarea id="inquiry-edit-specification" v-model="inquiryEditForm.specification" name="specification" rows="2" :disabled="inquiryEditSubmitting" /></label>
					<div class="form-row">
						<label for="inquiry-edit-quantity">数量<input id="inquiry-edit-quantity" v-model="inquiryEditForm.quantity" name="quantity" type="number" min="0" :disabled="inquiryEditSubmitting" /></label>
						<label for="inquiry-edit-unit">单位<input id="inquiry-edit-unit" v-model="inquiryEditForm.unit" name="unit" :disabled="inquiryEditSubmitting" /></label>
					</div>
					<div class="form-row">
						<label for="inquiry-edit-target-price">目标价格<input id="inquiry-edit-target-price" v-model="inquiryEditForm.target_price" name="target_price" type="number" min="0" step="0.01" :disabled="inquiryEditSubmitting" /></label>
						<label for="inquiry-edit-tags">标签<input id="inquiry-edit-tags" v-model="inquiryEditForm.tags" name="tags" :disabled="inquiryEditSubmitting" /></label>
					</div>
					<label for="inquiry-edit-remark">备注<textarea id="inquiry-edit-remark" v-model="inquiryEditForm.remark" name="remark" rows="3" :disabled="inquiryEditSubmitting" /></label>
					<div class="form-actions">
						<button type="submit" :disabled="inquiryEditSubmitting">{{ inquiryEditSubmitting ? '保存中...' : '保存修改' }}</button>
						<button type="button" class="ghost-button" :disabled="inquiryEditSubmitting" @click="showInquiryEditForm = false">取消</button>
					</div>
				</form>
			</section>
			<section v-if="canViewApprovalStatus" class="info-card">
				<div class="card-header-row">
					<div>
						<h3>审批状态展示</h3>
						<p class="muted">审批是否触发、是否允许提交，以后端返回结果为准。</p>
					</div>
					<span class="status-pill" :class="pendingApproval ? 'status-pill--warning' : 'status-pill--neutral'">{{ pendingApproval ? '需经理审批' : latestCustomerQuote?.approval_status || '未触发审批' }}</span>
				</div>
				<div v-if="managerApprovals.length" class="timeline-list">
					<article v-for="approval in managerApprovals" :key="approval.id || approval.created_at || approval.reason || 'approval'" class="timeline-item">
						<strong>{{ approval.status || '-' }}</strong>
						<p>{{ approval.reason || '未填写审批原因' }}</p>
						<small>发起：{{ actorName(approval.requested_by) }} · 审批：{{ actorName(approval.approved_by) }} · {{ approval.approved_at || approval.created_at || '-' }}</small>
					</article>
				</div>
				<p v-else class="muted">暂无经理审批记录。</p>
			</section>
			<section class="info-card">
				<div class="card-header-row">
					<div>
						<h3>询价内容</h3>
						<p class="muted">维护供应商报价、附件和推荐标记，最终状态校验仍以后端为准。</p>
					</div>
					<div class="form-actions">
						<button v-if="canAddSupplierQuote" type="button" data-test="toggle-supplier-quote-form" @click="showQuoteForm = !showQuoteForm">
							{{ showQuoteForm ? '收起报价' : '添加供应商报价' }}
						</button>
						<button v-if="canCompleteSupplierQuote" type="button" class="ghost-button" :disabled="completeQuoteSubmitting" @click="completeCurrentSupplierQuote">
							{{ completeQuoteSubmitting ? '处理中...' : '完成报价' }}
						</button>
					</div>
				</div>
				<form
					v-if="showQuoteForm"
					class="quote-form"
					:aria-busy="quoteSubmitting ? 'true' : undefined"
					data-test="supplier-quote-form"
					@submit.prevent="submitSupplierQuote"
				>
					<p v-if="quoteError" id="supplier-quote-error" class="form-message error" role="status" aria-live="polite">{{ quoteError }}</p>
					<div class="form-row">
						<label for="supplier-quote-supplier">
							供应商
							<select id="supplier-quote-supplier" v-model="quoteForm.supplier_id" name="supplier_id" :disabled="quoteSubmitting" :aria-invalid="quoteErrorField === 'supplier-quote-supplier'" :aria-describedby="quoteErrorField === 'supplier-quote-supplier' ? 'supplier-quote-error' : undefined" required>
								<option value="">未选择供应商</option>
								<option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
									{{ supplier.supplier_name || supplier.supplier_code || supplier.id }}
								</option>
							</select>
						</label>
						<label for="supplier-quote-price">
							采购价格 *
							<input
								id="supplier-quote-price"
								v-model="quoteForm.price"
								name="price"
								type="number"
								step="0.01"
								inputmode="decimal"
								:disabled="quoteSubmitting"
								:aria-invalid="quoteErrorField === 'supplier-quote-price'"
								:aria-describedby="quoteErrorField === 'supplier-quote-price' ? 'supplier-quote-error' : undefined"
								required
							/>
						</label>
					</div>
					<div class="form-row">
						<label for="supplier-quote-currency">
							币种 *
							<input id="supplier-quote-currency" v-model="quoteForm.currency" name="currency" maxlength="3" :disabled="quoteSubmitting" :aria-invalid="quoteErrorField === 'supplier-quote-currency'" :aria-describedby="quoteErrorField === 'supplier-quote-currency' ? 'supplier-quote-error' : undefined" required />
						</label>
					<label for="supplier-quote-lead-time">
						货期 *
						<input id="supplier-quote-lead-time" v-model="quoteForm.lead_time" name="lead_time" :disabled="quoteSubmitting" :aria-invalid="quoteErrorField === 'supplier-quote-lead-time'" :aria-describedby="quoteErrorField === 'supplier-quote-lead-time' ? 'supplier-quote-error' : undefined" required />
					</label>
				</div>
				<div class="form-row">
					<label for="supplier-quote-quoted-at">
							报价时间 *
							<input
								id="supplier-quote-quoted-at"
								v-model="quoteForm.quoted_at"
								name="quoted_at"
								type="date"
								:disabled="quoteSubmitting"
								:aria-invalid="quoteErrorField === 'supplier-quote-quoted-at'"
								:aria-describedby="quoteErrorField === 'supplier-quote-quoted-at' ? 'supplier-quote-error' : undefined"
								required
							/>
						</label>
					</div>
					<label for="supplier-quote-remark">
						备注
						<textarea id="supplier-quote-remark" v-model="quoteForm.remark" name="remark" rows="3" :disabled="quoteSubmitting" />
					</label>
					<label for="supplier-quote-attachment">
						附件上传入口
						<input id="supplier-quote-attachment" v-model="quoteForm.attachment_url" name="attachment_url" placeholder="填写附件 URL，后续接入 Directus 文件上传" :disabled="quoteSubmitting" />
					</label>
					<label class="inline-check" for="supplier-quote-recommended">
						<input id="supplier-quote-recommended" v-model="quoteForm.is_recommended" name="is_recommended" type="checkbox" :disabled="quoteSubmitting" />
						标记为推荐报价
					</label>
					<div class="form-actions">
						<button type="submit" :disabled="quoteSubmitting">
							{{ quoteSubmitting ? '保存中...' : editingQuoteId ? '更新报价' : '提交报价' }}
						</button>
						<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="quoteSuccess = '草稿已保留在当前表单，未提交到服务端。'">保存草稿</button>
						<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="resetQuoteForm(); showQuoteForm = false">取消</button>
					</div>
				</form>
					<p v-if="quoteSuccess" class="form-message success" role="status" aria-live="polite">{{ quoteSuccess }}</p>
				<p v-if="item.supplier_quotes.length === 0" class="muted">暂无询价内容。</p>
				<table v-else class="desktop-table">
					<thead>
						<tr>
							<th scope="col">选择</th>
							<th scope="col">供应商</th>
							<th scope="col">报价</th>
							<th scope="col">交期</th>
							<th scope="col">报价时间</th>
							<th scope="col">备注</th>
							<th scope="col">推荐</th>
							<th scope="col">附件</th>
							<th scope="col">操作</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="quote in item.supplier_quotes" :key="getQuoteKey(quote)">
							<td>
								<input v-model="selectedQuoteKey" class="quote-checkbox" type="radio" name="supplier_quote_selection" :value="getQuoteKey(quote)" aria-label="选择最终报价" />
							</td>
							<td>{{ supplierName(quote.supplier_id) }}</td>
							<td>{{ getQuoteText(quote) }}</td>
							<td>{{ quote.lead_time || '-' }}</td>
							<td>{{ quote.quoted_at || '-' }}</td>
							<td class="cell-wrap">{{ quote.remark || '-' }}</td>
							<td><span v-if="quote.is_recommended" class="status-pill">推荐</span><span v-else class="muted">-</span></td>
							<td class="cell-wrap">
								<a v-for="attachment in getAttachments(quote.attachment_ids)" :key="attachment" class="text-link" :href="attachment" target="_blank" rel="noreferrer">附件</a>
								<span v-if="getAttachments(quote.attachment_ids).length === 0" class="muted">-</span>
							</td>
							<td class="row-actions">
								<template v-if="canManageQuote(quote)">
									<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="editSupplierQuote(quote)">编辑</button>
									<button type="button" class="danger-button" :disabled="quoteSubmitting" :aria-label="pendingSupplierQuoteDeleteKey === getQuoteKey(quote) ? '确认删除供应商报价' : '删除供应商报价'" @click="removeSupplierQuote(quote)">{{ pendingSupplierQuoteDeleteKey === getQuoteKey(quote) ? '确认删除' : '删除' }}</button>
									<button v-if="pendingSupplierQuoteDeleteKey === getQuoteKey(quote)" type="button" class="ghost-button" :disabled="quoteSubmitting" @click="pendingSupplierQuoteDeleteKey = null; quoteSuccess = ''">取消</button>
								</template>
								<span v-else class="muted">-</span>
							</td>
						</tr>
					</tbody>
				</table>
				<ul v-if="item.supplier_quotes.length" class="mobile-table-list" aria-label="询价内容移动端列表">
					<li v-for="quote in item.supplier_quotes" :key="`mobile-${getQuoteKey(quote)}`" class="mobile-table-item">
						<div class="mobile-table-item__header">
							<strong>{{ supplierName(quote.supplier_id) }}</strong>
							<span>{{ getQuoteText(quote) }}</span>
						</div>
						<dl class="mobile-table-meta">
								<div><dt>交期</dt><dd>{{ quote.lead_time || '-' }}</dd></div>
							<div><dt>报价时间</dt><dd>{{ quote.quoted_at || '-' }}</dd></div>
							<div><dt>推荐</dt><dd>{{ quote.is_recommended ? '已推荐' : '-' }}</dd></div>
							<div><dt>备注</dt><dd>{{ quote.remark || '-' }}</dd></div>
							<div><dt>附件</dt><dd>
								<a v-for="attachment in getAttachments(quote.attachment_ids)" :key="attachment" class="text-link mobile-inline-link" :href="attachment" target="_blank" rel="noreferrer">附件</a>
								<span v-if="getAttachments(quote.attachment_ids).length === 0">-</span>
							</dd></div>
						</dl>
						<div v-if="canManageQuote(quote)" class="row-actions mobile-row-actions">
							<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="editSupplierQuote(quote)">编辑</button>
							<button type="button" class="danger-button" :disabled="quoteSubmitting" :aria-label="pendingSupplierQuoteDeleteKey === getQuoteKey(quote) ? '确认删除供应商报价' : '删除供应商报价'" @click="removeSupplierQuote(quote)">{{ pendingSupplierQuoteDeleteKey === getQuoteKey(quote) ? '确认删除' : '删除' }}</button>
							<button v-if="pendingSupplierQuoteDeleteKey === getQuoteKey(quote)" type="button" class="ghost-button" :disabled="quoteSubmitting" @click="pendingSupplierQuoteDeleteKey =null; quoteSuccess = ''">取消</button>
						</div>
					</li>
				</ul>
			</section>
			<section v-if="canViewFinalQuote" class="info-card" data-test="final-quote-section">
				<div class="card-header-row">
					<div>
						<h3>最终报价内容</h3>
						<p class="muted">选择一条供应商报价作为最终报价，系统自动判断是否需要经理审批。</p>
					</div>
				</div>
				<p v-if="customerQuoteError" class="form-message error" role="status" aria-live="polite">{{ customerQuoteError }}</p>
				<p v-if="customerQuoteSuccess" class="form-message success" role="status" aria-live="polite">{{ customerQuoteSuccess }}</p>
				<form v-if="canSubmitFinalQuote && selectedQuote" class="quote-form" data-test="final-quote-form" :aria-busy="customerQuoteSubmitting ? 'true' : undefined" @submit.prevent="submitFinalQuote">
					<div class="form-row">
						<label for="final-quote-price">最终报价 *<input id="final-quote-price" v-model="finalQuoteForm.price" name="final_price" type="number" step="0.01" inputmode="decimal" :disabled="customerQuoteSubmitting" required /></label>
						<label for="final-quote-currency">币种 *<input id="final-quote-currency" v-model="finalQuoteForm.currency" name="final_currency" maxlength="3" :disabled="customerQuoteSubmitting" required /></label>
					</div>
					<label for="final-quote-lead-time">货期 *<input id="final-quote-lead-time" v-model="finalQuoteForm.lead_time" name="final_lead_time" :disabled="customerQuoteSubmitting" required /></label>
					<label for="final-quote-remark">备注<textarea id="final-quote-remark" v-model="finalQuoteForm.remark" name="final_remark" rows="3" :disabled="customerQuoteSubmitting" /></label>
					<button type="submit" :disabled="customerQuoteSubmitting">{{ customerQuoteSubmitting ? '提交中...' : '最终报价' }}</button>
				</form>
				<div v-if="item.customer_quotes.length" class="quote-history">
					<h4>客户报价历史</h4>
					<table class="desktop-table">
						<thead>
							<tr>
								<th scope="col">报价</th>
								<th scope="col">报价时间</th>
								<th scope="col">货期</th>
								<th scope="col">审批</th>
								<th scope="col">备注</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="quote in item.customer_quotes" :key="quote.id || quote.quoted_at || String(quote.price)">
								<td>{{ quote.price || '-' }} {{ quote.currency || '' }}</td>
								<td>{{ quote.quoted_at || '-' }}</td>
								<td>{{ quote.lead_time || '-' }}</td>
								<td>{{ quote.approval_status || '-' }}</td>
								<td class="cell-wrap">{{ quote.remark || '-' }}</td>
							</tr>
						</tbody>
					</table>
					<ul class="mobile-table-list" aria-label="客户报价历史移动端列表">
						<li v-for="quote in item.customer_quotes" :key="`customer-mobile-${quote.id || quote.quoted_at || String(quote.price)}`" class="mobile-table-item">
							<div class="mobile-table-item__header">
								<strong>{{ quote.price || '-' }} {{ quote.currency || '' }}</strong>
								<span>{{ quote.approval_status || '-' }}</span>
							</div>
							<dl class="mobile-table-meta">
								<div><dt>报价时间</dt><dd>{{ quote.quoted_at || '-' }}</dd></div>
								<div><dt>货期</dt><dd>{{ quote.lead_time || '-' }}</dd></div>
								<div><dt>备注</dt><dd>{{ quote.remark || '-' }}</dd></div>
							</dl>
						</li>
					</ul>
				</div>
			</section>
			<section v-if="canCloseInquiry" class="info-card">
				<h3>结束询价</h3>
				<p class="muted">确认客户不再推进或流程已完成后，可以手动结束询价。</p>
				<label for="close-inquiry-reason">结束原因<textarea id="close-inquiry-reason" v-model="closeReason" rows="2" :disabled="closeInquirySubmitting" /></label>
				<button type="button" class="danger-button" :disabled="closeInquirySubmitting" @click="closeCurrentInquiry">{{ closeInquirySubmitting ? '结束中...' : '结束询价' }}</button>
			</section>
			<section class="info-card">
				<h3>询价推荐</h3>
				<p class="muted">按当前品牌、型号和规格参数，从历史备注中匹配相近报价。</p>
				<table v-if="recommendedQuotes.length" class="desktop-table">
					<thead>
						<tr>
							<th scope="col">供应商</th>
							<th scope="col">报价</th>
							<th scope="col">交期</th>
							<th scope="col">匹配依据</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="quote in recommendedQuotes" :key="`recommended-${getQuoteKey(quote)}`">
							<td>{{ supplierName(quote.supplier_id) }}</td>
							<td>{{ getQuoteText(quote) }}</td>
							<td>{{ quote.lead_time || '-' }}</td>
							<td class="cell-wrap">{{ quote.remark || '-' }}</td>
						</tr>
					</tbody>
				</table>
				<ul v-if="recommendedQuotes.length" class="mobile-table-list" aria-label="询价推荐移动端列表">
					<li v-for="quote in recommendedQuotes" :key="`recommended-mobile-${getQuoteKey(quote)}`" class="mobile-table-item">
						<div class="mobile-table-item__header">
							<strong>{{ supplierName(quote.supplier_id) }}</strong>
							<span>{{ getQuoteText(quote) }}</span>
						</div>
						<dl class="mobile-table-meta">
							<div><dt>交期</dt><dd>{{ quote.lead_time || '-' }}</dd></div>
							<div><dt>匹配依据</dt><dd>{{ quote.remark || '-' }}</dd></div>
						</dl>
					</li>
				</ul>
				<p v-else class="muted">暂未找到相同品牌、规格参数类似的报价。</p>
			</section>
			<section class="info-card">
				<h3>附件区</h3>
				<div v-if="getAttachments(item.attachment_ids).length" class="attachment-list">
					<a v-for="attachment in getAttachments(item.attachment_ids)" :key="attachment" class="text-link" :href="attachment" target="_blank" rel="noreferrer">{{ attachment }}</a>
				</div>
				<p v-else class="muted">暂无询价项附件。</p>
			</section>
			<section v-if="auth.roleScope === 'Manager'" class="info-card">
				<h3>经理审批入口</h3>
				<p class="muted">审批通过后询价完成；审批拒绝后退回外贸修改最终报价，可再次提交审批。</p>
				<p v-if="approvalError" class="form-message error" role="status" aria-live="polite">{{ approvalError }}</p>
				<p v-if="approvalSuccess" class="form-message success" role="status" aria-live="polite">{{ approvalSuccess }}</p>
				<form class="quote-form" data-test="approval-form" :aria-busy="approvalSubmitting ? 'true' : undefined" @submit.prevent>
					<label for="approval-reason">审批备注<textarea id="approval-reason" v-model="approvalReason" name="approval_reason" rows="3" :disabled="approvalSubmitting || !pendingApproval" placeholder="可填写通过说明，或拒绝后要求外贸调整的原因" /></label>
					<div class="form-actions">
						<button type="button" :disabled="approvalSubmitting || !pendingApproval" @click="submitApproval('Approved')">{{ approvalSubmitting ? '处理中...' : '审批通过' }}</button>
						<button type="button" class="danger-button" :disabled="approvalSubmitting || !pendingApproval" @click="submitApproval('Rejected')">{{ approvalSubmitting ? '处理中...' : '审批拒绝' }}</button>
					</div>
				</form>
			</section>
			<ConversationPanel :conversations="item.conversations" :disabled="isInquiryLocked" :role-scope="currentRoleScope" :submitting="submitting" @submit="submitConversation" />
		</div>
	</AppShell>
</template>
