<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createCustomer, deleteCustomer, listCustomers, updateCustomer } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityCrudTable from '../components/entity-crud-table.vue';
import type { Customer } from '../types/purchase-flow';

const fields = [
	{ key: 'customer_code', label: '客户编码', autocomplete: 'off' },
	{ key: 'customer_name', label: '客户名称', autocomplete: 'organization' },
	{ key: 'country', label: '国家', autocomplete: 'country-name' },
	{ key: 'address', label: '地址', autocomplete: 'street-address' },
	{ key: 'website', label: '网站', type: 'url' as const, autocomplete: 'url' },
	{ key: 'status', label: '状态', autocomplete: 'off' },
	{ key: 'remark', label: '备注', autocomplete: 'off' },
];

const customers = ref<Customer[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const formVersion = ref(0);

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

async function save(payload: Record<string, unknown>, id: string | null) {
	submitting.value = true;
	error.value = '';

	try {
		const signal = requestController.signal;
		if (id) await updateCustomer(id, payload, signal);
		else await createCustomer(payload, signal);

		formVersion.value += 1;
		await load(signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户保存失败';
	} finally {
		submitting.value = false;
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
		</section>
		<EntityCrudTable
			:error="error"
			:fields="fields"
			:items="customers"
			:loading="loading"
			:reset-key="formVersion"
			:submitting="submitting"
			title="客户"
			@delete="remove"
			@submit="save"
		/>
	</AppShell>
</template>
