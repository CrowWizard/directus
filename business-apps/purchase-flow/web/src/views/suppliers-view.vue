<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { deleteSupplier, listSupplierContacts, listSupplierQuoteHistory, listSuppliers, updateSupplierStatus } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import { useAuthStore } from '../stores/auth';
import type { Supplier, SupplierContact, SupplierQuote } from '../types/purchase-flow';

const auth = useAuthStore();
const suppliers = ref<Supplier[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const expandedSupplierId = ref('');
const contactsBySupplier = ref<Record<string, SupplierContact[]>>({});
const quotesBySupplier = ref<Record<string, SupplierQuote[]>>({});

const requestController = new AbortController();

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		suppliers.value = await listSuppliers(signal);
		await loadSupplierContacts(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	} finally {
		loading.value = false;
	}
}

async function loadSupplierContacts(signal: AbortSignal) {
	const supplierIds = suppliers.value.map((supplier) => supplier.id);

	if (supplierIds.length === 0) {
		contactsBySupplier.value = {};
		return;
	}

	try {
		const contacts = await listSupplierContacts(supplierIds, signal);
		contactsBySupplier.value = groupBy(contacts, (contact) => getRelationId(contact.supplier_id));
	} catch {
		contactsBySupplier.value = {};
	}
}

async function remove(id: string) {
	if (!auth.isManager) return;

	submitting.value = true;
	error.value = '';

	try {
		await deleteSupplier(id, requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商删除失败';
	} finally {
		submitting.value = false;
	}
}

async function toggleStatus(supplier: Supplier) {
	if (!auth.isManager || submitting.value) return;

	submitting.value = true;
	error.value = '';

	try {
		const nextStatus = isActive(supplier.status) ? 'Inactive' : 'Active';
		await updateSupplierStatus(supplier.id, nextStatus, requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商状态更新失败';
	} finally {
		submitting.value = false;
	}
}

async function toggleDetails(supplier: Supplier) {
	if (expandedSupplierId.value === supplier.id) {
		expandedSupplierId.value = '';
		return;
	}

	expandedSupplierId.value = supplier.id;

	if (quotesBySupplier.value[supplier.id]) return;

	try {
		quotesBySupplier.value = {
			...quotesBySupplier.value,
			[supplier.id]: await listSupplierQuoteHistory(supplier.id, requestController.signal),
		};
	} catch {
		quotesBySupplier.value = { ...quotesBySupplier.value, [supplier.id]: [] };
	}
}

function getRelationId(value: SupplierContact['supplier_id']) {
	if (!value) return '';
	if (typeof value === 'string') return value;

	return value.id;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
	const result: Record<string, T[]> = {};

	for (const item of items) {
		const itemKey = key(item);
		if (!itemKey) continue;
		(result[itemKey] ??= []).push(item);
	}

	return result;
}

function isActive(status?: string) {
	return !status || /active|enabled|启用|正常/i.test(status);
}

function buyerName(supplier: Supplier) {
	if (!supplier.buyer_id) return '-';
	if (typeof supplier.buyer_id === 'string') return supplier.buyer_id;

	return [supplier.buyer_id.first_name, supplier.buyer_id.last_name].filter(Boolean).join(' ') || supplier.buyer_id.email || supplier.buyer_id.id;
}

function quoteInquiryName(quote: SupplierQuote) {
	if (!quote.inquiry_item_id) return '-';
	if (typeof quote.inquiry_item_id === 'string') return quote.inquiry_item_id;

	return `${quote.inquiry_item_id.inquiry_no || quote.inquiry_item_id.id} ${quote.inquiry_item_id.product_name || ''}`.trim();
}

const activeSupplierCount = computed(() => suppliers.value.filter((supplier) => isActive(supplier.status)).length);

onMounted(() => {
	load(requestController.signal);
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Suppliers</p>
				<h2>供应商管理</h2>
			</div>
			<RouterLink v-if="auth.isManager" class="button-link" to="/suppliers/new">新增供应商</RouterLink>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载供应商...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-else-if="suppliers.length === 0" class="state-card" role="status" aria-live="polite">暂无供应商</p>
		<div v-else class="management-stack">
			<section class="summary-strip" aria-label="供应商统计">
				<article class="summary-tile"><span>供应商总数</span><strong>{{ suppliers.length }}</strong></article>
				<article class="summary-tile"><span>启用供应商</span><strong>{{ activeSupplierCount }}</strong></article>
				<article class="summary-tile"><span>联系人</span><strong>{{ Object.values(contactsBySupplier).flat().length }}</strong></article>
			</section>
			<div class="table-card table-card--wide">
			<table>
				<thead>
					<tr>
						<th scope="col">供应商编码</th>
						<th scope="col">供应商名称</th>
						<th scope="col">类型</th>
						<th scope="col">国家</th>
						<th scope="col">负责人</th>
						<th scope="col">税率</th>
						<th scope="col">付款条件</th>
						<th scope="col">网站</th>
						<th scope="col">状态</th>
						<th scope="col">备注</th>
						<th scope="col">操作</th>
					</tr>
				</thead>
				<tbody>
					<template v-for="supplier in suppliers" :key="supplier.id">
					<tr>
						<td>{{ supplier.supplier_code || '-' }}</td>
						<td>{{ supplier.supplier_name || '-' }}</td>
						<td>{{ supplier.supplier_type || '-' }}</td>
						<td>{{ supplier.country || '-' }}</td>
						<td>{{ buyerName(supplier) }}</td>
						<td class="cell-numeric">{{ supplier.tax_rate ?? '-' }}</td>
						<td>{{ supplier.payment_term || '-' }}</td>
						<td>{{ supplier.website || '-' }}</td>
						<td>{{ supplier.status || '-' }}</td>
						<td>{{ supplier.remark || '-' }}</td>
						<td class="row-actions">
							<button type="button" class="ghost-button" :disabled="submitting" @click="toggleDetails(supplier)">
								{{ expandedSupplierId === supplier.id ? '收起' : '详情' }}
							</button>
							<button v-if="auth.isManager" type="button" class="ghost-button" :disabled="submitting" @click="toggleStatus(supplier)">
								{{ isActive(supplier.status) ? '停用' : '启用' }}
							</button>
							<RouterLink v-if="auth.isManager" class="text-link" :to="`/suppliers/${supplier.id}/edit`">编辑</RouterLink>
							<button
								v-if="auth.isManager"
								type="button"
								class="danger-button"
								:data-test="`delete-${supplier.id}`"
								:disabled="submitting"
								@click="remove(supplier.id)"
							>
								删除
							</button>
						</td>
					</tr>
					<tr v-if="expandedSupplierId === supplier.id" class="detail-row">
						<td colspan="11">
							<div class="management-detail-grid">
								<section>
									<h3>联系人管理</h3>
									<ul v-if="contactsBySupplier[supplier.id]?.length" class="mini-list">
										<li v-for="contact in contactsBySupplier[supplier.id]" :key="contact.id">
											<strong>{{ contact.name || '-' }}</strong>
											<span>{{ contact.position || '-' }} · {{ contact.phone || contact.email || contact.wechat || '-' }}</span>
										</li>
									</ul>
									<p v-else class="muted">暂无联系人。</p>
								</section>
								<section>
									<h3>供应商报价历史</h3>
									<ul v-if="quotesBySupplier[supplier.id]?.length" class="mini-list">
										<li v-for="quote in quotesBySupplier[supplier.id]" :key="quote.id || quote.quoted_at || String(quote.price)">
											<strong>{{ quote.price || '-' }} {{ quote.currency || '' }}</strong>
											<span>{{ quoteInquiryName(quote) }} · {{ quote.quoted_at || '-' }}</span>
										</li>
									</ul>
									<p v-else class="muted">暂无报价历史。</p>
								</section>
							</div>
						</td>
					</tr>
					</template>
				</tbody>
			</table>
			</div>
		</div>
	</AppShell>
</template>
