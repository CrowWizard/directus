<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { deleteSupplier, listSuppliers } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import type { Supplier } from '../types/purchase-flow';

const suppliers = ref<Supplier[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

const requestController = new AbortController();

async function load(signal: AbortSignal) {
	loading.value = true;
	error.value = '';

	try {
		suppliers.value = await listSuppliers(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '供应商加载失败';
	} finally {
		loading.value = false;
	}
}

async function remove(id: string) {
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
			<RouterLink class="button-link" to="/suppliers/new">新增供应商</RouterLink>
		</section>

		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载供应商...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<p v-else-if="suppliers.length === 0" class="state-card" role="status" aria-live="polite">暂无供应商</p>
		<div v-else class="table-card table-card--wide">
			<table>
				<thead>
					<tr>
						<th scope="col">供应商编码</th>
						<th scope="col">供应商名称</th>
						<th scope="col">类型</th>
						<th scope="col">国家</th>
						<th scope="col">税率</th>
						<th scope="col">付款条件</th>
						<th scope="col">网站</th>
						<th scope="col">状态</th>
						<th scope="col">备注</th>
						<th scope="col">操作</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="supplier in suppliers" :key="supplier.id">
						<td>{{ supplier.supplier_code || '-' }}</td>
						<td>{{ supplier.supplier_name || '-' }}</td>
						<td>{{ supplier.supplier_type || '-' }}</td>
						<td>{{ supplier.country || '-' }}</td>
						<td class="cell-numeric">{{ supplier.tax_rate ?? '-' }}</td>
						<td>{{ supplier.payment_term || '-' }}</td>
						<td>{{ supplier.website || '-' }}</td>
						<td>{{ supplier.status || '-' }}</td>
						<td>{{ supplier.remark || '-' }}</td>
						<td class="row-actions">
							<RouterLink class="text-link" :to="`/suppliers/${supplier.id}/edit`">编辑</RouterLink>
							<button
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
				</tbody>
			</table>
		</div>
	</AppShell>
</template>
