<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getCustomer, updateCustomer } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityFormCard from '../components/entity-form-card.vue';
import type { Customer } from '../types/purchase-flow';
import { customerFields } from './entity-fields';

const route = useRoute();
const router = useRouter();
const customer = ref<Customer | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const requestController = new AbortController();

function getId() {
	return String(route.params.id || '');
}

async function load() {
	loading.value = true;
	error.value = '';

	try {
		customer.value = await getCustomer(getId(), requestController.signal);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户加载失败';
	} finally {
		loading.value = false;
	}
}

async function save(payload: Record<string, unknown>) {
	submitting.value = true;
	error.value = '';

	try {
		await updateCustomer(getId(), payload, requestController.signal);
		await router.push('/customers');
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户保存失败';
	} finally {
		submitting.value = false;
	}
}

onMounted(load);

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Customers</p>
				<h2>编辑客户</h2>
			</div>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在加载客户...</p>
		<p v-else-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div v-else class="form-page">
			<EntityFormCard
				:fields="customerFields"
				:initial-item="customer"
				primary-label="保存修改"
				:submitting="submitting"
				title="客户信息"
				@cancel="router.push('/customers')"
				@submit="save"
			/>
		</div>
	</AppShell>
</template>
