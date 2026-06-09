<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
	commentAndUpdateState,
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
import type { InquiryItemDetail, InquiryState, Supplier, SupplierQuote } from '../types/purchase-flow';

const route = useRoute();
const auth = useAuthStore();
const item = ref<InquiryItemDetail | null>(null);
const loading = ref(true);
const submitting = ref(false);
const quoteSubmitting = ref(false);
const error = ref('');
const quoteError = ref('');
const quoteSuccess = ref('');
const selectedQuoteKeys = ref<string[]>([]);
const suppliers = ref<Supplier[]>([]);
const showQuoteForm = ref(false);
const editingQuoteId = ref<string | null>(null);

const quoteForm = reactive({
	supplier_id: '',
	price: '',
	currency: 'CNY',
	moq: '',
	lead_time: '',
	quoted_at: '',
	remark: '',
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

	return item.value.supplier_quotes.filter((quote) => isRecommendedQuote(item.value!, quote));
});

function getQuoteKey(quote: SupplierQuote) {
	return quote.id || `${quote.supplier_id || 'supplier'}-${quote.price || 'price'}-${quote.quoted_at || 'time'}`;
}

function supplierName(supplier: SupplierQuote['supplier_id']) {
	if (!supplier) return '-';
	if (typeof supplier === 'string') return supplier;

	return (supplier as Supplier).supplier_name || (supplier as Supplier).supplier_code || '-';
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
	quoteForm.supplier_id = '';
	quoteForm.price = '';
	quoteForm.currency = 'CNY';
	quoteForm.moq = '';
	quoteForm.lead_time = '';
	quoteForm.quoted_at = '';
	quoteForm.remark = '';
}

function editSupplierQuote(quote: SupplierQuote) {
	if (!quote.id || !canManageQuote(quote)) return;

	editingQuoteId.value = quote.id;
	quoteError.value = '';
	quoteSuccess.value = '';
	quoteForm.supplier_id = typeof quote.supplier_id === 'string' ? quote.supplier_id : quote.supplier_id?.id || '';
	quoteForm.price = quote.price === null || quote.price === undefined ? '' : String(quote.price);
	quoteForm.currency = quote.currency || 'CNY';
	quoteForm.moq = quote.moq === null || quote.moq === undefined ? '' : String(quote.moq);
	quoteForm.lead_time = quote.lead_time || '';
	quoteForm.quoted_at = quote.quoted_at ? quote.quoted_at.slice(0, 10) : '';
	quoteForm.remark = quote.remark || '';
	showQuoteForm.value = true;
}

async function submitSupplierQuote() {
	quoteError.value = '';
	quoteSuccess.value = '';

	if (!auth.currentUser?.id) {
		quoteError.value = '无法识别当前用户，请重新登录。';
		return;
	}

	if (!quoteForm.supplier_id) {
		quoteError.value = '请选择供应商。';
		return;
	}

	if (!quoteForm.price) {
		quoteError.value = '请填写询价报价。';
		return;
	}

	if (!quoteForm.currency) {
		quoteError.value = '请填写币种。';
		return;
	}

	if (!quoteForm.lead_time) {
		quoteError.value = '请填写交期。';
		return;
	}

	if (!quoteForm.quoted_at) {
		quoteError.value = '请选择报价时间。';
		return;
	}

	quoteSubmitting.value = true;

	try {
		const isEditing = Boolean(editingQuoteId.value);
		const payload = {
			currency: quoteForm.currency || null,
			inquiry_item_id: String(route.params.id),
			inquiry_price: quoteForm.price,
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

async function removeSupplierQuote(quote: SupplierQuote) {
	if (!quote.id || !canManageQuote(quote) || quoteSubmitting.value) return;

	quoteSubmitting.value = true;
	quoteError.value = '';
	quoteSuccess.value = '';

	try {
		await deleteSupplierQuote(quote.id, requestController.signal);
		await load(requestController.signal);
		quoteSuccess.value = '询价已删除。';
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
				<div class="card-header-row">
					<div>
						<h3>询价内容</h3>
						<p class="muted">选择一个或多个询价后，可在下方生成最终报价内容。</p>
					</div>
					<button type="button" data-test="toggle-supplier-quote-form" @click="showQuoteForm = !showQuoteForm">
						{{ showQuoteForm ? '收起询价' : '添加询价' }}
					</button>
				</div>
				<form
					v-if="showQuoteForm"
					class="quote-form"
					:aria-busy="quoteSubmitting ? 'true' : undefined"
					data-test="supplier-quote-form"
					@submit.prevent="submitSupplierQuote"
				>
					<p v-if="quoteError" class="form-message error" role="status" aria-live="polite">{{ quoteError }}</p>
					<div class="form-row">
						<label for="supplier-quote-supplier">
							供应商
							<select id="supplier-quote-supplier" v-model="quoteForm.supplier_id" name="supplier_id" :disabled="quoteSubmitting" required>
								<option value="">未选择供应商</option>
								<option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">
									{{ supplier.supplier_name || supplier.supplier_code || supplier.id }}
								</option>
							</select>
						</label>
						<label for="supplier-quote-price">
							报价
							<input
								id="supplier-quote-price"
								v-model="quoteForm.price"
								name="price"
								type="number"
								step="0.01"
								inputmode="decimal"
								:disabled="quoteSubmitting"
								required
							/>
						</label>
					</div>
					<div class="form-row">
						<label for="supplier-quote-currency">
							币种
							<input id="supplier-quote-currency" v-model="quoteForm.currency" name="currency" :disabled="quoteSubmitting" required />
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
							/>
						</label>
					</div>
					<div class="form-row">
						<label for="supplier-quote-lead-time">
							交期
							<input id="supplier-quote-lead-time" v-model="quoteForm.lead_time" name="lead_time" :disabled="quoteSubmitting" required />
						</label>
						<label for="supplier-quote-quoted-at">
							报价时间
							<input
								id="supplier-quote-quoted-at"
								v-model="quoteForm.quoted_at"
								name="quoted_at"
								type="date"
								:disabled="quoteSubmitting"
								required
							/>
						</label>
					</div>
					<label for="supplier-quote-remark">
						备注
						<textarea id="supplier-quote-remark" v-model="quoteForm.remark" name="remark" rows="3" :disabled="quoteSubmitting" />
					</label>
					<div class="form-actions">
						<button type="submit" :disabled="quoteSubmitting">
							{{ quoteSubmitting ? '保存中...' : editingQuoteId ? '更新询价' : '保存询价' }}
						</button>
						<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="resetQuoteForm(); showQuoteForm = false">取消</button>
					</div>
				</form>
				<p v-if="quoteSuccess" class="form-message success" role="status" aria-live="polite">{{ quoteSuccess }}</p>
				<p v-if="item.supplier_quotes.length === 0" class="muted">暂无询价内容。</p>
				<table v-else>
					<thead>
						<tr>
							<th scope="col">选择</th>
							<th scope="col">供应商</th>
							<th scope="col">报价</th>
							<th scope="col">MOQ</th>
							<th scope="col">交期</th>
							<th scope="col">报价时间</th>
							<th scope="col">备注</th>
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
							<td class="row-actions">
								<template v-if="canManageQuote(quote)">
									<button type="button" class="ghost-button" :disabled="quoteSubmitting" @click="editSupplierQuote(quote)">编辑</button>
									<button type="button" class="danger-button" :disabled="quoteSubmitting" @click="removeSupplierQuote(quote)">删除</button>
								</template>
								<span v-else class="muted">-</span>
							</td>
						</tr>
					</tbody>
				</table>
			</section>
			<section class="info-card">
				<div class="card-header-row">
					<div>
						<h3>最终报价内容</h3>
						<p class="muted">最终报价取自已选择的询价内容，支持同时汇总多个供应商方案。</p>
					</div>
					<button type="button" :disabled="quoteKeys.length === 0" @click="selectAllQuotes">最终报价</button>
				</div>
				<table v-if="selectedQuotes.length">
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
				<p v-else class="muted">请选择询价内容后点击最终报价。</p>
				<div v-if="item.customer_quotes.length" class="quote-history">
					<h4>客户报价历史</h4>
					<table>
						<thead>
							<tr>
								<th scope="col">报价</th>
								<th scope="col">报价时间</th>
								<th scope="col">备注</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="quote in item.customer_quotes" :key="quote.id || quote.quoted_at || String(quote.price)">
								<td>{{ quote.price || '-' }} {{ quote.currency || '' }}</td>
								<td>{{ quote.quoted_at || '-' }}</td>
								<td class="cell-wrap">{{ quote.remark || '-' }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</section>
			<section class="info-card">
				<h3>询价推荐</h3>
				<p class="muted">根据当前品牌、型号和规格参数，在询价备注中查找相似报价。</p>
				<table v-if="recommendedQuotes.length">
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
				<p v-else class="muted">暂未找到相同品牌、规格参数类似的报价。</p>
			</section>
			<ConversationPanel :conversations="item.conversations" :submitting="submitting" @submit="submitConversation" />
		</div>
	</AppShell>
</template>
