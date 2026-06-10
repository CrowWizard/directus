<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { deleteCustomer, listCustomerContacts, listCustomerInquiryHistory, listCustomers, updateCustomerStatus } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import type { Customer, CustomerContact, InquiryItemRow } from '../types/purchase-flow';
import { getStateLabel } from '../utils/inquiry-state';

const customers = ref<Customer[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const expandedCustomerId = ref('');
const contactsByCustomer = ref<Record<string, CustomerContact[]>>({});
const historyByCustomer = ref<Record<string, InquiryItemRow[]>>({});

const requestController = new AbortController();

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		customers.value = await listCustomers(signal);
		await loadCustomerContacts(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户加载失败';
	} finally {
		loading.value = false;
	}
}

async function loadCustomerContacts(signal: AbortSignal) {
	const customerIds = customers.value.map((customer) => customer.id);

	if (customerIds.length === 0) {
		contactsByCustomer.value = {};
		return;
	}

	try {
		const contacts = await listCustomerContacts(customerIds, signal);
		contactsByCustomer.value = groupBy(contacts, (contact) => getRelationId(contact.customer_id));
	} catch {
		contactsByCustomer.value = {};
	}
}

async function remove(id: string) {
	submitting.value = true;
	error.value = '';

	try {
		await deleteCustomer(id, requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户删除失败';
	} finally {
		submitting.value = false;
	}
}

async function toggleStatus(customer: Customer) {
	if (submitting.value) return;

	submitting.value = true;
	error.value = '';

	try {
		const nextStatus = isActive(customer.status) ? 'Inactive' : 'Active';
		await updateCustomerStatus(customer.id, nextStatus, requestController.signal);
		await load(requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户状态更新失败';
	} finally {
		submitting.value = false;
	}
}

async function toggleDetails(customer: Customer) {
	if (expandedCustomerId.value === customer.id) {
		expandedCustomerId.value = '';
		return;
	}

	expandedCustomerId.value = customer.id;

	if (historyByCustomer.value[customer.id]) return;

	try {
		historyByCustomer.value = {
			...historyByCustomer.value,
			[customer.id]: await listCustomerInquiryHistory(customer.id, requestController.signal),
		};
	} catch {
		historyByCustomer.value = { ...historyByCustomer.value, [customer.id]: [] };
	}
}

function getRelationId(value: CustomerContact['customer_id']) {
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

const activeCustomerCount = computed(() => customers.value.filter((customer) => isActive(customer.status)).length);

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
				<p class="eyebrow">Customers</p>
				<h2>客户管理</h2>
			</div>
			<RouterLink class="button-link" to="/customers/new">新增客户</RouterLink>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载客户...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-else-if="customers.length === 0" class="state-card" role="status" aria-live="polite">暂无客户</p>
		<div v-else class="management-stack">
			<section class="summary-strip" aria-label="客户统计">
				<article class="summary-tile"><span>客户总数</span><strong>{{ customers.length }}</strong></article>
				<article class="summary-tile"><span>启用客户</span><strong>{{ activeCustomerCount }}</strong></article>
				<article class="summary-tile"><span>联系人</span><strong>{{ Object.values(contactsByCustomer).flat().length }}</strong></article>
			</section>
			<div class="table-card table-card--wide">
			<table>
				<thead>
					<tr>
						<th scope="col">客户编码</th>
						<th scope="col">客户名称</th>
						<th scope="col">国家</th>
						<th scope="col">地址</th>
						<th scope="col">网站</th>
						<th scope="col">状态</th>
						<th scope="col">备注</th>
						<th scope="col">操作</th>
					</tr>
				</thead>
				<tbody>
					<template v-for="customer in customers" :key="customer.id">
					<tr>
						<td>{{ customer.customer_code || '-' }}</td>
						<td>{{ customer.customer_name || '-' }}</td>
						<td>{{ customer.country || '-' }}</td>
						<td>{{ customer.address || '-' }}</td>
						<td>{{ customer.website || '-' }}</td>
						<td>{{ customer.status || '-' }}</td>
						<td>{{ customer.remark || '-' }}</td>
						<td class="row-actions">
							<button type="button" class="ghost-button" :disabled="submitting" @click="toggleDetails(customer)">
								{{ expandedCustomerId === customer.id ? '收起' : '详情' }}
							</button>
							<button type="button" class="ghost-button" :disabled="submitting" @click="toggleStatus(customer)">
								{{ isActive(customer.status) ? '停用' : '启用' }}
							</button>
							<RouterLink class="text-link" :to="`/customers/${customer.id}/edit`">编辑</RouterLink>
							<button
								type="button"
								class="danger-button"
								:data-test="`delete-${customer.id}`"
								:disabled="submitting"
								@click="remove(customer.id)"
							>
								删除
							</button>
						</td>
					</tr>
					<tr v-if="expandedCustomerId === customer.id" class="detail-row">
						<td colspan="8">
							<div class="management-detail-grid">
								<section>
									<h3>联系人管理</h3>
									<ul v-if="contactsByCustomer[customer.id]?.length" class="mini-list">
										<li v-for="contact in contactsByCustomer[customer.id]" :key="contact.id">
											<strong>{{ contact.name || '-' }}</strong>
											<span>{{ contact.position || '-' }} · {{ contact.phone || contact.email || contact.wechat || '-' }}</span>
										</li>
									</ul>
									<p v-else class="muted">暂无联系人。</p>
								</section>
								<section>
									<h3>客户历史询价</h3>
									<ul v-if="historyByCustomer[customer.id]?.length" class="mini-list">
										<li v-for="item in historyByCustomer[customer.id]" :key="item.id">
											<RouterLink class="text-link" :to="`/inquiry-items/${item.id}/detail`">{{ item.inquiry_no || item.id }}</RouterLink>
											<span>{{ item.product_name || '-' }} · {{ getStateLabel(item.state) }}</span>
										</li>
									</ul>
									<p v-else class="muted">暂无历史询价。</p>
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
