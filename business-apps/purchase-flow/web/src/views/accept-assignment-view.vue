<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { DIRECTUS_URL } from '../api/http';
import { acceptAssignment } from '../api/purchase-flow';
import AppShell from '../components/app-shell.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref('');
const requestUrl = ref('');

const requestController = new AbortController();

onMounted(async () => {
	const token = String(route.query.token || '');

	if (!token) {
		error.value = '缺少接单 Token。';
		loading.value = false;
		return;
	}

	requestUrl.value = `${DIRECTUS_URL}/purchase-flow-accept/accept-json?token=${token}`;

	try {
		const result = await acceptAssignment(token, requestController.signal);
		await router.replace(`/inquiry-items/${result.inquiry_item_id}/detail`);
	} catch (err) {
		if (err instanceof Error && err.name === 'CanceledError') return;
		error.value = err instanceof Error ? err.message : '接单失败，请确认链接是否有效。';
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => {
	requestController.abort();
});
</script>

<template>
	<AppShell>
		<section class="section-header">
			<div>
				<p class="eyebrow">Accept</p>
				<h2>采购接单</h2>
			</div>
		</section>
		<p v-if="loading" class="state-card" role="status" aria-live="polite" aria-busy="true">正在校验接单链接...</p>
		<section v-else-if="error" class="state-card error" role="status" aria-live="polite">
			<p>{{ error }}</p>
			<p class="muted">请求地址：{{ requestUrl }}</p>
			<p class="muted">请确认前端编译时 VITE_DIRECTUS_URL 指向 Directus 后端，并且后端已安装新版 accept Endpoint。</p>
			<RouterLink class="text-link" to="/tasks">返回我的任务</RouterLink>
		</section>
	</AppShell>
</template>
