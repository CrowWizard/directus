<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createCustomer } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';
import EntityFormCard from '../components/entity-form-card.vue';
import { customerFields } from './entity-fields';

const router = useRouter();
const submitting = ref(false);
const error = ref('');
const requestController = new AbortController();

async function save(payload: Record<string, unknown>) {
	submitting.value = true;
	error.value = '';

	try {
		await createCustomer(payload, requestController.signal);
		await router.push('/customers');
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '客户创建失败';
	} finally {
		submitting.value = false;
	}
}

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Customers</p>
				<h2>新增客户</h2>
			</div>
		</section>
		<p v-if="error" class="state-card error" role="status" aria-live="polite">{{ error }}</p>
		<div class="form-page">
			<EntityFormCard
				:fields="customerFields"
				primary-label="创建客户"
				:submitting="submitting"
				title="客户信息"
				@cancel="router.push('/customers')"
				@submit="save"
			/>
		</div>
	</AppShell>
</template>
