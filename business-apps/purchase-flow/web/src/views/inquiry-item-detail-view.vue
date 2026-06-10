<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
	commentAndUpdateState,
	createCustomerQuote,
	createSupplierQuote,
	deleteSupplierQuote,
	get询价项Detail,
	listSuppliers,
	updateSupplierQuote,
} from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import ConversationPanel from '../components/conversation-panel.vue';
import InquiryItemKeyInfo from '../components/inquiry-item-key-info.vue';
import { useAuthStore } from '../stores/auth';
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
const quoteErrorField = ref('');
const customerQuoteErrorField = ref('');
const selectedQuoteKeys = ref<string[]>([]);
const suppliers = ref<Supplier[]>([]);
const showQuoteForm = ref(false);
const editingQuoteId = ref<string | null>(null);
const pendingSupplierQuoteDeleteKey = ref<string | null>(null);

const customerQuoteSubmitting = ref(false);

const quoteForm = reactive({
	supplier_id: '',
	price: '',
	currency: 'CNY',
	moq: '',
	lead_time: '',
	quoted_at: '',
	remark: '',
	attachment_url: '',
	is_recommended: false,
});

const customerQuoteForm = reactive({
	price: '',
	currency: 'USD',
	lead_time: '',
	quoted_at: '',
	remark: '',
	approval_reason: '',
});

const requestController = new AbortController();
let activeRequest = 0;

const quoteKeys = computed(() => item.value?.supplier_quotes.map(getQuoteKey) || []);

const selectedQuotes = computed(() => {
	if (!item.value) return [];

	const selected = new Set(selectedQuoteKeys.value);

	return item.value.supplier_quotes.filter((quote) => selected.has(getQuoteKey(quote)));
});

const recommendedQuotes = computed(() => {
	if (!item.value) return [];

	return item.value.supplier_quotes.filter((quote) => quote.is_recommended || isRecommendedQuote(item.value!, quote));
});

const latestCustomerQuote = computed(() => item.value?.customer_quotes[0] || null);
const managerApprovals = computed(() => item.value?.manager_approvals || []);
const pendingApproval = computed(() => managerApprovals.value.find((approval) => approval.status === 'Pending') || null);
const needsManagerApprovalHint = computed(() => {
	const price = Number(customerQuoteForm.price);
	const targetPrice = Number(item.value?.target_price);

	return Number.isFinite(price) && Number.isFinite(targetPrice) && targetPrice > 0 && price > targetPrice;
});

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
	return Boolean(quote.id && auth.currentUser?.id && userId(quote.quoted_by) === auth.currentUser.id);
}

function getQuoteText(quote: SupplierQuote) {
	return `${quote.price || '-'} ${quote.currency || ''}`.trim();
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
		item.value = await get询价项Detail(String(route.params.id), signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '询价项详情加载失败';
	} finally {
		loading.value = false;
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
	quoteForm.moq = '';
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
	quoteForm.moq = quote.moq === null || quote.moq === undefined ? '' : String(quote.moq);
	quoteForm.lead_time = quote.lead_time || '';
	quoteForm.quoted_at = quote.quoted_at ? quote.quoted_at.slice(0, 10) : '';
	quoteForm.remark = quote.remark || '';
	quoteForm.attachment_url = getFirstAttachment(quote.attachment_ids);
	quoteForm.is_recommended = Boolean(quote.is_recommended);
	showQuoteForm.value = true;
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

	if (quoteForm.moq && !isPositiveNumber(quoteForm.moq)) {
		quoteError.value = 'MOQ 必须为大于 0 的数字。';
		quoteErrorField.value = 'supplier-quote-moq';
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
		const payload = {
			attachment_ids: quoteForm.attachment_url ? [quoteForm.attachment_url] : null,
			currency: quoteForm.currency || null,
			inquiry_item_id: String(route.params.id),
			inquiry_price: quoteForm.price,
			is_recommended: quoteForm.is_recommended,
			lead_time: quoteForm.lead_time || null,
			moq: quoteForm.moq || null,
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
		quoteSuccess.value = isEditing ? '询价已更新。' : '询价已保存。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		quoteError.value = err instanceof Error ? err.message : '询价保存失败';
	} finally {
		quoteSubmitting.value = false;
	}
}

async function submitCustomerQuote() {
	customerQuoteError.value = '';
	customerQuoteSuccess.value = '';
	customerQuoteErrorField.value = '';

	if (!auth.currentUser?.id) {
		customerQuoteError.value = '无法识别当前用户，请重新登录。';
		return;
	}

	if (!item.value) return;

	if (!isPositiveNumber(customerQuoteForm.price)) {
		customerQuoteError.value = '请填写大于 0 的客户报价。';
		customerQuoteErrorField.value = 'customer-quote-price';
		return;
	}

	if (!isCurrencyCode(customerQuoteForm.currency)) {
		customerQuoteError.value = '币种必须为 3 位大写字母，例如 CNY、USD。';
		customerQuoteErrorField.value = 'customer-quote-currency';
		return;
	}

	if (!customerQuoteForm.lead_time) {
		customerQuoteError.value = '请填写客户报价货期。';
		customerQuoteErrorField.value = 'customer-quote-lead-time';
		return;
	}

	if (!customerQuoteForm.quoted_at) {
		customerQuoteError.value = '请选择客户报价时间。';
		customerQuoteErrorField.value = 'customer-quote-quoted-at';
		return;
	}

	if (needsManagerApprovalHint.value && !customerQuoteForm.approval_reason.trim()) {
		customerQuoteError.value = '报价高于目标价时，请填写审批说明。';
		customerQuoteErrorField.value = 'customer-quote-approval-reason';
		return;
	}

	customerQuoteSubmitting.value = true;

	try {
		await createCustomerQuote(
			{
				approval_status: needsManagerApprovalHint.value ? 'Pending' : 'NotRequired',
				currency: customerQuoteForm.currency,
				customer_id: typeof item.value.customer_id === 'string' ? item.value.customer_id : item.value.customer_id?.id || null,
				inquiry_item_id: item.value.id,
				lead_time: customerQuoteForm.lead_time,
				price: customerQuoteForm.price,
				quoted_at: customerQuoteForm.quoted_at,
				quoted_by: auth.currentUser.id,
				remark: [customerQuoteForm.remark, customerQuoteForm.approval_reason && `审批说明：${customerQuoteForm.approval_reason}`]
					.filter(Boolean)
					.join('\n'),
			},
			requestController.signal,
		);

		customerQuoteForm.price = '';
		customerQuoteForm.currency = 'USD';
		customerQuoteForm.lead_time = '';
		customerQuoteForm.quoted_at = '';
		customerQuoteForm.remark = '';
		customerQuoteForm.approval_reason = '';
		await load(requestController.signal);
		customerQuoteSuccess.value = '客户报价已保存，最终审批与状态流转以后端结果为准。';
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		customerQuoteError.value = err instanceof Error ? err.message : '客户报价保存失败';
	} finally {
		customerQuoteSubmitting.value = false;
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

function selectAllQuotes() {
	selectedQuoteKeys.value = quoteKeys.value;
}

watch(
	quoteKeys,
	(keys) => {
		selectedQuoteKeys.value = selectedQuoteKeys.value.filter((key) => keys.includes(key));
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
				<h3>基础信息区</h3>
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
			</section>
			<section class="info-card">
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
					<button type="button" data-test="toggle-supplier-quote-form" @click="showQuoteForm = !showQuoteForm">
						{{ showQuoteForm ? '收起报价' : '添加供应商报价' }}
					</button>
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
						<label for="supplier-quote-moq">
							MOQ
							<input
								id="supplier-quote-moq"
								v-model="quoteForm.moq"
								name="moq"
								type="number"
								inputmode="numeric"
								:disabled="quoteSubmitting"
								:aria-invalid="quoteErrorField === 'supplier-quote-moq'"
								:aria-describedby="quoteErrorField === 'supplier-quote-moq' ? 'supplier-quote-error' : undefined"
							/>
						</label>
					</div>
					<div class="form-row">
						<label for="supplier-quote-lead-time">
							货期 *
							<input id="supplier-quote-lead-time" v-model="quoteForm.lead_time" name="lead_time" :disabled="quoteSubmitting" :aria-invalid="quoteErrorField === 'supplier-quote-lead-time'" :aria-describedby="quoteErrorField === 'supplier-quote-lead-time' ? 'supplier-quote-error' : undefined" required />
						</label>
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
							<th scope="col">MOQ</th>
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
								<input
									v-model="selectedQuoteKeys"
									class="quote-checkbox"
									type="checkbox"
									:value="getQuoteKey(quote)"
									aria-label="选择询价"
								/>
							</td>
							<td>{{ supplierName(quote.supplier_id) }}</td>
							<td>{{ getQuoteText(quote) }}</td>
							<td>{{ quote.moq || '-' }}</td>
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
							<div><dt>MOQ</dt><dd>{{ quote.moq || '-' }}</dd></div>
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
			<section class="info-card">
				<div class="card-header-row">
					<div>
						<h3>最终报价内容</h3>
						<p class="muted">从已选询价汇总最终报价，用于快速比较多个供应商方案。</p>
					</div>
					<button type="button" :disabled="quoteKeys.length === 0" @click="selectAllQuotes">最终报价</button>
				</div>
				<table v-if="selectedQuotes.length" class="desktop-table">
					<thead>
						<tr>
							<th scope="col">供应商</th>
							<th scope="col">报价</th>
							<th scope="col">MOQ</th>
							<th scope="col">交期</th>
							<th scope="col">报价时间</th>
							<th scope="col">备注</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="quote in selectedQuotes" :key="`selected-${getQuoteKey(quote)}`">
							<td>{{ supplierName(quote.supplier_id) }}</td>
							<td>{{ getQuoteText(quote) }}</td>
							<td>{{ quote.moq || '-' }}</td>
							<td>{{ quote.lead_time || '-' }}</td>
							<td>{{ quote.quoted_at || '-' }}</td>
							<td class="cell-wrap">{{ quote.remark || '-' }}</td>
						</tr>
					</tbody>
				</table>
				<ul v-if="selectedQuotes.length" class="mobile-table-list" aria-label="最终报价内容移动端列表">
					<li v-for="quote in selectedQuotes" :key="`selected-mobile-${getQuoteKey(quote)}`" class="mobile-table-item">
						<div class="mobile-table-item__header">
							<strong>{{ supplierName(quote.supplier_id) }}</strong>
							<span>{{ getQuoteText(quote) }}</span>
						</div>
						<dl class="mobile-table-meta">
							<div><dt>MOQ</dt><dd>{{ quote.moq || '-' }}</dd></div>
							<div><dt>交期</dt><dd>{{ quote.lead_time || '-' }}</dd></div>
							<div><dt>报价时间</dt><dd>{{ quote.quoted_at || '-' }}</dd></div>
							<div><dt>备注</dt><dd>{{ quote.remark || '-' }}</dd></div>
						</dl>
					</li>
				</ul>
				<p v-else class="muted">请选择询价内容后点击最终报价。</p>
				<form class="quote-form" :aria-busy="customerQuoteSubmitting ? 'true' : undefined" @submit.prevent="submitCustomerQuote">
					<h4>客户报价区</h4>
					<p v-if="customerQuoteError" id="customer-quote-error" class="form-message error" role="status" aria-live="polite">{{ customerQuoteError }}</p>
					<p v-if="customerQuoteSuccess" class="form-message success" role="status" aria-live="polite">{{ customerQuoteSuccess }}</p>
					<div class="form-row">
						<label for="customer-quote-price">客户报价 *<input id="customer-quote-price" v-model="customerQuoteForm.price" type="number" step="0.01" inputmode="decimal" :disabled="customerQuoteSubmitting" :aria-invalid="customerQuoteErrorField === 'customer-quote-price'" :aria-describedby="customerQuoteErrorField === 'customer-quote-price' ? 'customer-quote-error' : undefined" required /></label>
						<label for="customer-quote-currency">币种 *<input id="customer-quote-currency" v-model="customerQuoteForm.currency" maxlength="3" :disabled="customerQuoteSubmitting" :aria-invalid="customerQuoteErrorField === 'customer-quote-currency'" :aria-describedby="customerQuoteErrorField === 'customer-quote-currency' ? 'customer-quote-error' : undefined" required /></label>
					</div>
					<div class="form-row">
						<label for="customer-quote-lead-time">货期 *<input id="customer-quote-lead-time" v-model="customerQuoteForm.lead_time" :disabled="customerQuoteSubmitting" :aria-invalid="customerQuoteErrorField === 'customer-quote-lead-time'" :aria-describedby="customerQuoteErrorField === 'customer-quote-lead-time' ? 'customer-quote-error' : undefined" required /></label>
						<label for="customer-quote-quoted-at">报价时间 *<input id="customer-quote-quoted-at" v-model="customerQuoteForm.quoted_at" type="date" :disabled="customerQuoteSubmitting" :aria-invalid="customerQuoteErrorField === 'customer-quote-quoted-at'" :aria-describedby="customerQuoteErrorField === 'customer-quote-quoted-at' ? 'customer-quote-error' : undefined" required /></label>
					</div>
					<label for="customer-quote-remark">备注<textarea id="customer-quote-remark" v-model="customerQuoteForm.remark" rows="3" :disabled="customerQuoteSubmitting" /></label>
					<label v-if="needsManagerApprovalHint" for="customer-quote-approval-reason">审批说明 *<textarea id="customer-quote-approval-reason" v-model="customerQuoteForm.approval_reason" rows="3" :disabled="customerQuoteSubmitting" :aria-invalid="customerQuoteErrorField === 'customer-quote-approval-reason'" :aria-describedby="customerQuoteErrorField === 'customer-quote-approval-reason' ? 'customer-quote-error customer-quote-approval-hint' : 'customer-quote-approval-hint'" required /></label>
					<p v-if="needsManagerApprovalHint" id="customer-quote-approval-hint" class="form-message warning">当前报价高于目标价格，前端提示可能需要经理审批，最终以后端结果为准。</p>
					<button type="submit" :disabled="customerQuoteSubmitting">{{ customerQuoteSubmitting ? '提交中...' : '提交客户报价' }}</button>
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
				<p class="muted">经理审批动作需以后端审批接口为准。当前页面展示待审批记录和原因，避免前端绕过服务端规则。</p>
				<div class="form-actions">
					<button type="button" :disabled="!pendingApproval">审批通过</button>
					<button type="button" class="danger-button" :disabled="!pendingApproval">审批拒绝</button>
				</div>
			</section>
			<ConversationPanel :conversations="item.conversations" :submitting="submitting" @submit="submitConversation" />
		</div>
	</AppShell>
</template>
