<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { deleteCustomer, listCustomers } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import type { Customer } from '../types/purchase-flow';

const customers = ref<Customer[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

const requestController = new AbortController();

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		customers.value = await listCustomers(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户加载失败';
	} finally {
		loading.value = false;
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
		<div v-else class="table-card table-card--wide">
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
					<tr v-for="customer in customers" :key="customer.id">
						<td>{{ customer.customer_code || '-' }}</td>
						<td>{{ customer.customer_name || '-' }}</td>
						<td>{{ customer.country || '-' }}</td>
						<td>{{ customer.address || '-' }}</td>
						<td>{{ customer.website || '-' }}</td>
						<td>{{ customer.status || '-' }}</td>
						<td>{{ customer.remark || '-' }}</td>
						<td class="row-actions">
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
				</tbody>
			</table>
		</div>
	</AppShell>
</template>
