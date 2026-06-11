<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { createInquiryItem, listInquiryItems } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import InquiryItemForm from '../components/inquiry-item-form.vue';
import TaskProgress from '../components/task-progress.vue';
import { useAuthStore } from '../stores/auth';
import type { InquiryItemRow } from '../types/purchase-flow';
import { getStateLabel } from '../utils/inquiry-state';

const auth = useAuthStore();
const items = ref<InquiryItemRow[]>([]);
const loading = ref(true);
const error = ref('');
const showForm = ref(false);
const submitting = ref(false);
const formVersion = ref(0);

const filters = reactive({
	state: '',
	keyword: '',
	customer: '',
	updatedBefore: '',
});

const requestController = new AbortController();

function userName(
	user?: { first_name?: string | null; last_name?: string | null } | string | null,
): string {
	if (!user || typeof user === 'string') return '-';
	return [user.first_name, user.last_name].filter(Boolean).join(' ') || '-';
}

function customerName(customer?: { customer_name?: string } | string | null): string {
	if (!customer || typeof customer === 'string') return '-';
	return customer.customer_name || '-';
}

function normalize(value?: string | null) {
	return String(value || '').trim().toLowerCase();
}

const filteredItems = computed(() => {
	const keyword = normalize(filters.keyword);
	const customer = normalize(filters.customer);

	return items.value.filter((item) => {
		const itemCustomerName = customerName(item.customer_id);
		const matchesState = !filters.state || item.state === filters.state;
		const matchesKeyword = !keyword || [item.inquiry_no, item.product_name, item.brand, item.model, item.project_name]
			.some((value) => normalize(value).includes(keyword));
		const matchesCustomer = !customer || normalize(itemCustomerName).includes(customer);
		const matchesUpdatedBefore = !filters.updatedBefore || String(item.updated_at || '').slice(0, 10) <= filters.updatedBefore;

		return matchesState && matchesKeyword && matchesCustomer && matchesUpdatedBefore;
	});
});

async function load(signal: AbortSignal) {
	if (!auth.currentUser?.id) {
		error.value = '无法识别当前用户，请重新登录。';
		loading.value = false;
		return;
	}

	loading.value = true;
	error.value = '';

	try {
		items.value = await listInquiryItems(auth.roleScope, auth.currentUser.id, signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '询价项加载失败';
	} finally {
		loading.value = false;
	}
}

async function handleCreate(payload: Record<string, unknown>) {
	submitting.value = true;
	error.value = '';

	try {
		await createInquiryItem(payload, requestController.signal);
		formVersion.value += 1;
		showForm.value = false;
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '创建询价项失败';
	} finally {
		submitting.value = false;
	}
}

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
				<p class="eyebrow">Inquiry Items</p>
				<h2>询价项列表</h2>
			</div>
			<button v-if="!showForm && auth.roleScope === 'Sales'" type="button" class="ghost-button" @click="showForm = true">
				+ 新增询价项
			</button>
		</section>

		<InquiryItemForm
			v-if="showForm"
			:submitting="submitting"
			:sales-owner-id="auth.currentUser?.id || ''"
			:reset-key="formVersion"
			@submit="handleCreate"
			@cancel="showForm = false"
		/>

		<section class="filter-panel" aria-label="询价项查询">
			<div class="filter-panel__grid">
			<label>状态<select v-model="filters.state"><option value="">全部状态</option><option value="Draft">{{ getStateLabel('Draft') }}</option><option value="Assigned">{{ getStateLabel('Assigned') }}</option><option value="Purchasing">{{ getStateLabel('Purchasing') }}</option><option value="WaitingSalesReview">{{ getStateLabel('WaitingSalesReview') }}</option><option value="Quoted">{{ getStateLabel('Quoted') }}</option><option value="Closed">{{ getStateLabel('Closed') }}</option></select></label>
			<label>名称/编号<input v-model="filters.keyword" type="search" placeholder="产品、询价号、品牌、型号" /></label>
			<label>客户<input v-model="filters.customer" type="search" placeholder="客户名称" /></label>
			<label>更新时间早于<input v-model="filters.updatedBefore" type="date" /></label>
			</div>
		</section>

		<p v-if="error && !showForm" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载询价项...</p>
		<p v-else-if="filteredItems.length === 0 && !showForm" class="state-card" role="status" aria-live="polite">暂无询价项</p>
		<div v-else class="table-card">
			<table>
				<thead>
					<tr>
						<th scope="col">询价号</th>
						<th scope="col">产品</th>
						<th scope="col">品牌/型号</th>
						<th scope="col">数量</th>
						<th scope="col">优先级</th>
						<th scope="col">状态</th>
						<th scope="col">客户</th>
						<th scope="col">外贸员</th>
						<th scope="col">采购员</th>
						<th scope="col">截止时间</th>
						<th scope="col">更新时间</th>
						<th scope="col">操作</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in filteredItems" :key="item.id">
						<td>{{ item.inquiry_no || item.id }}</td>
						<td>{{ item.product_name || '-' }}</td>
						<td>{{ item.brand || '-' }} / {{ item.model || '-' }}</td>
						<td class="cell-numeric">{{ item.quantity ?? '-' }} {{ item.unit || '' }}</td>
						<td>{{ item.priority || '-' }}</td>
						<td class="inquiry-state-cell"><TaskProgress compact :item="item" :state="item.state" /></td>
						<td>{{ customerName(item.customer_id) }}</td>
						<td>{{ userName(item.sales_owner_id) }}</td>
						<td>{{ userName(item.buyer_owner_id) }}</td>
						<td>{{ item.assignment_deadline || '-' }}</td>
						<td>{{ item.updated_at || '-' }}</td>
						<td class="row-actions">
							<RouterLink class="text-link" :to="`/inquiry-items/${item.id}/detail`">详情</RouterLink>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</AppShell>
</template>
